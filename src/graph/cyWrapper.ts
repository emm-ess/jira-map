import cytoscape, {type EventObject, type LayoutOptions} from 'cytoscape'
import cola from 'cytoscape-cola'
import dagre from 'cytoscape-dagre'
import elk from 'cytoscape-elk'
import euler from 'cytoscape-euler'
import fcose, {type FcoseRelativePlacementConstraint} from 'cytoscape-fcose'
import layoutUtilities from 'cytoscape-layout-utilities'
import svg from 'cytoscape-svg'
import {defineStore} from 'pinia'
import {computed, readonly, ref, shallowRef, watch} from 'vue'

import {applyIntersectionClustering, applySchematicGeometry} from '@/graph/customLayout.ts'
import {
    type Constraints,
    getIntersectionRestrictions,
    moveStationsAccordingToRestrictions,
} from '@/graph/layoutHelper.ts'
import {LAYOUTS} from '@/graph/layouts.ts'

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
    const restrictions = shallowRef<Constraints>()

    const stationsMovable = computed(() => !!restrictions.value?.relativePlacementConstraint.length)
    const restrictable = computed(() => {
        const alignmentConstraints = restrictions.value?.alignmentConstraint
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        return !!(stationsMovable.value || alignmentConstraints?.horizontal?.length || alignmentConstraints?.vertical?.length)
    })

    watch(layout, () => runLayout())

    async function runLayout() {
        updating.value = true
        removeIntersectionHack()
        removeEmptyIntersections()
        const layoutFinished = cy.promiseOn('layoutstop')
        cy.layout({
            ...layout.value.layout,
            ...restrictions.value,
            randomize: randomStartPositions.value,
        }).run()
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

    return {
        updating: readonly(updating),
        layout,
        randomStartPositions,
        status: readonly(status),
        restrictable,
        stationsMovable,

        runLayout,
        computeRestrictions,
        clearRestrictions,
        moveStations,
        raster,
        clusterIntersections,
    }
})
