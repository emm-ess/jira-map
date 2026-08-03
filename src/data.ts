import type {ElementDefinition} from 'cytoscape'

import * as intersectionsRecord from '../data-simplified/intersections.json'
import * as lines from '../data-simplified/lines.json'
import * as userFile from '../data-simplified/user.json'

const cache = new Map<string, ElementDefinition[]>()

const modules = import.meta.glob(
    '../data-simplified/*/*.json',
    {import: 'default'},
)

export const intersections = intersectionsRecord.default
export const user = userFile.default
export const AVAILABLE_LINES = lines.default

export async function loadData(file: string): Promise<ElementDefinition[]> {
    if (cache.has(file)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return cache.get(file)!
    }
    const data: ElementDefinition[] = await modules[`../data-simplified/${file}.json`]()
    cache.set(file, data)
    return data
}
