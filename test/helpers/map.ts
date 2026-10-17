import cytoscape, {type Core, type ElementDefinition} from 'cytoscape'

/**
 * A small network in a readable form, the way fixtures describe it:
 * `lines` maps a line to its stations in travel order, `interchanges` lists
 * stations of different lines that are one stop.
 */
export type Network = {
    description?: string
    lines: Record<string, string[]>
    interchanges?: string[][]
}

/** What `data-prepared` holds for the app: stations and segments per line, interchanges as compound parents. */
function elementsOf({lines, interchanges = []}: Network) {
    const lineOfStation = new Map(Object.entries(lines).flatMap(([line, stations]) => stations.map((station) => [station, line] as const)))
    const stationsAndSegments: ElementDefinition[] = Object.entries(lines).flatMap(([line, stations]) => [
        ...stations.map((id, index): ElementDefinition => ({
            group: 'nodes',
            data: {type: 'station', id, name: id, line, sprintId: index, future: false, issues: [], areas: []},
        })),
        ...stations.slice(1).map((target, index): ElementDefinition => ({
            group: 'edges',
            data: {type: 'segment', id: `${line}-segment-${index}`, line, source: stations[index], target, distance: 1, future: false},
        })),
    ])
    const intersections = interchanges.map((children, index) => ({
        id: `interchange-${index}`,
        children,
        element: {
            group: 'nodes',
            data: {
                type: 'intersection',
                id: `interchange-${index}`,
                children,
                lines: [...new Set(children.map((station) => lineOfStation.get(station)))],
                issues: [],
            },
        } satisfies ElementDefinition,
    }))
    return {stationsAndSegments, intersections}
}

const builtMaps: Core[] = []

/** Destroys every map built since the last call (done after each test, see `test/setup.ts`). */
export function destroyMaps(): void {
    for (const cy of builtMaps.splice(0)) {
        cy.destroy()
    }
}

/**
 * Builds the graph the way `MapData.vue` does: interchanges first, then the
 * lines, then the stations are moved into their interchange. All stations
 * start at (0, 0) unless `positions` says otherwise.
 */
export function buildMap(network: Network, positions: Record<string, {x: number, y: number}> = {}): Core {
    const {stationsAndSegments, intersections} = elementsOf(network)
    const cy = cytoscape({headless: true, styleEnabled: true, style: [{selector: 'node', style: {width: 8, height: 8}}]})
    builtMaps.push(cy)
    cy.add(intersections.map(({element}) => element))
    cy.add(stationsAndSegments)
    for (const {id, children} of intersections) {
        for (const child of children) {
            cy.getElementById(child).move({parent: id})
        }
    }
    for (const [id, position] of Object.entries(positions)) {
        cy.getElementById(id).position(position)
    }
    return cy
}
