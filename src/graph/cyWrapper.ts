import cytoscape, {type LayoutOptions, type Position} from 'cytoscape'
import cola from 'cytoscape-cola'
import dagre from 'cytoscape-dagre'
import elk from 'cytoscape-elk'
import euler from 'cytoscape-euler'
import fcose from 'cytoscape-fcose'
import layoutUtilities from 'cytoscape-layout-utilities'
import svg from 'cytoscape-svg'
import {defineStore} from 'pinia'
import {computed, readonly, ref, shallowRef, watch} from 'vue'

import {loadData} from '@/data.ts'
import {AreaGraph} from '@/graph/areaGraph.ts'
import {
    applyIntersectionClustering,
    applyLineAlignment,
    applySchematicGeometry,
    getLineRestrictions,
} from '@/graph/customLayout.ts'
import {
    type Constraints,
    getIntersectionRestrictions,
    mergeConstraints,
    moveStationsAccordingToRestrictions,
    RESTRICTION_ORDERS,
} from '@/graph/layoutHelper.ts'
import {LAYOUTS} from '@/graph/layouts.ts'
import {applyOctilinearLayout, applyStressLayout} from '@/graph/transitMap.ts'
import {applyLineUntangling} from '@/graph/untangle.ts'

import {cytoscopeStyle} from './cytoscopeStyle.ts'

cytoscape.use(layoutUtilities)
cytoscape.use(cola)
cytoscape.use(dagre)
cytoscape.use(elk)
cytoscape.use(euler)
cytoscape.use(fcose)
cytoscape.use(svg)

export const cyDomNode = document.createElement('div')
cyDomNode.id = 'cy'

const layout = ref(LAYOUTS[0])

/** How strongly related stations are pulled together by the stress layout (0 to 1). */
const RELATEDNESS_STRENGTH = 0.2

const areaGraph = new AreaGraph()

async function loadIssueSummaries(): Promise<(issueId: string) => string> {
    const issues = await loadData<Record<string, {summary: string} | undefined>>('data/issues')
    return (issueId) => issues[issueId]?.summary ?? ''
}

export const cy = cytoscape({
    container: cyDomNode,
    style: cytoscopeStyle,
    layout: layout.value.layout,
})

function removeIntersectionHack() {
    cy.remove(cy.nodes('[type="intersection-hack"]'))
}

export function addIntersectionHack() {
    removeIntersectionHack()
    for (const intersection of cy.nodes('[type="intersection"]')) {
        cy.add({
            group: 'nodes',
            position: intersection.position(),
            data: {
                id: `${intersection.id()}-hack`,
                type: 'intersection-hack',
            },
            style: {
                width: intersection.width(),
                height: intersection.height(),
            },
        })
    }
}

/** Current position of a station, `undefined` if it is no longer on the map. */
function positionOfStation(id: string): Position | undefined {
    const node = cy.getElementById(id)
    return node.nonempty()
        ? node.position()
        : undefined
}

function removeEmptyIntersections() {
    // todo: that's quick solution
    for (const intersection of cy.nodes('[type="intersection"]')) {
        if (intersection.children().length < 2) {
            intersection.children().move({
                // eslint-disable-next-line unicorn/no-null
                parent: null,
            })
            intersection.remove()
        }
    }
}

export const useCyStore = defineStore('cyStore', () => {
    const updating = ref(false)
    const status = ref('')

    const randomStartPositions = ref(true)
    const pullRelated = ref(false)
    const restrictions = shallowRef<Constraints>()
    const lineRestrictions = shallowRef<Constraints>()
    const restrictionOrder = ref(RESTRICTION_ORDERS[0])

    const stationsMovable = computed(() => !!restrictions.value?.relativePlacementConstraint.length)
    const restrictable = computed(() => {
        const alignmentConstraints = restrictions.value?.alignmentConstraint
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        return !!(stationsMovable.value || alignmentConstraints?.horizontal?.length || alignmentConstraints?.vertical?.length)
    })

    const lineRestrictable = computed(() => {
        const alignment = lineRestrictions.value?.alignmentConstraint
        return (alignment?.horizontal?.length ?? 0) + (alignment?.vertical?.length ?? 0) > 0
    })

    watch(layout, () => runLayout())

    async function runLayout() {
        updating.value = true
        removeIntersectionHack()
        removeEmptyIntersections()
        const layoutFinished = cy.promiseOn('layoutstop')
        const activeRestrictions = [restrictions.value, lineRestrictions.value]
            .filter((set) => set !== undefined)
        const merged = activeRestrictions.length > 0
            ? mergeConstraints(activeRestrictions, positionOfStation, restrictionOrder.value.value)
            : undefined
        cy.layout({
            ...layout.value.layout,
            ...merged,
            randomize: randomStartPositions.value,
        } as LayoutOptions).run()
        await layoutFinished
        status.value = 'Layout finished'
        updating.value = false
    }

    function computeRestrictions() {
        updating.value = true
        restrictions.value = getIntersectionRestrictions(cy)
        status.value = restrictions.value.relativePlacementConstraint.length > 0
            ? `Computed ${restrictions.value.relativePlacementConstraint.length} restriction(s).`
            : 'No intersections need restrictions.'
        updating.value = false
    }

    function clearRestrictions() {
        restrictions.value = undefined
        status.value = 'Restrictions cleared.'
    }

    function moveStations() {
        updating.value = true
        if (!stationsMovable.value) {
            status.value = 'Compute restrictions first.'
            return
        }
        const moved = moveStationsAccordingToRestrictions(cy, restrictions.value!.relativePlacementConstraint)
        status.value = moved
            ? 'Stations moved inside intersections.'
            : 'Nothing to move, stations already match the restrictions.'
        updating.value = false
    }

    function computeLineRestrictions() {
        updating.value = true
        lineRestrictions.value = getLineRestrictions(cy.elements(), restrictionOrder.value.value)
        const groups = (lineRestrictions.value.alignmentConstraint.horizontal?.length ?? 0)
            + (lineRestrictions.value.alignmentConstraint.vertical?.length ?? 0)
        status.value = groups > 0
            ? `Computed ${groups} line alignment(s), ${lineRestrictions.value.relativePlacementConstraint.length} ordering(s).`
            : 'No horizontal/vertical line stretches found.'
        updating.value = false
    }

    function clearLineRestrictions() {
        lineRestrictions.value = undefined
        status.value = 'Line restrictions cleared.'
    }

    function alignStationsOntoLines() {
        updating.value = true
        const changed = lineRestrictions.value !== undefined && applyLineAlignment(cy.elements(), lineRestrictions.value)
        if (changed) {
            cy.fit(cy.elements(), 30)
        }
        status.value = changed
            ? 'Stations moved onto their lines.'
            : 'Nothing to move, compute line restrictions first or stations already aligned.'
        updating.value = false
    }

    async function stressLayoutStep() {
        updating.value = true
        const relatedness = pullRelated.value
            ? {
                summaryOf: await loadIssueSummaries(),
                areaDistance: (areaA: string, areaB: string) => areaGraph.getDistanceBetweenNodes(areaA, areaB),
                strength: RELATEDNESS_STRENGTH,
            }
            : undefined
        const changed = applyStressLayout(cy.elements(), {relatedness})
        if (changed) {
            cy.fit(cy.elements(), 30)
        }
        status.value = changed
            ? 'Network laid out with even stop spacing.'
            : 'Nothing changed.'
        updating.value = false
    }

    function octilinearStep() {
        updating.value = true
        const changed = applyOctilinearLayout(cy.elements())
        if (changed) {
            cy.fit(cy.elements(), 30)
        }
        status.value = changed
            ? 'Tracks turned onto horizontal, vertical and 45° directions.'
            : 'Already octilinear, nothing changed.'
        updating.value = false
    }

    function raster() {
        updating.value = true
        const changed = applySchematicGeometry(cy.elements())
        if (changed) {
            cy.fit(cy.elements(), 30)
        }
        status.value = changed
            ? 'Nodes/lines rastered to the 45° grid.'
            : 'Already on the grid, nothing changed.'
        updating.value = false
    }

    function clusterIntersections() {
        updating.value = true
        const changed = applyIntersectionClustering(cy.elements())
        if (changed) {
            cy.fit(cy.elements(), 30)
        }
        status.value = changed
            ? 'Intersection stations clustered.'
            : 'Already clustered, nothing changed.'
        updating.value = false
    }

    function untangleLines() {
        updating.value = true
        const changed = applyLineUntangling(cy.elements())
        if (changed) {
            cy.fit(cy.elements(), 30)
        }
        status.value = changed
            ? 'Stations of interchanges reordered, fewer lines cross.'
            : 'No swap reduces crossings, nothing changed.'
        updating.value = false
    }

    return {
        updating: readonly(updating),
        layout,
        randomStartPositions,
        pullRelated,
        restrictionOrder,
        status: readonly(status),
        restrictable,
        stationsMovable,
        lineRestrictable,

        runLayout,
        computeRestrictions,
        clearRestrictions,
        moveStations,
        computeLineRestrictions,
        clearLineRestrictions,
        alignStationsOntoLines,
        stressLayoutStep,
        octilinearStep,
        raster,
        clusterIntersections,
        untangleLines,
    }
})
