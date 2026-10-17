import type {Position} from 'cytoscape'
import {describe, expect, it} from 'vitest'

import {applyIntersectionClustering} from '@/graph/customLayout.ts'
import {
    applyLineUntangling,
    buildLineLinks,
    countCrossingsOf,
    segmentsCross,
    untangleInterchanges,
} from '@/graph/untangle.ts'

import sharedTrack from '../fixtures/networks/shared-track.json'
import {buildMap} from '../helpers/map.ts'
import {countLineCrossings, largestMove, placesOfInterchanges, stationPositions} from '../helpers/measure.ts'

const P = (x: number, y: number): Position => ({x, y})

describe('segmentsCross', () => {
    it('counts proper crossings only', () => {
        expect(segmentsCross(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toBe(true)
        expect(segmentsCross(P(0, 0), P(10, 0), P(10, 0), P(10, 10)), 'shared endpoint').toBe(false)
        expect(segmentsCross(P(0, 0), P(10, 0), P(5, 0), P(5, 10)), 'T-touch').toBe(false)
        expect(segmentsCross(P(0, 0), P(10, 0), P(0, 5), P(10, 5)), 'parallel').toBe(false)
    })
})

describe('buildLineLinks', () => {
    it('links consecutive stations of each line', () => {
        const lines = [{id: 'A', stationIds: ['a', 'b', 'c']}, {id: 'B', stationIds: ['z']}, {id: 'C', stationIds: []}]
        expect(buildLineLinks(lines)).toEqual([{from: 'a', to: 'b'}, {from: 'b', to: 'c'}])
    })
})

describe('countCrossingsOf', () => {
    it('counts the chosen links against all others', () => {
        const links = [{from: 'a1', to: 'a2'}, {from: 'b1', to: 'b2'}, {from: 'c1', to: 'a2'}]
        const positions = new Map([['a1', P(0, 0)], ['a2', P(100, 100)], ['b1', P(0, 100)], ['b2', P(100, 0)], ['c1', P(50, 200)]])

        expect(countCrossingsOf([0], links, positions), 'a1-a2 crosses b1-b2; c1-a2 shares a2 and never counts').toBe(1)
        expect(countCrossingsOf([0, 1], links, positions), 'a pair of chosen links counts once').toBe(1)
        expect(countCrossingsOf([2], links, positions)).toBe(0)
        expect(countCrossingsOf([], links, positions)).toBe(0)
        expect(countCrossingsOf([9], links, positions), 'unknown index is ignored').toBe(0)
    })
})

describe('untangleInterchanges', () => {
    it('lets two stations in the wrong order trade places; a second run changes nothing', () => {
        const links = [{from: 'a1', to: 'a2'}, {from: 'b1', to: 'b2'}]
        const positions = new Map([['a1', P(0, 5)], ['b1', P(0, -5)], ['a2', P(200, -20)], ['b2', P(200, 20)]])
        expect(countCrossingsOf([0, 1], links, positions)).toBe(1)

        untangleInterchanges([['a1', 'b1']], links, positions)

        expect(countCrossingsOf([0, 1], links, positions)).toBe(0)
        expect([positions.get('a1'), positions.get('b1')]).toEqual([P(0, -5), P(0, 5)])
        const before = new Map(positions)
        untangleInterchanges([['a1', 'b1']], links, positions)
        expect([...positions]).toEqual([...before])
    })

    it('resolves three lines in full reversal without crossings', () => {
        const links = ['a', 'b', 'c'].map((line) => ({from: `${line}1`, to: `${line}2`}))
        const positions = new Map([['a1', P(0, -10)], ['b1', P(0, 0)], ['c1', P(0, 10)], ['a2', P(200, 10)], ['b2', P(200, 0)], ['c2', P(200, -10)]])
        expect(countCrossingsOf([0, 1, 2], links, positions)).toBe(3)

        untangleInterchanges([['a1', 'b1', 'c1']], links, positions)

        expect(countCrossingsOf([0, 1, 2], links, positions)).toBe(0)
    })

    it('rejects a swap that fixes one crossing but creates more', () => {
        const links = [{from: 'a1', to: 'a2'}, {from: 'b1', to: 'b2'}, {from: 'x1', to: 'x2'}]
        const positions = new Map([['a1', P(0, 0)], ['a2', P(100, 0)], ['b1', P(0, 10)], ['b2', P(100, -10)], ['x1', P(-50, 40)], ['x2', P(50, -40)]])
        const before = countCrossingsOf([0, 1, 2], links, positions)

        untangleInterchanges([['a1', 'b1']], links, positions)

        expect(countCrossingsOf([0, 1, 2], links, positions)).toBeLessThanOrEqual(before)
    })

    it('leaves single and unknown stations alone', () => {
        const positions = new Map([['a1', P(0, 0)]])
        untangleInterchanges([['a1'], ['nope', 'a1']], [{from: 'a1', to: 'a2'}], positions)
        expect([...positions]).toEqual([['a1', P(0, 0)]])
    })
})

describe('applyLineUntangling (shared-track)', () => {
    /** Red and Blue swap sides at the second interchange, so they cross twice on the way. */
    const crossedPositions = {
        r1: P(-100, -5),
        rx: P(0, -5),
        ry: P(300, 5),
        r4: P(400, -5),
        b1: P(-100, 5),
        bx: P(0, 5),
        by: P(300, -5),
        b4: P(400, 5),
    }

    it('reorders the stations of an interchange, which removes the crossings', () => {
        const cy = buildMap(sharedTrack, crossedPositions)
        expect(countLineCrossings(cy)).toBe(2)

        expect(applyLineUntangling(cy.elements())).toBe(true)

        expect(countLineCrossings(cy)).toBe(0)
    })

    it('only lets the stations of an interchange trade places: the places stay the same', () => {
        const cy = buildMap(sharedTrack, crossedPositions)
        const placesBefore = placesOfInterchanges(cy)

        applyLineUntangling(cy.elements())

        expect(placesOfInterchanges(cy)).toEqual(placesBefore)
        const {r1, b1, r4, b4} = crossedPositions
        expect(stationPositions(cy).get('r1'), 'stations outside interchanges stay').toEqual(r1)
        expect([stationPositions(cy).get('b1'), stationPositions(cy).get('r4'), stationPositions(cy).get('b4')]).toEqual([b1, r4, b4])
    })

    it('changes nothing the second time', () => {
        const cy = buildMap(sharedTrack, crossedPositions)
        applyLineUntangling(cy.elements())
        const settled = stationPositions(cy)

        expect(applyLineUntangling(cy.elements())).toBe(false)
        expect(largestMove(settled, stationPositions(cy))).toBe(0)
    })

    it('is not undone by clustering the interchanges afterwards', () => {
        const cy = buildMap(sharedTrack, crossedPositions)
        applyLineUntangling(cy.elements())
        const settled = stationPositions(cy)

        expect(applyIntersectionClustering(cy.elements())).toBe(false)

        expect(largestMove(settled, stationPositions(cy))).toBe(0)
        expect(countLineCrossings(cy)).toBe(0)
    })
})
