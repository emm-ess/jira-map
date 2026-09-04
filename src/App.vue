<template>
    <main>
        <div id="cy" ref="cyEle" />

        <form v-if="cyMounted" @submit.prevent>
            <base-select
                id="layout"
                v-model="layout"
                :items="LAYOUTS"
            >
                Layout
            </base-select>
            <button type="button" @click="updateLayout">
                Re-run layouting
            </button>
            <button type="button" @click="addIntersectionHack()">
                add intersection hack
            </button>

            <map-data ref="mapDataRef" :cy />
            <map-imexports :cy />
        </form>
    </main>

    <element-dialog ref="dialog" />
</template>

<script lang="ts" setup>
import cytoscape, {type EventObject} from 'cytoscape'
import {nextTick, onMounted, ref, useTemplateRef, watch} from 'vue'

import BaseSelect from './components/BaseSelect.vue'
import ElementDialog from './components/ElementDialog.vue'
import MapData from './components/MapData.vue'
import MapImexports from './components/MapImexports.vue'
import {cytoscopeStyle} from './graph/cytoscopeStyle.ts'
import {getIntersectionRestrictions, moveStationsAccordingToRestrictions} from './graph/layoutHelper.ts'
import {LAYOUTS} from './graph/layouts.ts'

const cyEle = useTemplateRef('cyEle')
const dialog = useTemplateRef('dialog')
const mapDataRef = useTemplateRef('mapDataRef')

const layout = ref(LAYOUTS[1])
const cyMounted = ref(false)
let cy: cytoscape.Core

onMounted(async () => {
    cy = cytoscape({
        container: cyEle.value,
        style: cytoscopeStyle,
    })
    console.log('cy', cy)
    cy.on('click', 'node', selectItem)
    cy.on('click', 'edge', selectItem)
    cyMounted.value = true
    await nextTick()
    // cy.add(intersections)
    await mapDataRef.value?.updateLines()
    // await updateNodes()
    // await updateEdges()
    updateLayout()
})

watch(layout, updateLayout)

async function updateLayout() {
    cy.clearQueue()
    removeIntersectionHack()
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
    const layoutFinished = cy.promiseOn('layoutstop')
    console.log('starting')
    cy.layout(layout.value.layout).run()
    console.log('running')
    await layoutFinished
    console.log('finished')
    if (layout.value.name === 'hopefully mappy') {
        const restrictions = getIntersectionRestrictions(cy)
        console.log('rest', restrictions)
        moveStationsAccordingToRestrictions(cy, restrictions.relativeConstrains)
        // const layoutFinished2 = cy.promiseOn('layoutstop')
        // cy.layout({
        //     ...layout.value.layout,
        //     // randomize: true,
        //     ...restrictions,
        //     // stop: onLayoutStop,
        // } as FcoseLayoutOptions).run()
        // await layoutFinished2
        // const restrictions2 = getIntersectionRestrictions(cy.nodes('[type="intersection"]'))
        // moveStationsAccordingToRestrictions(cy, restrictions2.relativeConstrains)
    }
}

function removeIntersectionHack() {
    cy.remove(cy.nodes('[type="intersection-hack"]'))
}

function addIntersectionHack() {
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

function selectItem(element: EventObject): void {
    console.log('selectItem', element.target.position())
    dialog.value?.showPopover(element.target.data())
}
</script>

<style lang="sass" scoped>
main
    display: flex
    width: 100vw
    height: 100vh
    background-color: #EDEEF0

#cy
    flex: 1 1 auto
    aspect-ratio: 5 / 4
    background-color: #FFF
    border: 1px solid #000

form
    display: flex
    flex-direction: column
    gap: 16px
    padding: 16px
    width: 12.25%
    height: 100%
</style>
