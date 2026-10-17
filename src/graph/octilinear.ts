import type {Position} from 'cytoscape'

/*
 * Octilinear layout
 * -----------------
 *
 * Turns a "real looking" layout into the look of a transit map: every track
 * runs horizontally, vertically or at 45°.
 *
 * Idea (from the magnetic force of Chivers and Rodgers, used in MetroSets,
 * arXiv 2008.09367): turn every track about its midpoint to the nearest of
 * the eight octilinear directions. Here that is done as an exact projection,
 * track after track, round after round, and a light repulsion keeps nodes
 * from piling up. Measured on the real data this beat the original recipe of
 * fading springs out and the magnet in first: fewer new crossings, simpler.
 *
 * Tracks that form loops whose directions can't all hold at once stay a few
 * degrees off. Nothing is guaranteed, so check `octilinearError`.
 */

export type OctilinearOptions = {
    /** Wanted length of a track (default: the median of the current ones). */
    idealLength?: number
    /** How often every track is turned (default 400). */
    rounds?: number
    /**
     * Radius of each node (same order as the positions): nodes are kept at least
     * the sum of their radii apart, so a big interchange doesn't run into its
     * neighbours. Default 0 for all.
     */
    radii?: number[]
}

type Link = {source: number, target: number}

const OCTILINEAR_ANGLE = Math.PI / 4

/** Nodes closer than this (times the ideal length) are pushed apart. */
const REPULSION_RANGE = 0.35
/** Share of a track's length error corrected per round: tracks may drift in length, but not far. */
const LENGTH_CORRECTION = 0.1
/** Share of the way to the octilinear position taken per round. */
const RELAXATION = 0.5

function trackLength(a: Position, b: Position): number {
    return Math.hypot(b.x - a.x, b.y - a.y)
}

export function median(values: number[]): number {
    const sorted = values.toSorted((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? 0
}

/** Angle (radians) of the octilinear direction closest to the track from a to b. */
function nearestOctilinearAngle(a: Position, b: Position): number {
    return Math.round(Math.atan2(b.y - a.y, b.x - a.x) / OCTILINEAR_ANGLE) * OCTILINEAR_ANGLE
}

/** How far (degrees) a track is from the nearest octilinear direction. */
export function octilinearError(a: Position, b: Position): number {
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    return Math.abs(angle - nearestOctilinearAngle(a, b)) * 180 / Math.PI
}

/** Turns one track (in place) towards its nearest octilinear direction, about its midpoint. */
function turnTrack(a: Position, b: Position, idealLength: number): void {
    const length = trackLength(a, b)
    const half = (length + (idealLength - length) * LENGTH_CORRECTION) / 2
    const angle = nearestOctilinearAngle(a, b)
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    const dx = Math.cos(angle) * half
    const dy = Math.sin(angle) * half
    a.x += (midX - dx - a.x) * RELAXATION
    a.y += (midY - dy - a.y) * RELAXATION
    b.x += (midX + dx - b.x) * RELAXATION
    b.y += (midY + dy - b.y) * RELAXATION
}

/** Moves nodes closer than `range` (or the sum of their radii, if larger) apart (in place), pair by pair. */
function separateNodes(positions: Position[], range: number, radii: number[]): void {
    for (const [i, a] of positions.entries()) {
        for (let j = i + 1; j < positions.length; j++) {
            const b = positions[j]
            const length = b
                ? trackLength(a, b) || 1e-9
                : range
            const wanted = Math.max(range, (radii[i] ?? 0) + (radii[j] ?? 0))
            if (b && length < wanted) {
                const push = (wanted - length) / 2 / length
                const dx = (a.x - b.x) * push
                const dy = (a.y - b.y) * push
                a.x += dx
                a.y += dy
                b.x -= dx
                b.y -= dy
            }
        }
    }
}

/**
 * Moves the nodes so every track is (nearly) octilinear and of the wanted
 * length, disturbing the given layout as little as it can. Returns new positions.
 */
export function octilinearLayout(
    start: Position[],
    links: Link[],
    {idealLength, rounds = 400, radii = []}: OctilinearOptions = {},
): Position[] {
    const length = idealLength ?? median(links.flatMap(({source, target}) => {
        const a = start[source]
        const b = start[target]
        return a && b
            ? [trackLength(a, b)]
            : []
    }))
    const positions = start.map(({x, y}) => ({x, y}))
    for (let round = 0; round < rounds; round++) {
        for (const {source, target} of links) {
            const a = positions[source]
            const b = positions[target]
            if (a && b) {
                turnTrack(a, b, length)
            }
        }
        separateNodes(positions, length * REPULSION_RANGE, radii)
    }
    return positions
}
