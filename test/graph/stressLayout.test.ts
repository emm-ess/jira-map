import type {Position} from 'cytoscape'
import {describe, expect, it} from 'vitest'

import {closeGaps, graphDistances, stressLayout, stressOf} from '@/graph/stressLayout.ts'

const path = (length: number) => Array.from({length: length - 1}, (_, index) => ({source: index, target: index + 1}))
const gap = (a: Position | undefined, b: Position | undefined) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))

describe('graphDistances / closeGaps', () => {
    it('counts hops and replaces "unreachable" by the longest distance + 1', () => {
        const distances = graphDistances(4, path(3))
        expect(distances[0]).toEqual([0, 1, 2, Number.POSITIVE_INFINITY])
        expect(distances[3]?.[3]).toBe(0)
        expect(closeGaps(distances)[0]).toEqual([0, 1, 2, 3])
    })

    it('copes with big graphs (spreading 150 000 cells into Math.max crashed once)', () => {
        const size = 400
        const half = path(size / 2)
        const links = [...half, ...half.map(({source, target}) => ({source: source + size / 2, target: target + size / 2}))]
        const distances = closeGaps(graphDistances(size, links))

        expect(distances).toHaveLength(size)
        expect(distances.every((row) => row.every((cell) => Number.isFinite(cell)))).toBe(true)
    })
})

describe('stressLayout', () => {
    it('draws a path without stress, neighbours one unit apart', () => {
        const wanted = graphDistances(6, path(6))
        const drawn = stressLayout(wanted)

        expect(stressOf(wanted, drawn)).toBeLessThan(0.01)
        for (let index = 0; index < 5; index++) {
            expect(gap(drawn[index], drawn[index + 1])).toBeCloseTo(1, 1)
        }
    })

    it('draws a cycle of 8 as a ring with neighbours about one unit apart', () => {
        const ring = Array.from({length: 8}, (_, index) => ({source: index, target: (index + 1) % 8}))
        const drawn = stressLayout(graphDistances(8, ring))

        for (let index = 0; index < 8; index++) {
            expect(Math.abs(gap(drawn[index], drawn[(index + 1) % 8]) - 1)).toBeLessThan(0.3)
        }
    })

    it('gives the same map for the same seed and copes with trivial input', () => {
        const wanted = graphDistances(6, path(6))
        expect(stressLayout(wanted, {seed: 7})).toEqual(stressLayout(wanted, {seed: 7}))
        expect(stressLayout([])).toEqual([])
        expect(stressLayout([[0]])).toHaveLength(1)
    })

    it('lays out 400 nodes in a few seconds', {timeout: 20_000}, () => {
        const size = 400
        // a path with shortcuts: connected, but more than a line
        const shortcuts = Array.from({length: size / 10}, (_, index) => ({source: index * 10, target: Math.min(size - 1, index * 10 + 25)}))
        const started = Date.now()
        const drawn = stressLayout(closeGaps(graphDistances(size, [...path(size), ...shortcuts])))

        expect(drawn).toHaveLength(size)
        expect(drawn.every(({x, y}) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
        expect(Date.now() - started).toBeLessThan(5000)
    })
})
