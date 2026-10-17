import type {Position} from 'cytoscape'
import {describe, expect, it} from 'vitest'

import {median, octilinearError, octilinearLayout} from '@/graph/octilinear.ts'

const gap = (a: Position | undefined, b: Position | undefined) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))
const links = (...pairs: [number, number][]) => pairs.map(([source, target]) => ({source, target}))

describe('octilinearError', () => {
    it('is the angle to the nearest multiple of 45 degrees', () => {
        expect(octilinearError({x: 0, y: 0}, {x: 10, y: 0})).toBeLessThan(1e-9)
        expect(octilinearError({x: 0, y: 0}, {x: 10, y: 10 * Math.tan(10 * Math.PI / 180)})).toBeCloseTo(10, 6)
        expect(octilinearError({x: 0, y: 0}, {x: 5, y: 5}), '45 degrees').toBeLessThan(1e-9)
        expect(octilinearError({x: 0, y: 0}, {x: 0, y: -7}), 'pointing up').toBeLessThan(1e-9)
    })

    it('has a median helper', () => {
        expect(median([3, 1, 2])).toBe(2)
    })
})

describe('octilinearLayout', () => {
    it('turns a wobbly path with a branch to within 3 degrees, near the ideal length', () => {
        const start = [{x: 0, y: 0}, {x: 60, y: 8}, {x: 118, y: -9}, {x: 185, y: 12}, {x: 230, y: 55}, {x: 235, y: 118}, {x: 160, y: 60}]
        const tracks = links([0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [3, 6])
        const out = octilinearLayout(start, tracks, {idealLength: 60})

        for (const {source, target} of tracks) {
            const [a, b] = [out[source], out[target]]
            expect(a && b).toBeTruthy()
            if (a && b) {
                expect(octilinearError(a, b), `track ${source}-${target}`).toBeLessThan(3)
                expect(gap(a, b)).toBeGreaterThan(40)
                expect(gap(a, b)).toBeLessThan(80)
            }
        }
        expect(start[1], 'the input is not mutated').toEqual({x: 60, y: 8})
    })

    it('keeps big nodes apart by their radii', () => {
        const apart = octilinearLayout([{x: 0, y: 0}, {x: 10, y: 0}], [], {idealLength: 60, radii: [30, 30]})
        expect(gap(apart[0], apart[1])).toBeGreaterThanOrEqual(59)
        const crowded = octilinearLayout([{x: 0, y: 0}, {x: 10, y: 0}], [], {idealLength: 60})
        expect(gap(crowded[0], crowded[1]), 'without radii only the small default range applies').toBeLessThan(40)
    })

    it('hardly moves a drawing that is octilinear already', () => {
        const grid = [{x: 0, y: 0}, {x: 60, y: 0}, {x: 120, y: 60}]
        const same = octilinearLayout(grid, links([0, 1], [1, 2]), {idealLength: 60})
        expect(same.every((position, index) => gap(position, grid[index]) < 30)).toBe(true)
    })
})
