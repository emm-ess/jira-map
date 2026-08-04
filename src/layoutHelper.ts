import type {NodeCollection, NodeSingular, Position} from 'cytoscape'
import type {FcoseAlignmentConstraint, FcoseFixedNodeConstraint, FcoseRelativePlacementConstraint} from 'cytoscape-fcose'

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

export function nearestDirection(from: Position, to: Position): Position {
    const angle = Math.atan2(to.y - from.y, to.x - from.x)
    const index = Math.round(angle / (Math.PI / 4) + 8) % 8
    return DIRECTIONS[index] ?? DIRECTIONS[0]
}

function getMainAxisBetweenNodes(nodes: NodeCollection): BaseAxis {
    const boundingBox = nodes.boundingBox()

    return boundingBox.w > boundingBox.h
        ? BaseAxis.HORIZONTAL
        : BaseAxis.VERTICAL
}

function getMainAxisOfConnectedEdges(node: NodeSingular): BaseAxis {
    const connectedEdges = node.connectedEdges()
    const boundingBox = connectedEdges.boundingBox()

    return boundingBox.w > boundingBox.h
        ? BaseAxis.HORIZONTAL
        : BaseAxis.VERTICAL
}

function getMainAxisForGroupViaEdges(nodes: NodeCollection): BaseAxis {
    const counts = nodes.reduce((acc, node) => {
        acc[getMainAxisOfConnectedEdges(node)]++
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

function sortNodesOnAxis(nodes: NodeCollection, axis: BaseAxis): NodeSingular[] {
    return nodes.toArray().sort((a, b) => a.position(axis) - b.position(axis))
}

type Constraints = {
    relativeConstrains: FcoseRelativePlacementConstraint[]
    alignmentConstraint: FcoseAlignmentConstraint
}

function generateNodeRestrictions(nodes: NodeCollection, axis: BaseAxis): Constraints {
    const alignmentConstraint: string[] = []
    const relativeConstrains: FcoseRelativePlacementConstraint[] = []
    const sorted = sortNodesOnAxis(nodes, axis)
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
        relativeConstrains.push(restriction)
        prevId = nextId
    }
    const axisName = axis === BaseAxis.HORIZONTAL
        ? 'horizontal'
        : 'vertical'
    return {
        relativeConstrains,
        alignmentConstraint: {
            [axisName]: alignmentConstraint,
        },
    }
}

export function getIntersectionRestrictions(cy: cytoscape.Core): Constraints {
    const restrictions: Constraints[] = []
    for (const intersection of cy.nodes(':compound')) {
        const children = intersection.children('[type="station"]')
        if (children.size() < 2) {
            continue
        }
        const mainAxis = getMainAxisForGroupViaEdges(children)

        const stationsByLine: NodeCollection[] = intersection.data('lines')
            .map<NodeCollection>((line) => intersection.children(`[type="station"][line="${line}"]`))
            .filter((nodes) => nodes.size() > 0)

        // topmost left/top node of each line
        const mainStations: string[] = []
        // restrict direction of stations on same transport-line
        for (const stations of stationsByLine) {
            if (stations.size() < 2) {
                mainStations.push(stations[0].id())
                continue
            }
            // const stationDirection = getMainAxisBetweenNodes(stations)
            restrictions.push(generateNodeRestrictions(stations, mainAxis))
            mainStations.push(sortNodesOnAxis(stations, mainAxis)[0].id())
        }

        const selector = mainStations.map((id) => `#${id}`).join(', ')
        const mainStationCollection = intersection.children(selector)
        // const mainDirection = getMainAxisBetweenNodes(mainStationCollection)
        // move instructions for "guidance" stations to the top
        restrictions.unshift(generateNodeRestrictions(mainStationCollection, getOtherAxis(mainAxis)))
    }
    return restrictions.reduce<Constraints>((acc, curr) => {
        acc.relativeConstrains.push(...curr.relativeConstrains)

        for (const key in curr.alignmentConstraint) {
            acc.alignmentConstraint[key].push(...curr.alignmentConstraint[key])
        }
        return acc
    }, {
        relativeConstrains: [],
        alignmentConstraint: {
            horizontal: [],
            vertical: [],
        },
    })
}

export function moveStationsAccordingToRestrictions(cy: cytoscape.Core, restrictions: FcoseRelativePlacementConstraint[]): void {
    for (const restriction of restrictions) {
        const {left, right, top, bottom, gap} = restriction
        const horizontal = !!(left && right)
        const prevNode = cy.getElementById(left || top)[0]
        const nextNode = cy.getElementById(right || bottom)[0]

        const prevPosition = {...prevNode.position()}
        if (horizontal) {
            prevPosition.x += gap
        }
        else {
            prevPosition.y += gap
        }
        nextNode.position(prevPosition)
    }
    // cy().fit(elements, 30)
}
