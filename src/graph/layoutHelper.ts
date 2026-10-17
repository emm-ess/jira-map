import type {NodeCollection, NodeSingular, Position} from 'cytoscape'
import type {FcoseAlignmentConstraint, FcoseRelativePlacementConstraint} from 'cytoscape-fcose'

const BOUNDING_BOX_OPTIONS = {
    includeNodes: true,
    includeEdges: false,
    includeLabels: false,
    includeOverlays: false,
    includeUnderlays: false,
} as const

export const DIRECTIONS = [
    {x: 1, y: -1},
    {x: 1, y: 0},
    {x: 1, y: 1},
    {x: 0, y: -1},
    {x: 0, y: 1},
    {x: -1, y: -1},
    {x: -1, y: 0},
    {x: -1, y: 1},
] as const satisfies readonly Position[]

const enum BaseAxis {
    HORIZONTAL = 'x',
    VERTICAL = 'y',
}

/** Flip so the direction points right, or straight down when vertical. */
export function canonicalizeDirection(direction: Position): Position {
    if (direction.x < 0 || (direction.x === 0 && direction.y < 0)) {
        return {x: -direction.x, y: -direction.y}
    }
    return direction
}

/**
 * Closest of the 8 compass vectors in DIRECTIONS to the from→to delta, by
 * angle (cosine similarity, so axis-length differences between the 4
 * straight and 4 diagonal vectors don't skew the comparison). Picking the
 * closest match directly, rather than mapping the angle to an array index,
 * avoids depending on DIRECTIONS being sorted in a particular angular order.
 */
export function nearestDirection(from: Position, to: Position): Position {
    const delta = {x: to.x - from.x, y: to.y - from.y}
    return DIRECTIONS.reduce((best, direction) => {
        const length = Math.hypot(direction.x, direction.y)
        const cos = (direction.x * delta.x + direction.y * delta.y) / length
        const bestLength = Math.hypot(best.x, best.y)
        const bestCos = (best.x * delta.x + best.y * delta.y) / bestLength
        return cos > bestCos
            ? direction
            : best
    })
}

function getMainAxisBetweenNodes(nodes: NodeCollection): BaseAxis {
    const boundingBox = nodes.boundingBox(BOUNDING_BOX_OPTIONS)

    return boundingBox.w > boundingBox.h
        ? BaseAxis.HORIZONTAL
        : BaseAxis.VERTICAL
}

function getMainAxisOfClosedNeighborhood(node: NodeSingular): BaseAxis {
    const boundingBox = node.closedNeighborhood().boundingBox(BOUNDING_BOX_OPTIONS)

    return boundingBox.w > boundingBox.h
        ? BaseAxis.HORIZONTAL
        : BaseAxis.VERTICAL
}

function getMainAxisForGroupViaClosedNeighborhood(nodes: NodeCollection): BaseAxis {
    const counts = nodes.reduce((acc, node) => {
        acc[getMainAxisOfClosedNeighborhood(node)]++
        return acc
    }, {
        [BaseAxis.HORIZONTAL]: 0,
        [BaseAxis.VERTICAL]: 0,
    })

    return counts[BaseAxis.HORIZONTAL] > counts[BaseAxis.VERTICAL]
        ? BaseAxis.HORIZONTAL
        : BaseAxis.VERTICAL
}

function getOtherAxis(axis: BaseAxis): BaseAxis {
    return axis === BaseAxis.HORIZONTAL
        ? BaseAxis.VERTICAL
        : BaseAxis.HORIZONTAL
}

function sortNodeArraySimple(nodes: NodeSingular[], axis: BaseAxis): NodeSingular[] {
    return nodes.sort((a, b) => a.position(axis) - b.position(axis))
}

function sortNodeArray(nodes: NodeSingular[], axis: BaseAxis): NodeSingular[] {
    const axisName = axis === BaseAxis.HORIZONTAL
        ? 'x1'
        : 'y1'
    return nodes.sort((a, b) => {
        const aCoord = a.closedNeighborhood().boundingBox(BOUNDING_BOX_OPTIONS)[axisName]
        const bCoord = b.closedNeighborhood().boundingBox(BOUNDING_BOX_OPTIONS)[axisName]
        return aCoord - bCoord
    })
}

function sortNodesOnAxis(nodes: NodeCollection, axis: BaseAxis): NodeSingular[] {
    return sortNodeArraySimple(nodes.toArray(), axis)
}

export type Constraints = {
    relativePlacementConstraint: FcoseRelativePlacementConstraint[]
    alignmentConstraint: FcoseAlignmentConstraint
}

function generateNodeRestrictions(nodes: NodeSingular[], axis: BaseAxis): Constraints {
    const alignmentConstraint: string[] = []
    const relativePlacementConstraint: FcoseRelativePlacementConstraint[] = []
    const sorted = sortNodeArray(nodes, axis)
    let prevId = sorted[0].id()
    alignmentConstraint.push(prevId)
    for (const nextNode of sorted.slice(1)) {
        const nextId = nextNode.id()
        alignmentConstraint.push(nextId)
        const restriction = axis === BaseAxis.HORIZONTAL
            ? {
                left: prevId,
                right: nextId,
                gap: 10,
            }
            : {
                top: prevId,
                bottom: nextId,
                gap: 10,
            }
        relativePlacementConstraint.push(restriction)
        prevId = nextId
    }
    const group = alignmentConstraint.length > 1
        ? alignmentConstraint
        : []
    return {
        relativePlacementConstraint,
        alignmentConstraint: axis === BaseAxis.HORIZONTAL
            ? {horizontal: [group]}
            : {vertical: [group]},
    }
}

export function getIntersectionRestrictions(cy: cytoscape.Core): Constraints {
    const restrictions: Constraints[] = []
    for (const intersection of cy.nodes(':compound')) {
        const children = intersection.children('[type="station"]')
        console.log('children', children.size(), children)
        if (children.size() < 2) {
            continue
        }

        const axisGroups = children.reduce<Record<BaseAxis, NodeSingular[]>>((groups, child) => {
            const axis = getMainAxisOfClosedNeighborhood(child)
            groups[axis].push(child)
            return groups
        }, {
            [BaseAxis.HORIZONTAL]: [],
            [BaseAxis.VERTICAL]: [],
        })
        // using opposite names is intentional
        const horizontal = sortNodeArray(axisGroups[BaseAxis.VERTICAL], BaseAxis.HORIZONTAL)
        const vertical = sortNodeArray(axisGroups[BaseAxis.HORIZONTAL], BaseAxis.VERTICAL)
        if (horizontal.length > 0 && vertical.length > 0) {
            vertical.unshift(horizontal[0])
        }
        if (horizontal.length) {
            restrictions.unshift(generateNodeRestrictions(horizontal, BaseAxis.HORIZONTAL))
        }
        if (vertical.length) {
            restrictions.unshift(generateNodeRestrictions(vertical, BaseAxis.VERTICAL))
        }
        // const mainAxis = getMainAxisForGroupViaEdges(children)
        // const stationsByLine: NodeCollection[] = intersection.data('lines')
        //     .map<NodeCollection>((line) => intersection.children(`[type="station"][line="${line}"]`))
        //     .filter((nodes) => nodes.size() > 0)
        //
        // // topmost left/top node of each line
        // const mainStations: string[] = []
        // // restrict direction of stations on same transport-line
        // for (const stations of stationsByLine) {
        //     if (stations.size() < 2) {
        //         mainStations.push(stations[0].id())
        //         continue
        //     }
        //     // const stationDirection = getMainAxisBetweenNodes(stations)
        //     restrictions.push(generateNodeRestrictions(stations, mainAxis))
        //     mainStations.push(sortNodesOnAxis(stations, mainAxis)[0].id())
        // }

        // const selector = mainStations.map((id) => `#${id}`).join(', ')
        // const mainStationCollection = intersection.children(selector)
        // // const mainDirection = getMainAxisBetweenNodes(mainStationCollection)
        // // move instructions for "guidance" stations to the top
        // restrictions.unshift(generateNodeRestrictions(mainStationCollection, getOtherAxis(mainAxis)))
    }
    return restrictions.reduce<Constraints>((acc, curr) => {
        acc.relativePlacementConstraint.push(...curr.relativePlacementConstraint)

        for (const key of ['horizontal', 'vertical'] as const) {
            acc.alignmentConstraint[key]?.push(...curr.alignmentConstraint[key] ?? [])
        }
        return acc
    }, {
        relativePlacementConstraint: [],
        alignmentConstraint: {
            horizontal: [],
            vertical: [],
        },
    })
}

// --- merging restriction sets ------------------------------------------------

type UnionFind = {
    find: (id: string) => string
    union: (a: string, b: string) => void
}

function createUnionFind(): UnionFind {
    const parent = new Map<string, string>()
    const find = (id: string): string => {
        const next = parent.get(id)
        if (next === undefined) {
            return id
        }
        const root = find(next)
        parent.set(id, root)
        return root
    }
    return {
        find,
        union: (a, b) => {
            const rootA = find(a)
            const rootB = find(b)
            if (rootA !== rootB) {
                parent.set(rootA, rootB)
            }
        },
    }
}

/** Whether aligning `ids` on one axis would put two nodes on the same point (they'd already share the other coordinate). */
function wouldCoincide(ids: string[], same: UnionFind, other: UnionFind, known: Set<string>): boolean {
    const roots = new Set(ids.map((id) => same.find(id)))
    const members = new Set([...ids, ...[...known].filter((id) => roots.has(same.find(id)))])
    const otherRoots = [...members].map((id) => other.find(id))
    return new Set(otherRoots).size < otherRoots.length
}

/** Alignment groups of one axis; fcose wants overlapping groups merged ("most compact form"). */
function alignmentGroups(classes: UnionFind, ids: Set<string>): string[][] {
    const groups = new Map<string, string[]>()
    for (const id of ids) {
        const root = classes.find(id)
        const group = groups.get(root)
        if (group) {
            group.push(id)
        }
        else {
            groups.set(root, [id])
        }
    }
    return [...groups.values()].filter((group) => group.length > 1)
}

function hasPath(graph: Map<string, string[]>, start: string, goal: string): boolean {
    const seen = new Set<string>()
    const stack = [start]
    while (stack.length > 0) {
        const node = stack.pop()
        if (node === goal) {
            return true
        }
        if (node !== undefined && !seen.has(node)) {
            seen.add(node)
            stack.push(...graph.get(node) ?? [])
        }
    }
    return false
}

export type RestrictionOrder =
    | 'as-computed'
    | 'random'
    | 'top-to-bottom'
    | 'bottom-to-top'
    | 'left-to-right'
    | 'right-to-left'

export const RESTRICTION_ORDERS: {name: string, value: RestrictionOrder}[] = [
    {name: 'as computed', value: 'as-computed'},
    {name: 'random', value: 'random'},
    {name: 'top to bottom', value: 'top-to-bottom'},
    {name: 'bottom to top', value: 'bottom-to-top'},
    {name: 'left to right', value: 'left-to-right'},
    {name: 'right to left', value: 'right-to-left'},
]

const ORDER_AXES = {
    'top-to-bottom': ['y', 1],
    'bottom-to-top': ['y', -1],
    'left-to-right': ['x', 1],
    'right-to-left': ['x', -1],
} as const

/** Mean of the known positions (`undefined` when there are none). */
export function centroid(points: (Position | undefined)[]): Position | undefined {
    const known = points.filter((point) => point !== undefined)
    if (known.length === 0) {
        return undefined
    }
    return {
        x: known.reduce((sum, point) => sum + point.x, 0) / known.length,
        y: known.reduce((sum, point) => sum + point.y, 0) / known.length,
    }
}

/**
 * Puts restrictions in the order they get resolved in — when two of them
 * conflict, the earlier one wins. `anchorOf` says where a restriction sits
 * (for the directional orders); items without a position count as 0.
 */
export function sortRestrictions<T>(
    items: T[],
    anchorOf: (item: T) => Position | undefined,
    order: RestrictionOrder,
    random: () => number = Math.random,
): T[] {
    if (order === 'as-computed') {
        return items
    }
    if (order === 'random') {
        return items
            .map((item) => ({item, key: random()}))
            .toSorted((a, b) => a.key - b.key)
            .map(({item}) => item)
    }
    const [axis, direction] = ORDER_AXES[order]
    return items.toSorted((a, b) => direction * ((anchorOf(a)?.[axis] ?? 0) - (anchorOf(b)?.[axis] ?? 0)))
}

type PlacementGraphs = {
    x: Map<string, string[]>
    y: Map<string, string[]>
}

/** Minimum distance between aligned stations that nothing else keeps apart. */
const ALIGNED_GAP = 10

/**
 * Adds a placement unless it can't hold together with the ones already
 * added: both nodes on the same coordinate (aligned), or a left/right
 * (top/bottom) cycle between alignment classes. fcose misbehaves (it can
 * throw) on such contradictions.
 */
function tryAddPlacement(
    placement: FcoseRelativePlacementConstraint,
    x: UnionFind,
    y: UnionFind,
    graphs: PlacementGraphs,
): boolean {
    const [classes, graph, first, second] = 'left' in placement
        ? [x, graphs.x, placement.left, placement.right] as const
        : [y, graphs.y, placement.top, placement.bottom] as const
    const from = classes.find(first)
    const to = classes.find(second)
    if (from === to || hasPath(graph, to, from)) {
        return false
    }
    graph.set(from, [...graph.get(from) ?? [], to])
    return true
}

/**
 * Every pair of aligned stations that no placement orders yet (directly or
 * transitively) gets ordered by current position. Otherwise two groups
 * joined by a merge (e.g. an intersection's stations and a line's stations)
 * can end up on the very same point.
 */
function orderAlignedMembers(
    groups: string[][],
    horizontal: boolean,
    x: UnionFind,
    y: UnionFind,
    graphs: PlacementGraphs,
    positionOf: (id: string) => Position | undefined,
): FcoseRelativePlacementConstraint[] {
    const [classes, graph] = horizontal
        ? [x, graphs.x] as const
        : [y, graphs.y] as const
    const axis = horizontal
        ? 'x'
        : 'y'
    const coordinate = (id: string) => positionOf(id)?.[axis] ?? 0
    const added: FcoseRelativePlacementConstraint[] = []
    const order = (first: string, second: string) => {
        const from = classes.find(first)
        const to = classes.find(second)
        if (hasPath(graph, from, to) || hasPath(graph, to, from)) {
            return
        }
        const placement = horizontal
            ? {left: first, right: second, gap: ALIGNED_GAP}
            : {top: first, bottom: second, gap: ALIGNED_GAP}
        if (tryAddPlacement(placement, x, y, graphs)) {
            added.push(placement)
        }
    }
    for (const group of groups) {
        const ordered = group.toSorted((a, b) => coordinate(a) - coordinate(b))
        // Neighbours first, so longer pairs are mostly implied already and skipped.
        const pairs = ordered.flatMap((first, index) => {
            return ordered.slice(index + 1).map((second, offset) => ({first, second, offset}))
        })
        for (const {first, second} of pairs.toSorted((a, b) => a.offset - b.offset)) {
            order(first, second)
        }
    }
    return added
}

/**
 * Drops everything that names a node `isKnown` rejects, e.g. stations removed
 * since the restrictions were computed. fcose never returns when it is given
 * constraints for nodes that do not exist.
 */
function onlyKnownNodes(set: Constraints, isKnown: (id: string) => boolean): Constraints {
    const knownGroups = (groups: string[][] | undefined) => groups?.map((group) => group.filter((id) => isKnown(id)))
    return {
        alignmentConstraint: {
            horizontal: knownGroups(set.alignmentConstraint.horizontal),
            vertical: knownGroups(set.alignmentConstraint.vertical),
        },
        relativePlacementConstraint: set.relativePlacementConstraint.filter((placement) => 'left' in placement
            ? isKnown(placement.left) && isKnown(placement.right)
            : isKnown(placement.top) && isKnown(placement.bottom)),
    }
}

/**
 * Combines restriction sets (earlier sets win conflicts) into one that fcose
 * can take: overlapping alignment groups are merged, groups that would stack
 * two stations on one point are skipped, placements that contradict the
 * alignments or each other are dropped, and stations aligned on one axis are
 * ordered along it (by `positionOf`, normally the current positions). Within
 * each set, `order` decides which restriction wins a conflict. Nodes that
 * `positionOf` doesn't know are dropped from every restriction.
 */
export function mergeConstraints(
    allSets: Constraints[],
    positionOf: (id: string) => Position | undefined,
    order: RestrictionOrder = 'as-computed',
): Constraints {
    const sets = allSets.map((set) => onlyKnownNodes(set, (id) => positionOf(id) !== undefined))
    const x = createUnionFind() // vertical alignment: same x
    const y = createUnionFind() // horizontal alignment: same y
    const known = new Set<string>()
    const align = (group: string[], same: UnionFind, other: UnionFind) => {
        const ids = [...new Set(group)]
        const [first] = ids
        if (first === undefined || ids.length < 2 || wouldCoincide(ids, same, other, known)) {
            return
        }
        for (const id of ids) {
            known.add(id)
            same.union(first, id)
        }
    }
    const groupAnchor = (group: string[]) => centroid(group.map((id) => positionOf(id)))
    for (const set of sets) {
        for (const group of sortRestrictions(set.alignmentConstraint.horizontal ?? [], groupAnchor, order)) {
            align(group, y, x)
        }
        for (const group of sortRestrictions(set.alignmentConstraint.vertical ?? [], groupAnchor, order)) {
            align(group, x, y)
        }
    }
    const horizontal = alignmentGroups(y, known)
    const vertical = alignmentGroups(x, known)

    const graphs: PlacementGraphs = {x: new Map(), y: new Map()}
    const placementAnchor = (placement: FcoseRelativePlacementConstraint) => {
        const [first, second] = 'left' in placement
            ? [placement.left, placement.right]
            : [placement.top, placement.bottom]
        return centroid([positionOf(first), positionOf(second)])
    }
    const kept = sets
        .flatMap((set) => sortRestrictions(set.relativePlacementConstraint, placementAnchor, order))
        .filter((placement) => tryAddPlacement(placement, x, y, graphs))
    return {
        alignmentConstraint: {horizontal, vertical},
        relativePlacementConstraint: [
            ...kept,
            ...orderAlignedMembers(horizontal, true, x, y, graphs, positionOf),
            ...orderAlignedMembers(vertical, false, x, y, graphs, positionOf),
        ],
    }
}

export function moveStationsAccordingToRestrictions(cy: cytoscape.Core, restrictions: FcoseRelativePlacementConstraint[]): boolean {
    let moved = false
    for (const restriction of restrictions) {
        const {gap} = restriction
        const horizontal = 'left' in restriction
        const [previousId, nextId] = 'left' in restriction
            ? [restriction.left, restriction.right]
            : [restriction.top, restriction.bottom]
        const prevNode = cy.getElementById(previousId)[0]
        const nextNode = cy.getElementById(nextId)[0]
        if (!prevNode || !nextNode) {
            // a station that was removed since the restrictions were computed
            continue
        }

        const prevPosition = {...prevNode.position()}
        if (horizontal) {
            prevPosition.x += gap ?? 0
            moved ||= nextNode.position().x !== prevPosition.x
        }
        else {
            prevPosition.y += gap ?? 0
            moved ||= nextNode.position().y !== prevPosition.y
        }
        nextNode.position(prevPosition)
    }
    cy.fit()
    return moved
}
