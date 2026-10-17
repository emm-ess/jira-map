import type {DataPrepared} from '../../types/data-prepared'

/*
 * Relatedness of stations
 * -----------------------
 *
 * A transit map built from the line topology alone puts two stations far apart
 * whenever the lines between them are long, even if their tickets are about
 * the same thing. This turns what the stations have in common — words in the
 * ticket summaries, areas, distance between areas — into a number the stress
 * layout can use to pull related stations closer (see `pullRelatedTogether`).
 *
 * Earlier this fed invisible "layout-helper-force" edges into fcose, one per
 * pair of stations. Doing the same job on the (much smaller) track graph, as a
 * matrix of numbers, avoids tens of thousands of edges.
 */

/** What a node of the track graph (one station, or all stations of an interchange) is about. */
export type StationProfile = {
    /** Lines that run through the node. */
    lines: string[]
    /** Lines and areas of the tickets. */
    areas: string[]
    /** Lower-case words (longer than 2 letters) of the ticket summaries. */
    words: string[]
}

type StationData = Pick<DataPrepared.Station, 'line' | 'areas' | 'issues'>

/** Steps between two areas in the area hierarchy (`Infinity` if they aren't connected), see `AreaGraph`. */
export type AreaDistance = (areaA: string, areaB: string) => number

function overlap<T>(valuesA: T[], valuesB: T[]): number {
    const uniqueA = new Set(valuesA)
    const uniqueB = new Set(valuesB)
    if (uniqueA.size === 0 || uniqueB.size === 0) {
        return 0
    }

    const shared = [...uniqueA].filter((value) => uniqueB.has(value)).length
    return shared / Math.min(uniqueA.size, uniqueB.size)
}

/** Distance in the area hierarchy between the closest pair of areas (4 if they aren't connected). */
function distanceBetweenAreas(areasA: string[], areasB: string[], areaDistance: AreaDistance): number {
    const distance = Math.min(...areasA.flatMap((areaA) => areasB.map((areaB) => areaDistance(areaA, areaB))))
    return Number.isFinite(distance)
        ? distance
        : 4
}

/** Remembers answers: the same pair of areas is asked about for every pair of nodes. */
function remembered(areaDistance: AreaDistance): AreaDistance {
    const answers = new Map<string, number>()
    return (areaA, areaB) => {
        const key = `${areaA}\u0000${areaB}`
        let distance = answers.get(key)
        if (distance === undefined) {
            distance = areaDistance(areaA, areaB)
            answers.set(key, distance)
        }
        return distance
    }
}

function wordsOf(summary: string): string[] {
    return summary.toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 2)
}

/** Profile of stations drawn at one node; `summaryOf` looks up the summary of a ticket. */
export function profileOf(stations: StationData[], summaryOf: (issueId: string) => string): StationProfile {
    return {
        lines: [...new Set(stations.map((station) => station.line))],
        areas: [...new Set(stations.flatMap((station) => [station.line, ...station.areas]))],
        words: [...new Set(stations.flatMap((station) => station.issues.flatMap((issueId) => wordsOf(summaryOf(issueId)))))],
    }
}

/**
 * How far apart two nodes should be relative to a normal track: 1 for nodes
 * that are about the same thing, up to 6 for unrelated ones in distant areas.
 */
export function calculateForceBetweenStations(a: StationProfile, b: StationProfile, areaDistance: AreaDistance): number {
    // Ticket overlap is the strongest signal. Sprint membership is deliberately
    // ignored, since unrelated tickets can be worked on in the same sprint.
    const similarity = overlap(a.words, b.words) * 0.7 + overlap(a.areas, b.areas) * 0.1
    const difference = 1 - similarity
    const distanceInHierarchy = distanceBetweenAreas(a.areas, b.areas, areaDistance)
    return 1 + difference * (1 + Math.min(distanceInHierarchy, 4))
}

/**
 * Shortens the wanted distance between related nodes: a pair with relatedness
 * force 1 gets `strength` (0 to 1) less distance, an unrelated one (force 6)
 * keeps all of it. Nodes that share a line stay as they are: the line already
 * says how far apart they are, and shortening that would uneven the stops.
 */
export function pullRelatedTogether(
    distances: number[][],
    profiles: StationProfile[],
    strength: number,
    areaDistance: AreaDistance,
): number[][] {
    const knownAreaDistance = remembered(areaDistance)
    return distances.map((row, i) => row.map((distance, j) => {
        const profileA = profiles[i]
        const profileB = profiles[j]
        if (distance <= 1 || !profileA || !profileB || profileA.lines.some((line) => profileB.lines.includes(line))) {
            return distance
        }
        const relatedness = (6 - calculateForceBetweenStations(profileA, profileB, knownAreaDistance)) / 5
        return distance * (1 - strength * relatedness)
    }))
}
