import type {Core, Position} from 'cytoscape'

import {centroid} from '@/graph/layoutHelper.ts'
import {octilinearError} from '@/graph/octilinear.ts'
import {getTrackGraph} from '@/graph/trackGraph.ts'

function orientation(p: Position, q: Position, r: Position): number {
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
}

function properlyCross(a1: Position, a2: Position, b1: Position, b2: Position): boolean {
    return orientation(a1, a2, b1) * orientation(a1, a2, b2) < 0 && orientation(b1, b2, a1) * orientation(b1, b2, a2) < 0
}

/** Crossings between segments of different lines, counted the way a reader sees them. */
export function countLineCrossings(cy: Core): number {
    const segments = cy.edges('[type="segment"]').toArray()
    let crossings = 0
    for (const [index, a] of segments.entries()) {
        for (const b of segments.slice(index + 1)) {
            if (a.data('line') !== b.data('line') && properlyCross(a.source().position(), a.target().position(), b.source().position(), b.target().position())) {
                crossings++
            }
        }
    }
    return crossings
}

/** Positions of all stations (compound parents are left out on purpose: they follow their children). */
export function stationPositions(cy: Core): Map<string, Position> {
    return new Map(cy.nodes('[type="station"]').map((node) => [node.id(), {...node.position()}]))
}

/** Largest distance any station moved between two snapshots. */
export function largestMove(before: Map<string, Position>, after: Map<string, Position>): number {
    let largest = 0
    for (const [id, position] of after) {
        const previous = before.get(id)
        if (previous) {
            largest = Math.max(largest, Math.hypot(position.x - previous.x, position.y - previous.y))
        }
    }
    return largest
}

/** The places the stations of each interchange stand on, order ignored. */
export function placesOfInterchanges(cy: Core): Map<string, string[]> {
    return new Map(cy.nodes('[type="intersection"]').map((interchange) => [
        interchange.id(),
        interchange.children('[type="station"]').map((station) => `${station.position().x.toFixed(6)},${station.position().y.toFixed(6)}`).toSorted(),
    ]))
}

/** Largest distance between two stations of one interchange. */
export function widestInterchange(cy: Core): number {
    let widest = 0
    for (const interchange of cy.nodes('[type="intersection"]')) {
        const stations = interchange.children('[type="station"]').toArray()
        for (const a of stations) {
            for (const b of stations) {
                widest = Math.max(widest, Math.hypot(a.position().x - b.position().x, a.position().y - b.position().y))
            }
        }
    }
    return widest
}

/** Where each node of the track graph is (the centre of its stations), per track: its two ends. */
function tracksOf(cy: Core): [Position, Position][] {
    const graph = getTrackGraph(cy.elements())
    const centres = graph.nodes.map((node) => centroid(node.stationIds.map((id) => cy.getElementById(id).position())) ?? {x: 0, y: 0})
    return graph.edges.flatMap(({source, target}) => {
        const [from, to] = [centres[source], centres[target]]
        return from && to
            ? [[from, to] as [Position, Position]]
            : []
    })
}

/** How many degrees each track is off the nearest multiple of 45 degrees. */
export function trackAngleErrors(cy: Core): number[] {
    return tracksOf(cy).map(([from, to]) => octilinearError(from, to))
}

/** Length of each track in pixels. */
export function trackLengths(cy: Core): number[] {
    return tracksOf(cy).map(([from, to]) => Math.hypot(to.x - from.x, to.y - from.y))
}
