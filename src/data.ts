import type {ElementDefinition} from 'cytoscape'

import * as intersectionsRecord from '../data-simplified/intersections.json'
import * as lines from '../data-simplified/lines.json'
import * as userFile from '../data-simplified/user.json'

const cache = new Map<string, ElementDefinition[]>()

const modules = import.meta.glob(
    '../data-simplified/*/*.json',
    {import: 'default'},
)

type Line = {
    name: string
    filename: string
}

export const intersections = intersectionsRecord.default
export const user = userFile.default

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
export const AVAILABLE_LINES = lines.default.map<Line>((line: string) => ({
    name: line,
    filename: `lines/${line}`,
}))

export async function loadData(file: string): Promise<ElementDefinition[]> {
    if (cache.has(file)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return cache.get(file)!
    }
    const data: ElementDefinition[] = await modules[`../data-simplified/${file}.json`]()
    cache.set(file, data)
    return data
}
