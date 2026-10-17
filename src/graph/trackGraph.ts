import type {Collection} from 'cytoscape'

import {buildLines, type Line} from './customLayout.ts'

/*
 * Track graph
 * -----------
 *
 * The map the reader sees is not the graph Cytoscape holds. Cytoscape has one
 * station per line and one edge per line segment, and ties the stations of an
 * interchange together only through a compound parent. A real transit map
 * draws an interchange as ONE stop, and lines that run the same way as ONE
 * track (drawn side by side). The track graph is exactly that picture:
 *
 *   - a node is an interchange (all its stations) or a station outside any
 *     interchange;
 *   - an edge is a track between two nodes, carrying every line that runs
 *     along it.
 *
 * Layout algorithms (stress, octilinear forces) work on this smaller graph and
 * the result is written back to the stations afterwards.
 */

export type TrackNode = {
    /** Interchange id, or the station id for a station outside any interchange. */
    id: string
    /** The stations drawn at this node: several for an interchange. */
    stationIds: string[]
}

export type TrackEdge = {
    /** Index into `TrackGraph.nodes`. */
    source: number
    target: number
    /** Lines drawn along this track, in the order they were first seen. */
    lines: string[]
}

export type TrackGraph = {
    nodes: TrackNode[]
    edges: TrackEdge[]
    /** Station id → index of its node. */
    nodeOfStation: Map<string, number>
}

/**
 * `groupOf` names the interchange a station belongs to (`undefined` for a
 * station outside any). Stations that are never part of a line are left out.
 * Pure: no Cytoscape types.
 */
export function buildTrackGraph(lines: Line[], groupOf: (stationId: string) => string | undefined): TrackGraph {
    const nodes: TrackNode[] = []
    const nodeIndexById = new Map<string, number>()
    const nodeOfStation = new Map<string, number>()
    const nodeOf = (stationId: string): number => {
        const known = nodeOfStation.get(stationId)
        if (known !== undefined) {
            return known
        }
        const nodeId = groupOf(stationId) ?? stationId
        let index = nodeIndexById.get(nodeId)
        if (index === undefined) {
            index = nodes.length
            nodes.push({id: nodeId, stationIds: []})
            nodeIndexById.set(nodeId, index)
        }
        nodes[index]?.stationIds.push(stationId)
        nodeOfStation.set(stationId, index)
        return index
    }

    const edgesByPair = new Map<string, TrackEdge>()
    for (const line of lines) {
        for (const [position, stationId] of line.stationIds.entries()) {
            const source = nodeOf(stationId)
            const nextStationId = line.stationIds[position + 1]
            if (nextStationId === undefined) {
                continue
            }
            const target = nodeOf(nextStationId)
            if (source === target) {
                continue
            }
            const key = `${Math.min(source, target)},${Math.max(source, target)}`
            const edge = edgesByPair.get(key)
            if (!edge) {
                edgesByPair.set(key, {source, target, lines: [line.id]})
            }
            else if (!edge.lines.includes(line.id)) {
                edge.lines.push(line.id)
            }
        }
    }
    return {nodes, edges: [...edgesByPair.values()], nodeOfStation}
}

/** Track graph of everything in `elements`; interchanges are the compound parents of stations. */
export function getTrackGraph(elements: Collection): TrackGraph {
    const parentOf = new Map<string, string | undefined>(
        elements.nodes('[type="station"]').map((station) => [station.id(), station.data('parent') as string | undefined]),
    )
    return buildTrackGraph(buildLines(elements), (stationId) => parentOf.get(stationId))
}
