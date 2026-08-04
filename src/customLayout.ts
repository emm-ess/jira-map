import type {Collection, LayoutEventObject, Position} from 'cytoscape'
import type {FcoseLayoutOptions} from 'cytoscape-fcose'

import {canonicalizeDirection, nearestDirection} from '@/layoutHelper.ts'

/*
 * Schematic line-map layout
 * -------------------------
 *
 *   fcose → line rasterization → crossing shifts → intersection compaction → fit
 *
 * Station nodes (`data.line`) are chained by segment edges (`data.type ===
 * 'segment'`, `data.area` = line id).  Intersection nodes are compound parents
 * whose children are transfer stations kept in a tight cluster.
 *
 * Directions are the eight compass vectors in DIRECTIONS.  A line's `lane` is
 * the snapped projection onto the perpendicular unit axis.
 *
 * Known limitations:
 * - Crossing repair shifts a whole line by one grid step (greedy, bounded).
 * - Intersection compaction uses sub-grid spacing and locally breaks grid align.
 * - segmentsCross ignores touching endpoints and collinear overlap.
 */

const GRID_SIZE = 120
const INTERSECTION_SPACING = 10
const CROSSING_PASSES = 3

type Edge = ReturnType<Collection['edges']>[number]
type Node = ReturnType<Collection['nodes']>[number]
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

/** Orthonormal along/across axes for an 8-compass direction. */
function basis(direction: Position): {along: Position; across: Position} {
    const length = Math.hypot(direction.x, direction.y) || 1
    const along = {x: direction.x / length, y: direction.y / length}
    return {along, across: {x: -along.y, y: along.x}}
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

function getSegmentEdges(elements: Collection): Edge[] {
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
 * Project stations onto direction + lane. Progress is snapped on the unit
 * along-axis so diagonals keep GRID_SIZE spacing (the old code multiplied by
 * non-unit diagonal vectors and stretched lines by √2 / 2×).
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

function applySchematicGeometry(elements: Collection): void {
    const positions = snapshotPositions(elements)
    const lines = buildLines(elements, positions)
    separateParallelLanes(lines)

    const next = new Map<string, Position>()
    for (const line of lines) {
        rasterizeLine(line, positions, next)
    }
    applyPositions(elements, next)
}

// --- crossing resolution ----------------------------------------------------

function segmentsCross(a1: Position, a2: Position, b1: Position, b2: Position): boolean {
    const orient = (p: Position, q: Position, r: Position) =>
        (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
    const o1 = orient(a1, a2, b1)
    const o2 = orient(a1, a2, b2)
    const o3 = orient(b1, b2, a1)
    const o4 = orient(b1, b2, a2)
    return o1 * o2 < 0 && o3 * o4 < 0
}

function edgesCross(first: Edge, second: Edge): boolean {
    return segmentsCross(
        first.source().position(),
        first.target().position(),
        second.source().position(),
        second.target().position(),
    )
}

function edgeParents(edge: Edge): string[] {
    return [edge.source().data('parent'), edge.target().data('parent')].filter(Boolean) as string[]
}

function edgesShareIntersection(first: Edge, second: Edge): boolean {
    const parents = new Set(edgeParents(first))
    return edgeParents(second).some((parent) => parents.has(parent))
}

function perpendicularOffset(edge: Edge): Position {
    const direction = canonicalizeDirection(
        nearestDirection(edge.source().position(), edge.target().position()),
    )
    return scale(basis(direction).across, GRID_SIZE)
}

function moveLine(elements: Collection, lineId: string, offset: Position): void {
    for (const node of elements.nodes().filter((node) => node.data('line') === lineId)) {
        node.position(add(node.position(), offset))
    }
}

function tryShiftCrossing(
    elements: Collection,
    first: Edge,
    second: Edge,
    shifted: Set<string>,
): boolean {
    const firstLine = first.data('line') as string
    const secondLine = second.data('line') as string
    if (firstLine === secondLine) {
        return false
    }

    const lineToMove = shifted.has(secondLine)
        ? firstLine
        : secondLine
    if (shifted.has(lineToMove)) {
        return false
    }
    if (edgesShareIntersection(first, second) || !edgesCross(first, second)) {
        return false
    }

    const edgeForOffset = lineToMove === secondLine
        ? second
        : first
    moveLine(elements, lineToMove, perpendicularOffset(edgeForOffset))
    shifted.add(lineToMove)
    return true
}

function resolveLineCrossings(elements: Collection): void {
    const edges = getSegmentEdges(elements)
    const shifted = new Set<string>()

    for (let pass = 0; pass < CROSSING_PASSES; pass++) {
        let moved = false
        for (let index = 0; index < edges.length; index++) {
            const first = edges[index]
            if (!first) {
                continue
            }
            for (const second of edges.slice(index + 1)) {
                if (tryShiftCrossing(elements, first, second, shifted)) {
                    moved = true
                }
            }
        }
        if (!moved) {
            break
        }
    }
}

// --- intersection compaction ------------------------------------------------

function averagePosition(nodes: Node[]): Position {
    const count = nodes.length || 1
    return {
        x: nodes.reduce((sum, node) => sum + node.position().x, 0) / count,
        y: nodes.reduce((sum, node) => sum + node.position().y, 0) / count,
    }
}

function compactIntersection(intersection: Node): void {
    // Pack transfer stations around their centroid on a fixed axis so the
    // cluster reads as one stop without chasing a fragile longest-pair direction.
    const children = intersection.children().toArray()
    if (children.length === 0) {
        return
    }
    const center = averagePosition(children)
    const mid = (children.length - 1) / 2
    for (const [index, child] of children.entries()) {
        child.position({
            x: center.x + (index - mid) * INTERSECTION_SPACING,
            y: center.y,
        })
    }
}

function compactIntersections(elements: Collection): void {
    for (const intersection of elements.nodes('[type="intersection"]')) {
        compactIntersection(intersection)
    }
}

// --- pipeline ---------------------------------------------------------------

function onLayoutStop(event: LayoutEventObject): void {
    const elements = getLayoutElements(event)
    if (!elements) {
        return
    }
    applySchematicGeometry(elements)
    resolveLineCrossings(elements)
    compactIntersections(elements)
    elements.cy().fit(elements, 30)
}

export const customFCose = {
    name: 'fcose',

    // 'draft', 'default' or 'proof'
    // - "draft" only applies spectral layout
    // - "default" improves the quality with incremental layout (fast cooling rate)
    // - "proof" improves the quality with incremental layout (slow cooling rate)
    quality: 'proof',
    // Use random node positions at beginning of layout
    // if this is set to false, then quality option must be "proof"
    randomize: true,
    // Whether or not to animate the layout
    animate: true,
    // Duration of animation in ms, if enabled
    animationDuration: 1000,
    // Easing of animation, if enabled
    animationEasing: undefined,
    // Fit the viewport to the repositioned nodes
    fit: true,
    // Padding around layout
    padding: 30,
    // Whether to include labels in node dimensions. Valid in "proof" quality
    nodeDimensionsIncludeLabels: false,
    // Whether or not simple nodes (non-compound nodes) are of uniform dimensions
    uniformNodeDimensions: true,
    // Whether to pack disconnected components - cytoscape-layout-utilities extension should be registered and initialized
    packComponents: false,
    // Layout step - all, transformed, enforced, cose - for debug purpose only
    step: 'all',

    /* spectral layout options */

    // False for random, true for greedy sampling
    samplingType: false,
    // Sample size to construct distance matrix
    sampleSize: 25,
    // Separation amount between nodes
    nodeSeparation: 75,
    // Power iteration tolerance
    piTol: 0.000_000_1,

    /* incremental layout options */

    // Node repulsion (non overlapping) multiplier
    nodeRepulsion: (node) => 4500,
    // Ideal edge (non nested) length
    idealEdgeLength: (edge) => {
        return edge.data('type') === 'layout-helper-force'
            ? edge.data('force') * 20
            : edge.data('distance') * 50 || 50
    },
    // Divisor to compute edge forces
    edgeElasticity: (edge) => {
        return edge.data('type') === 'layout-helper-force'
            ? 0.15
            : 0.85
    },
    // Nesting factor (multiplier) to compute ideal edge length for nested edges
    nestingFactor: 0.1,
    // Maximum number of iterations to perform - this is a suggested value and might be adjusted by the algorithm as required
    numIter: 2500,
    // For enabling tiling
    tile: true,
    // The comparison function to be used while sorting nodes during tiling operation.
    // Takes the ids of 2 nodes that will be compared as a parameter and the default tiling operation is performed when this option is not set.
    // It works similar to ``compareFunction`` parameter of ``Array.prototype.sort()``
    // If node1 is less then node2 by some ordering criterion ``tilingCompareBy(nodeId1, nodeId2)`` must return a negative value
    // If node1 is greater then node2 by some ordering criterion ``tilingCompareBy(nodeId1, nodeId2)`` must return a positive value
    // If node1 is equal to node2 by some ordering criterion ``tilingCompareBy(nodeId1, nodeId2)`` must return 0
    tilingCompareBy: undefined,
    // Represents the amount of the vertical space to put between the zero degree members during the tiling operation(can also be a function)
    tilingPaddingVertical: 10,
    // Represents the amount of the horizontal space to put between the zero degree members during the tiling operation(can also be a function)
    tilingPaddingHorizontal: 10,
    // Gravity force (constant)
    gravity: 0.25,
    // Gravity range (constant)
    gravityRange: 3.8,
    // Gravity range (constant) for compounds
    gravityRangeCompound: 1,
    // Gravity force (constant) for compounds
    gravityCompound: 0.1,
    // Initial cooling factor for incremental layout
    initialEnergyOnIncremental: 0.3,

    /* constraint options */

    // Fix desired nodes to predefined positions
    // [{nodeId: 'n1', position: {x: 100, y: 200}}, {...}]
    fixedNodeConstraint: undefined,
    // Align desired nodes in vertical/horizontal direction
    // {vertical: [['n1', 'n2'], [...]], horizontal: [['n2', 'n4'], [...]]}
    alignmentConstraint: undefined,
    // Place two nodes relatively in vertical/horizontal direction
    // [{top: 'n1', bottom: 'n2', gap: 100}, {left: 'n3', right: 'n4', gap: 75}, {...}]
    relativePlacementConstraint: undefined,

    /* layout event callbacks */
    ready: () => {}, // on layoutready
    stop: () => {}, // onLayoutStop,
} satisfies FcoseLayoutOptions

export const customElk = {
    name: 'elk',
    nodeDimensionsIncludeLabels: false, // Boolean which changes whether label dimensions are included when calculating node dimensions
    fit: true, // Whether to fit
    padding: 20, // Padding on fit
    animate: false, // Whether to transition the node positions
    animateFilter: function(node, i) { return true }, // Whether to animate specific nodes when animation is on; non-animated nodes immediately go to their final positions
    animationDuration: 500, // Duration of animation in ms if enabled
    animationEasing: undefined, // Easing of animation if enabled
    transform: function(node, pos) { return pos }, // A function that applies a transform to the final node position
    ready: undefined, // Callback on layoutready
    stop: undefined, // Callback on layoutstop
    nodeLayoutOptions: undefined, // Per-node options function
    elk: {
        // All options are available at http://www.eclipse.org/elk/reference.html
        //
        // 'org.eclipse.' can be dropped from the identifier. The subsequent identifier has to be used as property key in quotes.
        // E.g. for 'org.eclipse.elk.direction' use:
        // 'elk.direction'
        //
        // Enums use the name of the enum as string e.g. instead of Direction.DOWN use:
        // 'elk.direction': 'DOWN'
        //
        // The main field to set is `algorithm`, which controls which particular layout algorithm is used.
        // Example (downwards layered layout):
        algorithm: 'disco',
        'elk.direction': 'DOWN',
    },
    priority: function(edge) { return null }, // Edges with a non-nil value are skipped when geedy edge cycle breaking is enabled
}
