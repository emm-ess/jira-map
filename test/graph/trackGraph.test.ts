import {describe, expect, it} from 'vitest'

import {buildTrackGraph, getTrackGraph} from '@/graph/trackGraph.ts'

import ringLine from '../fixtures/networks/ring-line.json'
import sharedTrack from '../fixtures/networks/shared-track.json'
import {buildMap} from '../helpers/map.ts'

describe('buildTrackGraph', () => {
    it('makes one node of the stations of an interchange and one edge of lines on one track', () => {
        // lines A: a1 a2 a3, B: b1 b2 b3; a2 & b2 are interchange X, a3 & b3 are interchange Y
        const lines = [{id: 'A', stationIds: ['a1', 'a2', 'a3']}, {id: 'B', stationIds: ['b1', 'b2', 'b3']}]
        const groups: Record<string, string> = {a2: 'X', b2: 'X', a3: 'Y', b3: 'Y'}
        const graph = buildTrackGraph(lines, (id) => groups[id])

        expect(graph.nodes.map((node) => node.id)).toEqual(['a1', 'X', 'Y', 'b1'])
        expect(graph.nodes.find((node) => node.id === 'X')?.stationIds).toEqual(['a2', 'b2'])
        expect(graph.edges, 'a1-X, X-Y (A and B together), b1-X').toHaveLength(3)
        expect(graph.edges.find((edge) => edge.lines.length === 2)?.lines).toEqual(['A', 'B'])
        expect(graph.nodeOfStation.get('b3')).toBe(graph.nodeOfStation.get('a3'))
    })

    it('draws no loop for a line that stops twice in one interchange', () => {
        const graph = buildTrackGraph([{id: 'C', stationIds: ['c1', 'c2']}], () => 'Z')
        expect(graph.nodes).toHaveLength(1)
        expect(graph.edges).toHaveLength(0)
    })

    it('is empty without lines', () => {
        expect(buildTrackGraph([], () => '').edges).toEqual([])
    })
})

describe('getTrackGraph', () => {
    it('bundles the lines that run between the same two interchanges (shared-track)', () => {
        const graph = getTrackGraph(buildMap(sharedTrack).elements())

        // r1, b1, r4, b4 and the two interchanges
        expect(graph.nodes).toHaveLength(6)
        expect(graph.edges).toHaveLength(5)
        const bundle = graph.edges.filter((edge) => edge.lines.length > 1)
        expect(bundle).toHaveLength(1)
        expect(bundle[0]?.lines.toSorted()).toEqual(['Blue', 'Red'])
    })

    it('has no track from an interchange to itself when a line starts and ends there (ring-line)', () => {
        const graph = getTrackGraph(buildMap(ringLine).elements())

        expect(graph.edges.every((edge) => edge.source !== edge.target)).toBe(true)
        // the interchange (a, e, x2) plus b, c, d, x1, x3
        expect(graph.nodes).toHaveLength(6)
    })
})
