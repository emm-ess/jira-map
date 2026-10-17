export * as c from 'cytoscape'

declare module 'cytoscape' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- only an interface merges into Cytoscape's
    interface Core {
        svg(options: unknown): string
    }
}
