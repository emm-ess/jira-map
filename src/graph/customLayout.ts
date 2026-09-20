import type {
    Collection,
    LayoutEventObject,
    Position,
    SingularElementArgument,
} from 'cytoscape'

import {canonicalizeDirection, nearestDirection} from './layoutHelper.ts'

/*
 * Schematic line-map layout
 * -------------------------
 *
 *   fcose → line rasterization → fit
 *
 * Station nodes (`data.line`) are chained by segment edges (`data.type ===
 * 'segment'`, `data.area` = line id).  Intersection nodes are compound parents
 * whose children are transfer stations; clustering them is handled separately
 * by `getIntersectionRestrictions`/`moveStationsAccordingToRestrictions` in
 * `layoutHelper.ts`, not by this file. Lines crossing in open space (no
 * shared station) are left alone — that's normal on a real schematic map,
 * not a defect to resolve.
 *
 * Directions are the eight compass vectors in DIRECTIONS.  A line's `lane` is
 * the snapped projection onto the perpendicular axis (raw, non-unit; see `basis`).
 */

const GRID_SIZE = 120

type Edge = ReturnType<Collection['edges']>[number]
type Positions = Map<string, Position>

type LineGeometry = {
    id: string
    edges: Edge[]
    stationIds: string[]
    direction: Position
    lane: number
}

type LayoutWithElements = {
    options?: {
        eles?: Collection
    }
}

// --- vectors ----------------------------------------------------------------

function copy(position: Position): Position {
    return {x: position.x, y: position.y}
}

function dot(a: Position, b: Position): number {
    return a.x * b.x + a.y * b.y
}

function add(a: Position, b: Position): Position {
    return {x: a.x + b.x, y: a.y + b.y}
}

function scale(vector: Position, factor: number): Position {
    return {x: vector.x * factor, y: vector.y * factor}
}

function snap(value: number): number {
    return Math.round(value / GRID_SIZE) * GRID_SIZE
}

/**
 * Raw (non-unit) along/across axes for an 8-compass direction. `along` is
 * the direction itself; `across` is its 90° rotation. Components stay in
 * {-1, 0, 1}, so scale(along|across, snap(...)) always lands on an exact
 * multiple of GRID_SIZE on both x and y — one shared grid for every line,
 * regardless of direction. Diagonal lines get √2×-longer gaps between
 * stations/lanes than horizontal or vertical ones; that's expected for an
 * octilinear schematic map, not a bug.
 */
function basis(direction: Position): {along: Position; across: Position} {
    return {along: direction, across: {x: -direction.y, y: direction.x}}
}

function getMedian(values: number[]): number {
    if (values.length === 0) {
        return 0
    }
    const sorted = values.toSorted((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? 0
}

// --- input helpers ----------------------------------------------------------

function getLayoutElements(event: LayoutEventObject): Collection | undefined {
    return (event.layout as LayoutWithElements).options?.eles
}

function snapshotPositions(elements: Collection): Positions {
    return new Map(elements.nodes().map((node) => [node.id(), copy(node.position())]))
}

function applyPositions(elements: Collection, positions: Positions): void {
    for (const node of elements.nodes()) {
        const next = positions.get(node.id())
        if (next) {
            node.position(next)
        }
    }
}

function getSegmentEdges(elements: Collection): SingularElementArgument[] {
    return elements.edges().filter((edge) => edge.data('type') === 'segment').toArray()
}

// --- line geometry ----------------------------------------------------------

function sortLineEdges(edges: Edge[]): Edge[] {
    // Order by sprint along the line; negative sprint ids are future endpoints.
    return edges.toSorted((edgeA, edgeB) => {
        const sprintA = Number(edgeA.source().data('sprintId'))
        const sprintB = Number(edgeB.source().data('sprintId'))
        const rankA = sprintA < 0
            ? Number.POSITIVE_INFINITY
            : sprintA
        const rankB = sprintB < 0
            ? Number.POSITIVE_INFINITY
            : sprintB
        return rankA - rankB
    })
}

/** Station ids in path order: source of first edge, then each target. */
function orderedStationIds(edges: Edge[]): string[] {
    const first = edges[0]
    if (!first) {
        return []
    }
    return [first.source().id(), ...edges.map((edge) => edge.target().id())]
}

function directionKey(direction: Position): string {
    return `${String(direction.x)},${String(direction.y)}`
}

function buildLines(elements: Collection, positions: Positions): LineGeometry[] {
    const byLine = new Map<string, Edge[]>()
    for (const edge of getSegmentEdges(elements)) {
        const lineId = edge.data('line') as string
        const group = byLine.get(lineId)
        if (group) {
            group.push(edge)
        }
        else {
            byLine.set(lineId, [edge])
        }
    }

    return [...byLine.entries()].map(([id, edges]) => {
        const sorted = sortLineEdges(edges)
        const stationIds = orderedStationIds(sorted)
        const first = sorted[0]
        const last = sorted.at(-1)
        const from = first
            ? positions.get(first.source().id()) ?? first.source().position()
            : {x: 0, y: 0}
        const to = last
            ? positions.get(last.target().id()) ?? last.target().position()
            : from
        const direction = canonicalizeDirection(nearestDirection(from, to))
        const {across} = basis(direction)
        const lane = snap(getMedian(stationIds.map((stationId) => {
            const position = positions.get(stationId)
            return position
                ? dot(position, across)
                : 0
        })))
        return {id, edges: sorted, stationIds, direction, lane}
    })
}

function separateParallelLanes(lines: LineGeometry[]): void {
    const groups = new Map<string, LineGeometry[]>()
    for (const line of lines) {
        const key = directionKey(line.direction)
        const group = groups.get(key)
        if (group) {
            group.push(line)
        }
        else {
            groups.set(key, [line])
        }
    }
    for (const group of groups.values()) {
        group.sort((a, b) => a.lane - b.lane)
        for (let index = 1; index < group.length; index++) {
            const current = group[index]
            const previous = group[index - 1]
            if (!current || !previous) {
                continue
            }
            current.lane = Math.max(current.lane, previous.lane + GRID_SIZE)
        }
    }
}

/**
 * Project stations onto direction + lane. `along`/`across` are raw compass
 * vectors (see `basis`), so `scale(along, progress)` and the lane offset are
 * each an exact multiple of GRID_SIZE — every station lands on the same grid
 * regardless of which line placed it. Diagonal lines get √2×-longer
 * Euclidean gaps between stations than horizontal/vertical ones; that's
 * correct for a schematic map, not something to normalize away.
 */
function rasterizeLine(line: LineGeometry, positions: Positions, output: Positions): void {
    const {along, across} = basis(line.direction)
    const laneOffset = scale(across, line.lane)
    let previousProgress = Number.NEGATIVE_INFINITY

    for (const stationId of line.stationIds) {
        const original = positions.get(stationId)
        if (!original) {
            continue
        }
        let progress = snap(dot(original, along))
        // Keep station order and avoid stacking two stops on the same grid point.
        progress = Math.max(progress, previousProgress + GRID_SIZE)
        previousProgress = progress
        output.set(stationId, add(scale(along, progress), laneOffset))
    }
}

/** Returns whether any station actually moved. */
export function applySchematicGeometry(elements: Collection): boolean {
    const positions = snapshotPositions(elements)
    const lines = buildLines(elements, positions)
    separateParallelLanes(lines)

    const next = new Map<string, Position>()
    for (const line of lines) {
        rasterizeLine(line, positions, next)
    }
    applyPositions(elements, next)

    return [...next].some(([id, position]) => {
        const original = positions.get(id)
        return original?.x !== position.x || original?.y !== position.y
    })
}

// --- pipeline ---------------------------------------------------------------

export function onLayoutStop(event: LayoutEventObject): void {
    const elements = getLayoutElements(event)
    if (!elements) {
        return
    }
    applySchematicGeometry(elements)
    elements.cy().fit(elements, 30)
}
