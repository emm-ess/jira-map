import type {Collection, Position} from 'cytoscape'

import {applyPositions, buildLines, changedPositions, type Line, type Positions, snapshotPositions} from './customLayout.ts'

/*
 * Line ordering at interchanges
 * -----------------------------
 *
 * Every line has its own station at an interchange, and the stations sit side
 * by side. Which line gets which place decides how many lines cross near the
 * interchange (and, since lines of a bundle run side by side, inside a
 * bundle). That is the metro-line crossing minimization problem; here it is
 * solved by a simple local search: swap two stations of an interchange
 * whenever that lowers the number of crossings among all lines, until no
 * swap helps.
 *
 * Only the stations of interchanges change places; everything else stays.
 * They only trade places, so `applyIntersectionClustering` afterwards finds
 * them standing on its places and leaves the new order alone. Placing the
 * stations again from scratch (stress / octilinear step) resets the order:
 * run this step again after those.
 * Greedy, so it can stop in a local minimum. On the real data this took the
 * line crossings after the transit-map steps from about 300 to about 200 in a
 * quarter of a second.
 */

/** One piece of a line: two consecutive stations. */
type LineLink = {from: string, to: string}

function orientation(a: Position, b: Position, c: Position): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

/** Proper intersection only: shared endpoints, T-touches and collinear overlap don't count. */
export function segmentsCross(a1: Position, a2: Position, b1: Position, b2: Position): boolean {
    return orientation(a1, a2, b1) * orientation(a1, a2, b2) < 0
        && orientation(b1, b2, a1) * orientation(b1, b2, a2) < 0
}

export function buildLineLinks(lines: Line[]): LineLink[] {
    return lines.flatMap((line) => line.stationIds.flatMap((from, index) => {
        const to = line.stationIds[index + 1]
        return to === undefined
            ? []
            : [{from, to}]
    }))
}

/** Station id → indices of the links that end at it. */
function indexLinksByStation(links: LineLink[]): Map<string, number[]> {
    const index = new Map<string, number[]>()
    for (const [position, link] of links.entries()) {
        for (const stationId of [link.from, link.to]) {
            index.set(stationId, [...index.get(stationId) ?? [], position])
        }
    }
    return index
}

/** Links that share a station can't properly cross (they touch there). */
function linksCross(a: LineLink, b: LineLink, positions: Positions): boolean {
    if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) {
        return false
    }
    const a1 = positions.get(a.from)
    const a2 = positions.get(a.to)
    const b1 = positions.get(b.from)
    const b2 = positions.get(b.to)
    return !!(a1 && a2 && b1 && b2) && segmentsCross(a1, a2, b1, b2)
}

/** Crossings between the `chosen` links (by index) and all links; a crossing between two chosen links counts once. */
export function countCrossingsOf(chosen: number[], links: LineLink[], positions: Positions): number {
    const chosenSet = new Set(chosen)
    return chosen.reduce((total, index) => {
        const link = links[index]
        if (!link) {
            return total
        }
        const crossing = links.filter((other, otherIndex) => otherIndex !== index
            && !(chosenSet.has(otherIndex) && otherIndex < index)
            && linksCross(link, other, positions))
        return total + crossing.length
    }, 0)
}

/** Swaps two stations' positions in `positions` (mutates); keeps the swap only if crossings strictly drop. */
function swapIfFewerCrossings(
    idA: string,
    idB: string,
    links: LineLink[],
    linksOf: Map<string, number[]>,
    positions: Positions,
): boolean {
    const positionA = positions.get(idA)
    const positionB = positions.get(idB)
    if (!positionA || !positionB) {
        return false
    }
    // Only links at the two stations move, so only crossings of those can change.
    const affected = [...new Set([...linksOf.get(idA) ?? [], ...linksOf.get(idB) ?? []])]
    const before = countCrossingsOf(affected, links, positions)
    positions.set(idA, positionB)
    positions.set(idB, positionA)
    if (countCrossingsOf(affected, links, positions) < before) {
        return true
    }
    positions.set(idA, positionA)
    positions.set(idB, positionB)
    return false
}

/** One pass over all pairs of stations of one interchange; returns whether any swap was kept. */
function untangleInterchange(
    stationIds: string[],
    links: LineLink[],
    linksOf: Map<string, number[]>,
    positions: Positions,
): boolean {
    let swapped = false
    for (const [index, idA] of stationIds.entries()) {
        for (const idB of stationIds.slice(index + 1)) {
            swapped = swapIfFewerCrossings(idA, idB, links, linksOf, positions) || swapped
        }
    }
    return swapped
}

/**
 * Sweeps all interchanges until no swap helps. Terminates: the number of
 * crossings is a non-negative integer that strictly drops with every kept swap.
 * Mutates `positions`.
 */
export function untangleInterchanges(interchanges: string[][], links: LineLink[], positions: Positions): void {
    const linksOf = indexLinksByStation(links)
    let swapped = true
    while (swapped) {
        swapped = false
        for (const stationIds of interchanges) {
            swapped = untangleInterchange(stationIds, links, linksOf, positions) || swapped
        }
    }
}

/** Reorders the stations of every interchange to cross fewer lines. Returns whether any station moved. */
export function applyLineUntangling(elements: Collection): boolean {
    const positions = snapshotPositions(elements)
    const interchanges = elements.nodes('[type="intersection"]')
        .map((interchange) => interchange.children('[type="station"]').map((station) => station.id()))
        .filter((stationIds) => stationIds.length >= 2)

    const next = new Map(positions)
    untangleInterchanges(interchanges, buildLineLinks(buildLines(elements)), next)

    // Only changed stations: writing an unchanged compound parent back would shift its children.
    const moved = changedPositions(positions, next)
    applyPositions(elements, moved)
    return moved.size > 0
}
