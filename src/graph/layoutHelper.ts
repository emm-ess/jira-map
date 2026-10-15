import type {NodeCollection, NodeSingular, Position} from 'cytoscape'
import type {FcoseAlignmentConstraint, FcoseFixedNodeConstraint, FcoseRelativePlacementConstraint} from 'cytoscape-fcose'

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
    const axisName = axis === BaseAxis.HORIZONTAL
        ? 'horizontal'
        : 'vertical'
    return {
        relativePlacementConstraint,
        alignmentConstraint: {
            [axisName]: alignmentConstraint.length > 1
                ? alignmentConstraint
                : [],
        },
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

        const axisGroups = children.reduce((groups, child) => {
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

        for (const key in curr.alignmentConstraint) {
            acc.alignmentConstraint[key].push(curr.alignmentConstraint[key])
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

export function moveStationsAccordingToRestrictions(cy: cytoscape.Core, restrictions: FcoseRelativePlacementConstraint[]): boolean {
    let moved = false
    for (const restriction of restrictions) {
        const {left, right, top, bottom, gap} = restriction
        const horizontal = !!(left && right)
        const prevNode = cy.getElementById(left ?? top)[0]
        const nextNode = cy.getElementById(right ?? bottom)[0]

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
