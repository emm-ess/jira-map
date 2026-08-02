import fs from 'node:fs'
import path from 'node:path'
import type {DataAdditional} from '../types/data-additional.ts'
import type {Data} from '../types/data.js'
import {additionalDataDir, dataDir, readArray, readMap, writeArray} from './util.ts'

function mapToSortedArray(map: Map<string, number>) {
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
}

function listAreas() {
    const issueMeta = readMap<DataAdditional.IssueMeta>('issueMeta.json', additionalDataDir)
    const areaNeighbours = new Map<string, number>()
    const areasCount = new Map<string, number>()
    for (const issue of issueMeta.values()) {
        const issueArea = issue.area
        if (issueArea) {
            issueArea.forEach((area, index, array) => {
                areasCount.set(area, (areasCount.get(area) ?? 0) + 1)
                if (index < array.length - 1) {
                    array.slice(index + 1).forEach((neighbour) => {
                        const key = [area, neighbour].sort().join('-')
                        areaNeighbours.set(key, (areaNeighbours.get(key) ?? 0) + 1)
                    })
                }
            })
        }
    }
    writeArray(mapToSortedArray(areasCount), 'areasCount.json', additionalDataDir)
    writeArray(mapToSortedArray(areaNeighbours), 'areaNeighbours.json', additionalDataDir)
}

function issuesToCSV() {
    const issues = readArray<Data.Issue>('issues.json', dataDir)
    const issueTypes = readMap<Data.IssueType>('types.json', dataDir)
    const components = readMap<Data.Component>('components.json', dataDir)

    const lines = issues
        .filter((issue) => issue.issuetype !== '5')
        .map(issue => [
            issue.key,
            issue.id,
            issueTypes.get(issue.issuetype)?.name,
            issue.summary,
            issue.components.map((component) => components.get(component)?.name).join(','),
            '',
            '',
        ].join(';'))

    lines.unshift('key;id;type;summary;components;manualComponents;area')

    const filename = path.resolve(import.meta.dirname, '../manualFixes.csv')
    fs.writeFileSync(filename, lines.join('\n'))
}

listAreas()
