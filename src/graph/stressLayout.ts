import type {Position} from 'cytoscape'

/*
 * Stress layout
 * -------------
 *
 * Places nodes so that the distance between every two nodes on the page is as
 * close as possible to a wanted distance (here: the number of stops between
 * them). Compared to a force layout this gives what a transit map looks like:
 * even spacing, no edge stretched across the whole map, a dense centre with
 * long arms. It is the usual way to get a first embedding for a metro map
 * from a network without geography (MetroSets, arXiv 2008.09367).
 *
 * The solver is the localized stress majorization of Gansner, Koren and North
 * (2004): every node moves to the weighted average of where each other node
 * says it should be, with weight 1 / distance².
 */

export type StressOptions = {
    /** Upper bound of majorization steps per start (default 300). */
    iterations?: number
    /** Random starts; the one with the least stress wins (default 4). */
    restarts?: number
    /** Seed for the starts, so the same input gives the same map (default 1). */
    seed?: number
}

type Link = {source: number, target: number}

/** Hop distances between all nodes (`Infinity` where there is no path). */
export function graphDistances(nodeCount: number, links: Link[]): number[][] {
    const neighbours: number[][] = Array.from({length: nodeCount}, () => [])
    for (const {source, target} of links) {
        neighbours[source]?.push(target)
        neighbours[target]?.push(source)
    }
    return Array.from({length: nodeCount}, (_, start) => {
        const distances = Array.from({length: nodeCount}, () => Number.POSITIVE_INFINITY)
        distances[start] = 0
        const queue = [start]
        for (const node of queue) {
            const next = (distances[node] ?? 0) + 1
            for (const neighbour of neighbours[node] ?? []) {
                if ((distances[neighbour] ?? 0) === Number.POSITIVE_INFINITY) {
                    distances[neighbour] = next
                    queue.push(neighbour)
                }
            }
        }
        return distances
    })
}

/**
 * Unreachable pairs get one hop more than the longest real distance, so
 * separate networks end up next to each other instead of on top of each other.
 */
export function closeGaps(distances: number[][]): number[][] {
    // A loop, not Math.max(...all): spreading a whole table as arguments overflows the stack for ~120 000+ cells (~350 nodes).
    let longest = 1
    for (const row of distances) {
        for (const distance of row) {
            if (Number.isFinite(distance) && distance > longest) {
                longest = distance
            }
        }
    }
    return distances.map((row) => row.map((distance) => Number.isFinite(distance)
        ? distance
        : longest + 1))
}

/** Small deterministic random numbers in [0, 1) (mulberry32). */
function randomNumbers(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6D_2B_79_F5) >>> 0
        let mixed = Math.imul(state ^ (state >>> 15), state | 1)
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
    }
}

/*
 * The solver works on flat number arrays (all wanted distances in one array,
 * x and y of all nodes in two more), not on one object per node: it is the
 * hot loop, n² work per step, and the objects made it about 4× slower.
 */

type Layout = {xs: Float64Array, ys: Float64Array}

function flatten(wanted: number[][]): Float64Array {
    const size = wanted.length
    const flat = new Float64Array(size * size)
    for (const [i, row] of wanted.entries()) {
        for (const [j, distance] of row.entries()) {
            flat[i * size + j] = distance
        }
    }
    return flat
}

function stressOfFlat(size: number, wanted: Float64Array, {xs, ys}: Layout): number {
    let stress = 0
    for (let i = 0; i < size; i++) {
        for (let j = i + 1; j < size; j++) {
            const target = wanted[i * size + j] ?? 0
            if (target > 0) {
                const dx = (xs[i] ?? 0) - (xs[j] ?? 0)
                const dy = (ys[i] ?? 0) - (ys[j] ?? 0)
                // eslint-disable-next-line unicorn/prefer-modern-math-apis -- hot loop: Math.hypot is much slower
                const error = (Math.sqrt(dx * dx + dy * dy) - target) / target
                stress += error * error
            }
        }
    }
    return stress
}

/** One majorization step: every node jumps to the weighted average of the others' wishes. */
function majorize(size: number, wanted: Float64Array, {xs, ys}: Layout): Layout {
    const nextXs = new Float64Array(size)
    const nextYs = new Float64Array(size)
    for (let i = 0; i < size; i++) {
        const hereX = xs[i] ?? 0
        const hereY = ys[i] ?? 0
        let weightSum = 0
        let x = 0
        let y = 0
        for (let j = 0; j < size; j++) {
            const target = wanted[i * size + j] ?? 0
            if (i !== j && target > 0) {
                const thereX = xs[j] ?? 0
                const thereY = ys[j] ?? 0
                const dx = hereX - thereX
                const dy = hereY - thereY
                // eslint-disable-next-line unicorn/prefer-modern-math-apis -- hot loop: Math.hypot is much slower
                const scale = target / (Math.sqrt(dx * dx + dy * dy) || 1e-9)
                const weight = 1 / (target * target)
                x += weight * (thereX + dx * scale)
                y += weight * (thereY + dy * scale)
                weightSum += weight
            }
        }
        nextXs[i] = weightSum > 0
            ? x / weightSum
            : hereX
        nextYs[i] = weightSum > 0
            ? y / weightSum
            : hereY
    }
    return {xs: nextXs, ys: nextYs}
}

function toPositions({xs, ys}: Layout): Position[] {
    return Array.from(xs, (x, index) => ({x, y: ys[index] ?? 0}))
}

/** Weighted squared difference between drawn and wanted distances (lower is better). */
export function stressOf(wanted: number[][], positions: Position[]): number {
    return stressOfFlat(positions.length, flatten(wanted), {
        xs: Float64Array.from(positions, (position) => position.x),
        ys: Float64Array.from(positions, (position) => position.y),
    })
}

/**
 * `wanted[i][j]` is the distance node i and j should have (finite, symmetric,
 * zero on the diagonal). Returns one position per node, in the same unit.
 */
export function stressLayout(wanted: number[][], {iterations = 300, restarts = 4, seed = 1}: StressOptions = {}): Position[] {
    const size = wanted.length
    const flat = flatten(wanted)
    const random = randomNumbers(seed)
    const spread = Math.sqrt(size) * 2
    let best: {layout: Layout, stress: number} | undefined
    for (let start = 0; start < restarts; start++) {
        const xs = new Float64Array(size)
        const ys = new Float64Array(size)
        for (let i = 0; i < size; i++) {
            xs[i] = random() * spread
            ys[i] = random() * spread
        }
        let layout: Layout = {xs, ys}
        let stress = stressOfFlat(size, flat, layout)
        // Stress only decreases, so checking it every few steps is enough to see it settle.
        for (let step = 1; step <= iterations; step++) {
            layout = majorize(size, flat, layout)
            if (step % 10 === 0) {
                const next = stressOfFlat(size, flat, layout)
                const settled = stress - next < stress * 1e-4
                stress = next
                if (settled) {
                    break
                }
            }
        }
        if (!best || stress < best.stress) {
            best = {layout, stress}
        }
    }
    return best
        ? toPositions(best.layout)
        : []
}
