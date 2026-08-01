import type {ElementDefinition} from 'cytoscape'

const cache = new Map<string, ElementDefinition[]>()

const modules = import.meta.glob(
    '../data-simplified/**/*.json',
    {import: 'default'},
)

export async function loadData(file: string): Promise<ElementDefinition[]> {
    if (cache.has(file)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return cache.get(file)!
    }
    const data: ElementDefinition[] = await modules[`../data-simplified/${file}.json`]()
    cache.set(file, data)
    return data
}
