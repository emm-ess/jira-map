import type {Collection, Position} from 'cytoscape'

import {
    applyIntersectionClustering,
    applyPositions,
    changedPositions,
    type Positions,
    snapshotPositions,
} from './customLayout.ts'
import {type AreaDistance, profileOf, pullRelatedTogether} from './helperEdges.ts'
import {centroid} from './layoutHelper.ts'
import {octilinearLayout, type OctilinearOptions} from './octilinear.ts'
import {closeGaps, graphDistances, stressLayout, type StressOptions} from './stressLayout.ts'
import {getTrackGraph, type TrackGraph} from './trackGraph.ts'

/*
 * Transit map in two steps
 * ------------------------
 *
 * 1. `applyStressLayout`: first create a map that *looks* like a transit map —
 *    even spacing, a dense centre, long arms — from the track graph alone.
 * 2. `applyOctilinearLayout`: then abstract it into the rules of transit maps
 *    by turning every track onto horizontal, vertical or 45°.
 *
 * Both work on the track graph (one node per interchange, one edge per bundle
 * of lines, see trackGraph.ts) and write the result back to the stations.
 * Each step reads the positions that are there when it runs, so they can be
 * mixed with the other layout steps in any order.
 */

/** Pixels per stop on the page. */
const TRACK_UNIT = 60

/** Room an interchange needs around its centre: its stations stand 10 px apart (see applyIntersectionClustering). */
function nodeRadius(stationCount: number): number {
    return stationCount * 5 + 4
}

export type StressLayoutOptions = StressOptions & {
    /**
     * Pull nodes that are about the same thing together (see helperEdges.ts).
     * `summaryOf` looks up the summary of a ticket, `areaDistance` the distance
     * between two areas; `strength` is 0 to 1.
     */
    relatedness?: {
        summaryOf: (issueId: string) => string
        areaDistance: AreaDistance
        strength: number
    }
}

/** Where each node of the track graph is right now: the centre of its stations. */
function currentNodePositions(graph: TrackGraph, positions: Positions): Position[] {
    return graph.nodes.map((node) => centroid(node.stationIds.map((stationId) => positions.get(stationId))) ?? {x: 0, y: 0})
}

/**
 * Puts all stations of a node at the node's position and then spreads an
 * interchange's stations around it (`applyIntersectionClustering`).
 * Returns whether any station actually moved.
 */
function placeTrackGraph(elements: Collection, graph: TrackGraph, nodePositions: Position[]): boolean {
    const before = snapshotPositions(elements)
    const stationPositions: Positions = new Map()
    for (const [index, node] of graph.nodes.entries()) {
        const position = nodePositions[index]
        if (position) {
            for (const stationId of node.stationIds) {
                stationPositions.set(stationId, {...position})
            }
        }
    }
    // Only stations: writing a compound parent's old position back would shift its children.
    applyPositions(elements, changedPositions(before, stationPositions))
    applyIntersectionClustering(elements)
    return changedPositions(before, snapshotPositions(elements)).size > 0
}

/** Distances the stress layout should aim for: stops between nodes, optionally shortened for related ones. */
function wantedDistances(elements: Collection, graph: TrackGraph, relatedness: StressLayoutOptions['relatedness']): number[][] {
    const distances = closeGaps(graphDistances(graph.nodes.length, graph.edges))
    if (!relatedness || relatedness.strength <= 0) {
        return distances
    }
    const stations = new Map(elements.nodes('[type="station"]').map((station) => [station.id(), station.data()]))
    const profiles = graph.nodes.map((node) => profileOf(
        node.stationIds.flatMap((stationId) => stations.get(stationId) ?? []),
        relatedness.summaryOf,
    ))
    return pullRelatedTogether(distances, profiles, relatedness.strength, relatedness.areaDistance)
}

/** Step 1: lays out the whole network from scratch. Returns whether any station moved. */
export function applyStressLayout(elements: Collection, {relatedness, ...stress}: StressLayoutOptions = {}): boolean {
    const graph = getTrackGraph(elements)
    const wanted = wantedDistances(elements, graph, relatedness)
    const nodePositions = stressLayout(wanted, stress).map(({x, y}) => ({x: x * TRACK_UNIT, y: y * TRACK_UNIT}))
    return placeTrackGraph(elements, graph, nodePositions)
}

/** Step 2: turns every track of the current layout onto an octilinear direction. Returns whether any station moved. */
export function applyOctilinearLayout(elements: Collection, options: OctilinearOptions = {}): boolean {
    const graph = getTrackGraph(elements)
    const start = currentNodePositions(graph, snapshotPositions(elements))
    const radii = graph.nodes.map((node) => nodeRadius(node.stationIds.length))
    return placeTrackGraph(elements, graph, octilinearLayout(start, graph.edges, {radii, ...options}))
}
