import type {ElementDefinition} from 'cytoscape'

import type {DataPrepared} from '../types/data-prepared'
import {AreaGraph} from './areaGraph'

export type StationNode = ElementDefinition & {
    group: 'nodes',
    data: DataPrepared.Station
}

type InvisibleEdge = ElementDefinition & {
    group: 'edges',
    data: {
        type: 'layout-helper-force'
        source: string
        target: string
        force: number
    }
}

type CompareData = {
    area: string
    station: DataPrepared.Station
}

const areaGraph = new AreaGraph()

function overlap<T>(valuesA: T[], valuesB: T[]): number {
    const uniqueA = new Set(valuesA)
    const uniqueB = new Set(valuesB)
    if (uniqueA.size === 0 || uniqueB.size === 0) {
        return 0
    }

    const shared = [...uniqueA].filter((value) => uniqueB.has(value)).length
    return shared / Math.min(uniqueA.size, uniqueB.size)
}

function distanceBetweenAreas(mainArea: string, areas: string[], otherMainArea: string, otherAreas: string[]): number {
    const distances = [mainArea, ...areas].flatMap((area) =>
        [otherMainArea, ...otherAreas].map((otherArea) =>
            areaGraph.getDistanceBetweenNodes(area, otherArea)))
    const distance = Math.min(...distances)
    return Number.isFinite(distance)
        ? distance
        : 4
}

const splitRegex = /[ \t\n\r\f\v\(\)<>\-_\|:]+/
function splitSummary(summary: string): string {
    return summary.toLowerCase()
        .split(splitRegex)
        .filter((part) => part.length > 2)
        .join(' ')
}

export function calculateForceBetweenStations(a: CompareData, b: CompareData): number {
    const issueIds = a.station.issues.flatMap((issue) => splitSummary(issue.summary))
    const otherIssueIds = b.station.issues.flatMap((issue) => splitSummary(issue.summary))
    const issueSimilarity = overlap(issueIds, otherIssueIds)
    const assignedUserSimilarity = overlap(a.station.assignedUsers, b.station.assignedUsers)
    const mentionedUserSimilarity = overlap(a.station.mentionedUsers, b.station.mentionedUsers)
    const areaSimilarity = overlap(a.station.areas, b.station.areas)

    // Ticket overlap is the strongest signal. Sprint membership is deliberately
    // ignored, since unrelated tickets can be worked on in the same sprint.
    const similarity = issueSimilarity * 0.7
        // + assignedUserSimilarity * 0.12
        // + mentionedUserSimilarity * 0.08
        + areaSimilarity * 0.1
    const difference = 1 - similarity
    const areaDistance = distanceBetweenAreas(
        a.area,
        a.station.areas,
        b.area,
        b.station.areas,
    )

    return 1 + difference * (1 + Math.min(areaDistance, 4))
}

export function createInvisibleForces(nodes: StationNode[]): InvisibleEdge[] {
    const invisibleEdges: InvisibleEdge[] = []
    const nodesPerLine = new Map<string, StationNode[]>()

    for (const node of nodes) {
        const line = node.data('line')
        if (!nodesPerLine.has(line)) {
            nodesPerLine.set(line, [])
        }
        nodesPerLine.get(line)!.push(node)
    }

    console.log('nodesPerLine', nodesPerLine)

    for (const [line, nodes] of nodesPerLine) {
        nodesPerLine.delete(line)

        for (const node of nodes) {
            const nodeData = node.data()
            const comparedData = {
                area: line,
                station: nodeData,
            }

            for (const [otherLine, nodesOnOtherLine] of nodesPerLine) {
                if (otherLine === line) {
                    console.warn('same line', line, nodesOnOtherLine)
                    continue
                }
                for (const otherNode of nodesOnOtherLine) {
                    const otherNodeData = otherNode.data()
                    invisibleEdges.push({
                        group: 'edges',
                        data: {
                            type: 'layout-helper-force',
                            id: `${nodeData.id}-force-${otherNodeData.id}`,
                            source: nodeData.id,
                            target: otherNodeData.id,
                            force: calculateForceBetweenStations(comparedData, {
                                area: otherLine,
                                station: otherNodeData,
                            }),
                        },
                    })
                }
            }
        }
    }

    return invisibleEdges
}
