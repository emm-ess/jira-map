import {describe, expect, it} from 'vitest'

import {applyIntersectionClustering} from '@/graph/customLayout.ts'
import {applyOctilinearLayout, applyStressLayout} from '@/graph/transitMap.ts'
import {applyLineUntangling} from '@/graph/untangle.ts'

import miniMetro from '../fixtures/networks/mini-metro.json'
import ringLine from '../fixtures/networks/ring-line.json'
import separateNetworks from '../fixtures/networks/separate-networks.json'
import singleLine from '../fixtures/networks/single-line.json'
import {buildMap} from '../helpers/map.ts'
import {
    countLineCrossings,
    largestMove,
    placesOfInterchanges,
    stationPositions,
    trackAngleErrors,
    trackLengths,
    widestInterchange,
} from '../helpers/measure.ts'

const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0
/** Pixels per stop the stress layout aims for. */
const TRACK_UNIT = 60

describe('applyStressLayout (step 1)', () => {
    it('places every station, keeps the stations of an interchange together (mini-metro)', () => {
        const cy = buildMap(miniMetro)

        expect(applyStressLayout(cy.elements())).toBe(true)

        const positions = stationPositions(cy)
        expect(positions.size).toBe(26)
        for (const {x, y} of positions.values()) {
            expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
        }
        expect(widestInterchange(cy)).toBeLessThan(40)
    })

    it('draws a track about one stop (60 px) long, and never puts two nodes on one spot', () => {
        const cy = buildMap(miniMetro)
        applyStressLayout(cy.elements())

        expect(median(trackLengths(cy))).toBeGreaterThan(TRACK_UNIT * 0.7)
        expect(median(trackLengths(cy))).toBeLessThan(TRACK_UNIT * 1.3)
        expect(Math.min(...trackLengths(cy))).toBeGreaterThan(TRACK_UNIT * 0.3)
    })

    it('gives the same map for the same seed and another for another seed', () => {
        const [first, again, other] = [1, 1, 2].map((seed) => {
            const cy = buildMap(miniMetro)
            applyStressLayout(cy.elements(), {seed})
            return stationPositions(cy)
        })

        expect(largestMove(first as Map<string, {x: number, y: number}>, again as Map<string, {x: number, y: number}>)).toBe(0)
        expect(largestMove(first as Map<string, {x: number, y: number}>, other as Map<string, {x: number, y: number}>)).toBeGreaterThan(1)
    })

    it('puts networks that never meet apart instead of on top of each other (separate-networks)', () => {
        const cy = buildMap(separateNetworks)
        applyStressLayout(cy.elements())

        const stations = (prefixes: string[]) => cy.nodes('[type="station"]').toArray()
            .filter((node) => prefixes.includes(node.id().slice(0, 1)))
            .map((node) => node.position())
        const [left, right] = [stations(['r', 'b']), stations(['g', 'y'])]
        const distances = left.flatMap((a) => right.map((b) => Math.hypot(a.x - b.x, a.y - b.y)))
        expect(Math.min(...distances)).toBeGreaterThan(TRACK_UNIT / 2)
    })

    it('copes with a single line and with an empty map', () => {
        const solo = buildMap(singleLine)
        expect(applyStressLayout(solo.elements())).toBe(true)
        expect(median(trackLengths(solo))).toBeCloseTo(TRACK_UNIT, -1)

        const empty = buildMap({lines: {}})
        expect(applyStressLayout(empty.elements())).toBe(false)
    })

    it('copes with a ring line that starts and ends in one interchange (ring-line)', () => {
        const cy = buildMap(ringLine)

        expect(applyStressLayout(cy.elements())).toBe(true)

        expect([...stationPositions(cy).values()].every(({x, y}) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
    })

    it('can take relatedness into account', () => {
        const cy = buildMap(miniMetro)
        const relatedness = {summaryOf: () => 'same words everywhere', areaDistance: () => 1, strength: 0.2}

        expect(applyStressLayout(cy.elements(), {relatedness})).toBe(true)
    })
})

describe('applyOctilinearLayout (step 2)', () => {
    it('turns most tracks onto 45 degrees (mini-metro)', () => {
        const cy = buildMap(miniMetro)
        applyStressLayout(cy.elements())

        expect(applyOctilinearLayout(cy.elements())).toBe(true)

        const errors = trackAngleErrors(cy)
        expect(errors.filter((error) => error <= 3).length / errors.length).toBeGreaterThan(0.75)
        expect(widestInterchange(cy)).toBeLessThan(40)
    })

    it('makes a single line exactly octilinear', () => {
        const cy = buildMap(singleLine)
        applyStressLayout(cy.elements())
        applyOctilinearLayout(cy.elements())

        expect(Math.max(...trackAngleErrors(cy))).toBeLessThan(1)
    })
})

function laidOutMiniMetro() {
    const cy = buildMap(miniMetro)
    applyStressLayout(cy.elements())
    applyOctilinearLayout(cy.elements())
    return cy
}

describe('the steps one after another (mini-metro)', () => {
    it('step 3 never adds crossings and only reorders stations inside interchanges', () => {
        const cy = laidOutMiniMetro()
        const [crossings, places] = [countLineCrossings(cy), placesOfInterchanges(cy)]

        applyLineUntangling(cy.elements())

        expect(countLineCrossings(cy)).toBeLessThanOrEqual(crossings)
        expect(placesOfInterchanges(cy)).toEqual(places)
    })

    it('step 3 is stable and clustering afterwards leaves its result alone', () => {
        const cy = laidOutMiniMetro()
        applyLineUntangling(cy.elements())
        const [settled, crossings] = [stationPositions(cy), countLineCrossings(cy)]

        expect(applyLineUntangling(cy.elements())).toBe(false)
        expect(applyIntersectionClustering(cy.elements())).toBe(false)

        expect(largestMove(settled, stationPositions(cy))).toBe(0)
        expect(countLineCrossings(cy)).toBe(crossings)
    })
})
