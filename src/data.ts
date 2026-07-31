import type {ElementDefinition} from 'cytoscape'

export async function loadData(file: string): Promise<ElementDefinition[]> {
    const data = await import(`../data-simplified/${file}.json`, {with: {type: 'json'}})
    return data.default as ElementDefinition[]
}
