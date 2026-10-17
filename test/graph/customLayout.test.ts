import {describe, expect, it} from 'vitest'

import {applyIntersectionClustering, applyLineAlignment, getLineRestrictions} from '@/graph/customLayout.ts'
import {centroid} from '@/graph/layoutHelper.ts'
import {applyOctilinearLayout, applyStressLayout} from '@/graph/transitMap.ts'

import crossingLines from '../fixtures/networks/crossing-lines.json'
import miniMetro from '../fixtures/networks/mini-metro.json'
import ringLine from '../fixtures/networks/ring-line.json'
import {buildMap} from '../helpers/map.ts'
import {largestMove, stationPositions} from '../helpers/measure.ts'

/** Red runs left to right, Blue top to bottom; both stand at (0, 0) in the interchange. */
const plus = {
    r1: {x: -200, y: 0},
    r2: {x: -100, y: 0},
    r3: {x: 0, y: 0},
    r4: {x: 100, y: 0},
    r5: {x: 200, y: 0},
    b1: {x: 0, y: -200},
    b2: {x: 0, y: -100},
    b3: {x: 0, y: 0},
    b4: {x: 0, y: 100},
    b5: {x: 0, y: 200},
}

describe('applyIntersectionClustering', () => {
    it('moves the stations of an interchange next to each other (crossing-lines)', () => {
        const cy = buildMap(crossingLines, plus)

        expect(applyIntersectionClustering(cy.elements())).toBe(true)

        const [red, blue] = [cy.getElementById('r3').position(), cy.getElementById('b3').position()]
        expect(Math.hypot(red.x - blue.x, red.y - blue.y)).toBeGreaterThan(1)
        expect(Math.hypot(red.x - blue.x, red.y - blue.y)).toBeLessThan(20)
    })

    it('keeps the centre of the interchange: the stations stay around where they were', () => {
        const cy = buildMap(crossingLines, {...plus, r3: {x: 3, y: 4}, b3: {x: -6, y: 8}})

        applyIntersectionClustering(cy.elements())

        const centre = centroid([cy.getElementById('r3').position(), cy.getElementById('b3').position()])
        expect(centre?.x).toBeCloseTo(-1.5, 6)
        expect(centre?.y).toBeCloseTo(6, 6)
    })

    it.each([
        ['crossing-lines', crossingLines, plus],
        ['ring-line, all stations on one spot', ringLine, {}],
    ])('is a fixed point: running it again changes nothing (%s)', (_name, network, positions) => {
        const cy = buildMap(network, positions)
        applyIntersectionClustering(cy.elements())
        const settled = stationPositions(cy)

        for (let run = 0; run < 3; run++) {
            expect(applyIntersectionClustering(cy.elements())).toBe(false)
        }
        expect(largestMove(settled, stationPositions(cy))).toBe(0)
    })

    it('does nothing on a map without interchanges', () => {
        const cy = buildMap({lines: {Solo: ['s1', 's2', 's3']}}, {s1: {x: 0, y: 0}, s2: {x: 50, y: 0}, s3: {x: 100, y: 0}})
        expect(applyIntersectionClustering(cy.elements())).toBe(false)
    })
})

function laidOutMiniMetro() {
    const cy = buildMap(miniMetro)
    applyStressLayout(cy.elements())
    applyOctilinearLayout(cy.elements())
    return cy
}

describe('line restrictions (mini-metro after the transit-map steps)', () => {
    it('finds the horizontal and vertical stretches of the lines', () => {
        const restrictions = getLineRestrictions(laidOutMiniMetro().elements())

        const groups = (restrictions.alignmentConstraint.horizontal?.length ?? 0) + (restrictions.alignmentConstraint.vertical?.length ?? 0)
        expect(groups).toBeGreaterThan(0)
        expect(restrictions.relativePlacementConstraint.length).toBeGreaterThan(0)
    })

    it('moves aligned stations onto one line exactly, and a second time moves nothing', () => {
        const cy = laidOutMiniMetro()
        const restrictions = getLineRestrictions(cy.elements())

        expect(applyLineAlignment(cy.elements(), restrictions)).toBe(true)

        const spread = (ids: string[], axis: 'x' | 'y') => {
            const values = ids.map((id) => cy.getElementById(id).position(axis))
            return Math.max(...values) - Math.min(...values)
        }
        for (const group of restrictions.alignmentConstraint.horizontal ?? []) {
            expect(spread(group, 'y')).toBeLessThan(1e-6)
        }
        for (const group of restrictions.alignmentConstraint.vertical ?? []) {
            expect(spread(group, 'x')).toBeLessThan(1e-6)
        }
        expect(applyLineAlignment(cy.elements(), restrictions)).toBe(false)
    })
})
