import rawData from '../data-additional/areaMeta.json' with {type: 'json'}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)].filter(Boolean)
}

// provide a graph for traversing data
// might come in handy for finding the distance between two areas
export class AreaGraph {
    // data consist of key -> parentKeys[]
    data = new Map(
        Object.entries(rawData)
            .map(([key, parentKeys]) => [key, parentKeys] as [string, string[]]),
    )

    getRootNodes(keys: string[]): string[] {
        return [...new Set(keys.flatMap((key) => this.getRootNode(key)))]
    }

    getRootNode(key: string): string[] {
        const getRoots = (currentKey: string, path: Set<string>): string[] => {
            if (path.has(currentKey)) {
                return [currentKey]
            }

            const parentKeys = this.getParentNodes(currentKey) ?? []
            if (parentKeys.length === 0) {
                return [currentKey]
            }

            const nextPath = new Set(path).add(currentKey)
            return unique(parentKeys.flatMap((parentKey) => getRoots(parentKey, nextPath)))
        }

        return getRoots(key, new Set())
    }

    getParentNodes(key: string): string[] | void {
        return this.data.get(key)
    }

    getDistanceBetweenNodes(keyA: string, keyB: string): number {
        if (keyA === keyB) {
            return 0
        }

        const queue: [key: string, distance: number][] = [[keyA, 0]]
        const visited = new Set([keyA])

        while (queue.length > 0) {
            const [key, distance] = queue.shift()!
            const parentKeys = this.getParentNodes(key) ?? []
            const childKeys = [...this.data.entries()]
                .filter(([, parents]) => parents.includes(key))
                .map(([child]) => child)
            const neighbors = unique([...parentKeys, ...childKeys])

            for (const neighbor of neighbors) {
                if (neighbor === keyB) {
                    return distance + 1
                }
                if (!visited.has(neighbor)) {
                    visited.add(neighbor)
                    queue.push([neighbor, distance + 1])
                }
            }
        }

        return Number.POSITIVE_INFINITY
    }

    // seems faulty
    // getChildren(key: string): string[] {
    //     return this.data.entries()
    //         .filter(([, parentKeys]) => parentKeys.includes(key))
    //         .map(([childKey]) => childKey)
    //         .toArray()
    // }
}
