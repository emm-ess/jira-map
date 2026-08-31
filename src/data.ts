import * as userFile from '../data-prepared/data/users.json'
import * as intersectionsRecord from '../data-prepared/intersections.json'
import * as lines from '../data-prepared/lines.json'

const cache = new Map<string, unknown>()

const modules = import.meta.glob(
    '../data-prepared/*/*.json',
    {import: 'default'},
)

export const intersections = intersectionsRecord.default
export const user = userFile.default
export const AVAILABLE_LINES = lines.default

export async function loadData<T>(file: string): Promise<T> {
    if (cache.has(file)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return cache.get(file)!
    }
    const data: T = await modules[`../data-prepared/${file}.json`]()
    cache.set(file, data)
    return data
}
