declare module 'cytoscape-cola' {
    const cola: cytoscape.Ext
    export default cola
}
declare module 'cytoscape-elk' {
    const elk: cytoscape.Ext
    export default elk
}
declare module 'cytoscape-layout-utilities' {
    const layout: cytoscape.Ext
    export default layout
}
declare module 'cytoscape-svg' {
    const svg: cytoscape.Ext
    export default svg
}

export * as c from 'cytoscape'
declare module 'cytoscape' {
    interface Core {
        svg(options: unknown): string
    }
}
