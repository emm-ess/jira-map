import type {ElementDefinition} from 'cytoscape'

import userFile from '../data-prepared/data/users.json' with {type: 'json'}
import intersectionFile from '../data-prepared/intersections.json' with {type: 'json'}
import lines from '../data-prepared/lines.json' with {type: 'json'}
import type {DataPrepared} from '../types/data-prepared'

const cache = new Map<string, unknown>()

const modules = import.meta.glob(
    '../data-prepared/*/*.json',
    {import: 'default'},
)

/* eslint-disable unicorn/prefer-export-from */
export const intersections = intersectionFile as ElementDefinition[]
export const user = userFile
export const AVAILABLE_LINES: DataPrepared.LineInfo[] = lines
/* eslint-enable unicorn/prefer-export-from */

export async function loadData<T>(file: string): Promise<T> {
    if (cache.has(file)) {
        return cache.get(file)! as T
    }
    const data = await modules[`../data-prepared/${file}.json`]()
    cache.set(file, data)
    return data as T
}
