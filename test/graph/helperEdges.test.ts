import {describe, expect, it} from 'vitest'

import {calculateForceBetweenStations, profileOf, pullRelatedTogether} from '@/graph/helperEdges.ts'

const summaries: Record<string, string> = {
    1: 'Zugdetails Wagenreihung anzeigen',
    2: 'Wagenreihung Zugdetails ergänzen',
    3: 'Datenbank Migration Postgres',
}
const summaryOf = (id: string) => summaries[id] ?? ''
/** A tiny area hierarchy: areas are 0 apart from themselves, 1 apart if they share a parent, else 3. */
const areaDistance = (a: string, b: string) => {
    if (a === b) {
        return 0
    }
    return a.startsWith('Info') && b.startsWith('Info')
        ? 1
        : 3
}

const api = profileOf([{line: 'API', areas: ['API', 'Info-Bahnhof'], issues: ['1']}], summaryOf)
const search = profileOf([{line: 'Zugsuche', areas: ['Zugsuche', 'Info-Bahnhof'], issues: ['2']}], summaryOf)
const database = profileOf([{line: 'Database', areas: ['Database'], issues: ['3']}], summaryOf)

describe('profileOf', () => {
    it('collects lines, areas and the words of the ticket summaries (short words dropped)', () => {
        expect(api.lines).toEqual(['API'])
        expect(api.areas).toEqual(['API', 'Info-Bahnhof'])
        expect(api.words).toContain('wagenreihung')
        expect(api.words).not.toContain('zu')
    })
})

describe('calculateForceBetweenStations', () => {
    it('is smaller for related than for unrelated nodes, within 1 to 6, and symmetric', () => {
        const related = calculateForceBetweenStations(api, search, areaDistance)
        const unrelated = calculateForceBetweenStations(api, database, areaDistance)

        expect(related).toBeGreaterThanOrEqual(1)
        expect(related).toBeLessThan(unrelated)
        expect(unrelated).toBeLessThanOrEqual(6)
        expect(calculateForceBetweenStations(search, api, areaDistance)).toBe(related)
    })
})

describe('pullRelatedTogether', () => {
    const profiles = [api, search, database]

    it('shortens the wanted distance of related pairs more than that of unrelated ones', () => {
        const pulled = pullRelatedTogether([[0, 3, 3], [3, 0, 3], [3, 3, 0]], profiles, 0.5, areaDistance)

        const relatedPull = 3 - (pulled[0]?.[1] ?? 3)
        const unrelatedPull = 3 - (pulled[0]?.[2] ?? 3)
        expect(relatedPull).toBeGreaterThan(0)
        expect(relatedPull).toBeGreaterThan(unrelatedPull)
    })

    it('leaves neighbours alone and keeps the matrix symmetric', () => {
        const pulled = pullRelatedTogether([[0, 1, 3], [1, 0, 2], [3, 2, 0]], profiles, 0.5, areaDistance)

        expect(pulled[0]?.[1]).toBe(1)
        for (let row = 0; row < 3; row++) {
            for (let column = 0; column < 3; column++) {
                expect(pulled[row]?.[column]).toBe(pulled[column]?.[row])
            }
        }
    })

    it('changes nothing at strength 0', () => {
        const distances = [[0, 3, 3], [3, 0, 3], [3, 3, 0]]
        expect(pullRelatedTogether(distances, profiles, 0, areaDistance)).toEqual(distances)
    })

    it('leaves nodes that share a line as they are', () => {
        expect(pullRelatedTogether([[0, 4], [4, 0]], [api, api], 0.9, areaDistance)[0]?.[1]).toBe(4)
    })

    it('asks about each pair of areas only once', () => {
        const asked: string[] = []
        pullRelatedTogether([[0, 3, 3], [3, 0, 3], [3, 3, 0]], profiles, 0.5, (a, b) => {
            asked.push(`${a}|${b}`)
            return areaDistance(a, b)
        })
        expect(new Set(asked).size).toBe(asked.length)
    })
})
