import type {
    Collection,
    LayoutEventObject,
    Position,
} from 'cytoscape'
import type {FcoseAlignmentConstraint} from 'cytoscape-fcose'

import {
    canonicalizeDirection,
    centroid,
    type Constraints,
    mergeConstraints,
    nearestDirection,
    type RestrictionOrder,
    sortRestrictions,
} from './layoutHelper.ts'

/*
 * Schematic line-map layout
 * -------------------------
 *
 *   fcose → line straightening → fit
 *
 * Station nodes (`data.line`) are chained by segment edges (`data.type ===
 * 'segment'`, `data.line` = line id).  Intersection nodes are compound parents
 * whose children are transfer stations — one per line passing through that
 * interchange. Lines crossing in open space (no shared station) are left
 * alone — that's normal on a real schematic map, not a defect to resolve.
 *
 * There is no shared grid. Each line is straightened into one or more
 * segments — maximal runs of consecutive stations that already point the
 * same one of the 8 compass directions (DIRECTIONS in layoutHelper.ts) in
 * the fcose layout. A segment can be as short as one edge (2 stations) or
 * the whole line; wherever two segments meet, the line bends by a multiple
 * of 45° (the angle between two of the 8 compass directions). Each station
 * keeps its original distance to the previous one, just redirected onto its
 * segment's exact compass angle, so the line's overall shape/spacing stays
 * close to what fcose produced — only the bends get straightened.
 *
 * Straightening lines independently pulls interchange siblings apart, so
 * `applyIntersectionClustering` is a second, independently-triggered pass
 * that re-clusters each intersection's station children around their shared
 * centroid, grouped by approach direction. It reads whatever positions are
 * current at call time — no dependency on `applySchematicGeometry` having
 * just run. The centre of an interchange is the centroid of its stations and
 * the places are arranged so that their centroid is that centre too: a fixed
 * point, running it again changes nothing. Stations that already stand on
 * the places (in any order, e.g. after `applyLineUntangling`) are left where
 * they are, so clustering never undoes the order chosen there. Separate
 * from, and untouched by either of them:
 * `getIntersectionRestrictions`/`moveStationsAccordingToRestrictions` in
 * `layoutHelper.ts`, a coarser, bounding-box-based alternative kept as its
 * own tool.
 *
 * Which line gets which place at an interchange is a separate question
 * (`applyLineUntangling`, untangle.ts).
 *
 * `getLineRestrictions`/`applyLineAlignment` are the between-intersections
 * counterpart of the intersection restrictions in `layoutHelper.ts`: every
 * horizontal or vertical stretch of a line, as it currently lies, becomes an
 * alignment (plus ordering) restriction for the next fcose run, or can be
 * snapped onto directly. Both restriction sets are combined with
 * `mergeConstraints`, which resolves contradictions between them — the order
 * restrictions are resolved in (`RestrictionOrder`) decides which of two
 * conflicting ones survives.
 */

const MIN_STATION_SPACING = 40

type Edge = ReturnType<Collection['edges']>[number]
export type Positions = Map<string, Position>

export type Line = {
    id: string
    stationIds: string[]
}

type Segment = {
    direction: Position
    stationIds: string[]
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

function add(a: Position, b: Position): Position {
    return {x: a.x + b.x, y: a.y + b.y}
}

function dot(a: Position, b: Position): number {
    return a.x * b.x + a.y * b.y
}

function scale(vector: Position, factor: number): Position {
    return {x: vector.x * factor, y: vector.y * factor}
}

function distance(a: Position, b: Position): number {
    return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Unit vector for one of the 8 compass directions from `nearestDirection`. */
function unit(direction: Position): Position {
    const length = Math.hypot(direction.x, direction.y) || 1
    return {x: direction.x / length, y: direction.y / length}
}

// --- input helpers ----------------------------------------------------------

function getLayoutElements(event: LayoutEventObject): Collection | undefined {
    return (event.layout as LayoutWithElements).options?.eles
}

export function snapshotPositions(elements: Collection): Positions {
    return new Map(elements.nodes().map((node) => [node.id(), copy(node.position())]))
}

export function applyPositions(elements: Collection, positions: Positions): void {
    for (const node of elements.nodes()) {
        const next = positions.get(node.id())
        if (next) {
            node.position(next)
        }
    }
}

/** Entries of `after` whose coordinates differ from `before` (or are new). */
export function changedPositions(before: Positions, after: Positions): Positions {
    return new Map([...after].filter(([id, position]) => {
        const original = before.get(id)
        return original?.x !== position.x || original?.y !== position.y
    }))
}

function getSegmentEdges(elements: Collection): Edge[] {
    return elements.edges('[type="segment"]').toArray()
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

export function buildLines(elements: Collection): Line[] {
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

    return [...byLine.entries()].map(([id, edges]) => ({
        id,
        stationIds: orderedStationIds(sortLineEdges(edges)),
    }))
}

/**
 * Split a line's stations into maximal straight runs. Each run keeps the
 * compass direction (one of the 8 in DIRECTIONS) of its edges; a new segment
 * starts wherever that direction changes, sharing the bend station with the
 * previous segment so the line stays connected.
 */
function buildSegments(stationIds: string[], positions: Positions): Segment[] {
    const segments: Segment[] = []
    let currentDirection: Position | undefined
    let currentStations: string[] = []

    for (let index = 1; index < stationIds.length; index++) {
        const fromId = stationIds[index - 1]
        const toId = stationIds[index]
        const from = fromId
            ? positions.get(fromId)
            : undefined
        const to = toId
            ? positions.get(toId)
            : undefined
        if (!fromId || !toId || !from || !to) {
            continue
        }

        const direction = nearestDirection(from, to)
        if (currentDirection && direction !== currentDirection) {
            segments.push({direction: currentDirection, stationIds: currentStations})
            currentStations = [fromId]
        }
        if (currentStations.length === 0) {
            currentStations.push(fromId)
        }
        currentStations.push(toId)
        currentDirection = direction
    }

    if (currentDirection && currentStations.length > 1) {
        segments.push({direction: currentDirection, stationIds: currentStations})
    }

    return segments
}

/**
 * Walk each segment forward from its shared bend station, redirecting every
 * step onto the segment's exact compass angle while keeping the original
 * distance between consecutive stations — straightens bends without forcing
 * stations onto any shared grid.
 */
function rasterizeLine(stationIds: string[], positions: Positions, output: Positions): void {
    const first = stationIds[0]
    const anchor = first
        ? positions.get(first)
        : undefined
    if (!first || !anchor) {
        return
    }
    output.set(first, copy(anchor))
    let cursor = anchor

    for (const segment of buildSegments(stationIds, positions)) {
        const along = unit(segment.direction)
        for (let index = 1; index < segment.stationIds.length; index++) {
            const stationId = segment.stationIds[index]
            const previousId = segment.stationIds[index - 1]
            const original = stationId
                ? positions.get(stationId)
                : undefined
            const previousOriginal = previousId
                ? positions.get(previousId)
                : undefined
            if (!stationId || !original || !previousOriginal) {
                continue
            }
            const step = Math.max(distance(previousOriginal, original), MIN_STATION_SPACING)
            cursor = add(cursor, scale(along, step))
            output.set(stationId, copy(cursor))
        }
    }
}

/** Returns whether any station actually moved. */
export function applySchematicGeometry(elements: Collection): boolean {
    const positions = snapshotPositions(elements)
    const lines = buildLines(elements)

    const next = new Map<string, Position>()
    for (const line of lines) {
        rasterizeLine(line.stationIds, positions, next)
    }
    applyPositions(elements, next)

    return [...next].some(([id, position]) => {
        const original = positions.get(id)
        return original?.x !== position.x || original?.y !== position.y
    })
}

// --- intersection clustering -------------------------------------------------

const INTERSECTION_GAP = 10
/** Closer than this (pixels) counts as the same place. */
const SAME_PLACE = 1e-6
/** Fallback approach axis for a station whose line has no edges to derive one from. */
const DEFAULT_APPROACH_AXIS: Position = {x: 1, y: 0}

function rotate90(vector: Position): Position {
    return {x: -vector.y, y: vector.x}
}

function directionKey(direction: Position): string {
    return `${String(direction.x)},${String(direction.y)}`
}

/**
 * Compass direction from one place to another; `undefined` if they are the
 * same place. A rounding error between "the same" places must not pick a
 * direction, or running the clustering twice would give two answers.
 */
function directionBetween(from: Position, to: Position): Position | undefined {
    return distance(from, to) < SAME_PLACE
        ? undefined
        : nearestDirection(from, to)
}

/**
 * Direction a station's own line runs through it, from current positions:
 * the edge to the next station, or the edge from the previous one at a
 * line's end. `undefined` for a single-station line (nothing to derive a
 * direction from) or when the neighbours stand on the same place.
 */
function stationApproachDirection(stationIds: string[], index: number, positions: Positions): Position | undefined {
    const current = stationIds[index]
    const currentPosition = current
        ? positions.get(current)
        : undefined
    if (!currentPosition) {
        return undefined
    }

    const next = stationIds[index + 1]
    const nextPosition = next
        ? positions.get(next)
        : undefined
    const towardsNext = nextPosition
        ? directionBetween(currentPosition, nextPosition)
        : undefined
    if (towardsNext) {
        return towardsNext
    }

    const previous = stationIds[index - 1]
    const previousPosition = previous
        ? positions.get(previous)
        : undefined
    return previousPosition
        ? directionBetween(previousPosition, currentPosition)
        : undefined
}

/** Every station's approach direction, keyed by station id; omits stations with none. */
function computeApproachDirections(lines: Line[], positions: Positions): Map<string, Position> {
    const directions = new Map<string, Position>()
    for (const line of lines) {
        for (const [index, stationId] of line.stationIds.entries()) {
            const direction = stationApproachDirection(line.stationIds, index, positions)
            if (direction) {
                directions.set(stationId, direction)
            }
        }
    }
    return directions
}

/** Partitions station ids into the (up to 4) canonical compass axes they approach an intersection on. */
function groupStationsByAxis(stationIds: string[], directions: Map<string, Position>): Map<string, Segment> {
    const groups = new Map<string, Segment>()
    for (const stationId of stationIds) {
        const direction = canonicalizeDirection(directions.get(stationId) ?? DEFAULT_APPROACH_AXIS)
        const key = directionKey(direction)
        const group = groups.get(key)
        if (group) {
            group.stationIds.push(stationId)
        }
        else {
            groups.set(key, {direction, stationIds: [stationId]})
        }
    }
    return groups
}

/** Station ids ordered along `perpendicular`, so placement preserves their current visual order. */
function sortByPerpendicularProjection(stationIds: string[], perpendicular: Position, positions: Positions): string[] {
    return stationIds.toSorted((a, b) => {
        const positionA = positions.get(a)
        const positionB = positions.get(b)
        const projectionA = positionA
            ? dot(positionA, perpendicular)
            : 0
        const projectionB = positionB
            ? dot(positionB, perpendicular)
            : 0
        return projectionA - projectionB
    })
}

/**
 * `count` offsets spaced exactly `gap` apart, symmetric around 0 — but never
 * exactly 0, so two differently-oriented groups (each on its own line
 * through the shared center) never place a station on the other's
 * line-crossing point. An odd count would otherwise put its middle member
 * exactly at 0; shifting the whole run by half a gap avoids that while
 * keeping every neighbor exactly `gap` apart.
 */
function computeSymmetricOffsets(count: number, gap: number): number[] {
    const isOdd = count % 2 === 1
    const oddShift = isOdd
        ? gap / 2
        : 0
    return Array.from({length: count}, (_, index) => (index - (count - 1) / 2) * gap + oddShift)
}

/** Places one axis-group's stations symmetrically around `center`, perpendicular to its approach direction. */
function placeAxisGroup(group: Segment, center: Position, gap: number, positions: Positions, output: Positions): void {
    const perpendicular = unit(rotate90(group.direction))
    const ordered = sortByPerpendicularProjection(group.stationIds, perpendicular, positions)
    const offsets = computeSymmetricOffsets(ordered.length, gap)
    for (const [index, stationId] of ordered.entries()) {
        output.set(stationId, add(center, scale(perpendicular, offsets[index] ?? 0)))
    }
}

/** Whether the stations stand on exactly these places, in any order (up to `tolerance`). */
function standOnPlaces(current: Position[], places: Position[], tolerance = 1e-6): boolean {
    const free = [...places]
    return current.every((position) => {
        const index = free.findIndex((place) => distance(position, place) <= tolerance)
        return index !== -1 && free.splice(index, 1).length === 1
    })
}

/** The stations of every interchange (at least two) that have a position, with their centre. */
function knownInterchanges(elements: Collection, positions: Positions): {stations: {id: string, position: Position}[], center: Position}[] {
    return elements.nodes('[type="intersection"]').toArray().flatMap((interchange) => {
        const stations = interchange.children('[type="station"]').toArray().flatMap((child) => {
            const position = positions.get(child.id())
            return position
                ? [{id: child.id(), position}]
                : []
        })
        const center = centroid(stations.map((station) => station.position))
        return center && stations.length >= 2
            ? [{stations, center}]
            : []
    })
}

/**
 * Re-clusters each intersection's station children around their shared
 * centroid, grouped by approach direction, so an interchange reads as one
 * stop instead of wherever each independently-straightened line left its
 * own sibling. Only an intersection's own children move — the rest of each
 * line stays put, which can leave a small kink immediately outside it.
 *
 * Approach directions are measured from the centre of an interchange, not
 * from the place a station happens to stand on, and an interchange whose
 * stations already stand on exactly the places computed here (in any order)
 * is left alone. So running this again does not undo `applyLineUntangling`,
 * which swaps stations between places. Returns whether any station moved.
 */
export function applyIntersectionClustering(elements: Collection): boolean {
    const positions = snapshotPositions(elements)
    const interchanges = knownInterchanges(elements, positions)

    const anchored = new Map(positions)
    for (const {stations, center} of interchanges) {
        for (const station of stations) {
            anchored.set(station.id, center)
        }
    }
    const directions = computeApproachDirections(buildLines(elements), anchored)

    const next = new Map<string, Position>()
    for (const {stations, center} of interchanges) {
        const arranged: Positions = new Map()
        for (const group of groupStationsByAxis(stations.map((station) => station.id), directions).values()) {
            placeAxisGroup(group, {x: 0, y: 0}, INTERSECTION_GAP, positions, arranged)
        }
        // Odd-sized groups are shifted by half a gap, so the arrangement is not centred on its
        // origin. Move it so that its centroid is the interchange's current centroid: a fixed point,
        // running this again finds the same centre and changes nothing.
        const offset = centroid([...arranged.values()]) ?? {x: 0, y: 0}
        const places: Positions = new Map([...arranged].map(([id, place]) => [id, add(place, {x: center.x - offset.x, y: center.y - offset.y})]))
        if (!standOnPlaces(stations.map((station) => station.position), [...places.values()])) {
            for (const [id, place] of places) {
                next.set(id, place)
            }
        }
    }
    applyPositions(elements, next)

    return changedPositions(positions, next).size > 0
}

// --- line restrictions ---------------------------------------------------------

/**
 * Alignment + ordering restrictions for one straight segment. Only horizontal
 * and vertical segments give any — fcose can't express diagonals, which are
 * left to `applySchematicGeometry`. Ordering follows the segment's travel
 * direction so the line can't fold back on itself.
 */
function segmentRestrictions({direction, stationIds}: Segment, gap: number): Constraints {
    const horizontal = direction.y === 0
    if (!horizontal && direction.x !== 0) {
        return {alignmentConstraint: {}, relativePlacementConstraint: []}
    }
    const forward = horizontal
        ? direction.x > 0
        : direction.y > 0
    const placements = stationIds.flatMap((first, index) => {
        const second = stationIds[index + 1]
        if (second === undefined) {
            return []
        }
        const [before, after] = forward
            ? [first, second]
            : [second, first]
        return [horizontal
            ? {left: before, right: after, gap}
            : {top: before, bottom: after, gap}]
    })
    return {
        alignmentConstraint: horizontal
            ? {horizontal: [stationIds]}
            : {vertical: [stationIds]},
        relativePlacementConstraint: placements,
    }
}

/**
 * Restrictions that keep each straight horizontal/vertical stretch of a line
 * (as it currently lies, measured from current positions) straight when
 * fcose runs again. Combine with the intersection restrictions via
 * `mergeConstraints`.
 */
export function getLineRestrictions(elements: Collection, order: RestrictionOrder = 'as-computed'): Constraints {
    const positions = snapshotPositions(elements)
    const segments = sortRestrictions(
        buildLines(elements).flatMap((line) => buildSegments(line.stationIds, positions)),
        (segment) => centroid(segment.stationIds.map((id) => positions.get(id))),
        order,
    )
    return mergeConstraints(
        segments.map((segment) => segmentRestrictions(segment, MIN_STATION_SPACING)),
        (id) => positions.get(id),
        order,
    )
}

/** Moves every aligned group onto its mean coordinate (horizontal groups → y, vertical groups → x). */
function alignPositions(positions: Positions, alignment: FcoseAlignmentConstraint): Positions {
    const next = new Map(positions)
    const alignGroups = (groups: string[][] | undefined, axis: 'x' | 'y') => {
        for (const group of groups ?? []) {
            const members = group.flatMap((id) => next.get(id) ?? [])
            const mean = members.reduce((sum, member) => sum + member[axis], 0) / members.length
            for (const id of group) {
                const position = next.get(id)
                // Tolerance keeps a repeated run a no-op despite float rounding in the mean.
                if (position && Math.abs(position[axis] - mean) > 1e-6) {
                    next.set(id, {...position, [axis]: mean})
                }
            }
        }
    }
    alignGroups(alignment.horizontal, 'y')
    alignGroups(alignment.vertical, 'x')
    return next
}

/**
 * Moves stations onto the alignments of the given line restrictions (no
 * layout run). Can pull an intersection's stations apart again — cluster
 * them afterwards. Returns whether any station actually moved.
 */
export function applyLineAlignment(elements: Collection, restrictions: Constraints): boolean {
    const positions = snapshotPositions(elements)
    // Only changed stations: writing an unchanged compound parent back would shift its children.
    const moved = changedPositions(positions, alignPositions(positions, restrictions.alignmentConstraint))
    applyPositions(elements, moved)
    return moved.size > 0
}

// --- pipeline ---------------------------------------------------------------

export function onLayoutStop(event: LayoutEventObject): void {
    const elements = getLayoutElements(event)
    if (!elements) {
        return
    }
    applySchematicGeometry(elements)
    event.cy.fit(elements, 30)
}
