<template>
    <main>
        <div id="cy" ref="cyEle" />

        <form @submit.prevent>
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

            <form-fieldset>
                <template #summary>
                    "Lines"
                </template>
                <base-checkbox
                    v-for="line in AVAILABLE_LINES"
                    :id="line.name"
                    :key="line.name"
                    v-model="selectedLines"
                    :value="line"
                >
                    {{ line.name }}
                </base-checkbox>
            </form-fieldset>

            <form-fieldset>
                <template #summary>
                    Humans
                </template>
                <base-checkbox
                    v-for="human in user"
                    :id="human.name"
                    :key="human.name"
                    v-model="selectedUser"
                    :value="human"
                >
                    {{ human.displayName }}
                </base-checkbox>
            </form-fieldset>

            <details>
                <summary>"Raw"-Data</summary>
                <form-fieldset>
                    <template #summary>
                        Nodes
                    </template>
                    <base-checkbox
                        v-for="nodeType in Object.values(AVAILABLE_NODE_TYPES)"
                        :id="nodeType.type"
                        :key="nodeType.type"
                        v-model="selectedNodes"
                        :value="nodeType"
                    >
                        {{ nodeType.name }}
                    </base-checkbox>
                </form-fieldset>

                <form-fieldset>
                    <template #summary>
                        Edges
                    </template>
                    <base-checkbox
                        v-for="edgeType in Object.values(AVAILABLE_EDGES)"
                        :id="edgeType.type"
                        :key="edgeType.type"
                        v-model="selectedEdges"
                        :value="edgeType"
                        :disabled="!isEdgePossible(edgeType)"
                    >
                        {{ edgeType.name }}
                    </base-checkbox>
                </form-fieldset>
            </details>

            <button type="button" @click="exportImage">
                Export PNG
            </button>
            <button type="button" @click="exportSvg">
                Export SVG
            </button>
            <button type="button" @click="exportJson">
                Export JSON
            </button>
        </form>
    </main>

    <element-dialog ref="dialog" />
</template>

<script lang="ts" setup>
import cytoscape, {type EventObject} from 'cytoscape'
import type {FcoseLayoutOptions} from 'cytoscape-fcose'
import {onMounted, ref, useTemplateRef, watch} from 'vue'

import BaseCheckbox from '@/components/BaseCheckbox.vue'
import BaseSelect from '@/components/BaseSelect.vue'
import ElementDialog from '@/components/ElementDialog.vue'
import FormFieldset from '@/components/FormFieldset.vue'
import {onLayoutStop} from '@/customLayout.ts'
import {cytoscopeStyle} from '@/cytoscopeStyle.ts'
import {getIntersectionRestrictions, moveStationsAccordingToRestrictions} from '@/layoutHelper.ts'
import {randomSelection, saveBlob, saveText} from '@/misc.ts'

import {
    AVAILABLE_EDGES,
    AVAILABLE_NODE_TYPES,
    type EdgeSelection,
    type EdgeType,
    type NodeSelection,
} from '../scripts/const.ts'
import {AVAILABLE_LINES, intersections, loadData, user} from './data.ts'
import {LAYOUTS} from './layouts.ts'

const cyEle = useTemplateRef('cyEle')
const dialog = useTemplateRef('dialog')

const layout = ref(LAYOUTS[1])
// const selectedLines = ref([AVAILABLE_LINES[8], AVAILABLE_LINES[13]])
const selectedLines = ref(AVAILABLE_LINES.filter((line) => line.handPickedColor))
const selectedUser = ref<string[]>([])
const selectedNodes = ref<NodeSelection[]>([]) // [AVAILABLE_NODE_TYPES.USER])
const selectedEdges = ref<EdgeSelection[]>([]) // [AVAILABLE_EDGES.MENTION_PER_USER])

let cy: cytoscape.Core

onMounted(async () => {
    cy = cytoscape({
        container: cyEle.value,
        style: cytoscopeStyle,
    })
    // cy.add(intersections)
    await updateLines()
    // await updateNodes()
    // await updateEdges()
    updateLayout()
    cy.on('click', 'node', selectItem)
    cy.on('click', 'edge', selectItem)
    console.log('cy', cy)
})

watch(layout, updateLayout)

async function updateLayout() {
    cy.clearQueue()
    removeIntersectionHack()
    // todo: that's quick solution
    for (const intersection of cy.nodes('[type="intersection"]')) {
        if (intersection.children().length < 2) {
            intersection.children().move({
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
        const restrictions = getIntersectionRestrictions(cy.nodes('[type="intersection"]'))
        console.log('rest', restrictions)
        moveStationsAccordingToRestrictions(cy, restrictions.relativeConstrains)
        cy.layout({
            ...layout.value.layout,
            randomize: true,
            ...restrictions,
            stop: onLayoutStop,
        } as FcoseLayoutOptions).run()
    }
}

function removeIntersectionHack() {
    cy.remove(cy.nodes('[type="intersection-hack"]'))
}

function addIntersectionHack() {
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

function isEdgePossible(edge: EdgeSelection): boolean {
    return edge.nodes.every((nodeType) => selectedNodes.value.some((selected) => selected.type === nodeType))
}

function cleanEdges(edgeTypeToKeep: Set<EdgeType>): void {
    cy.remove(
        cy.edges().filter((element) => !edgeTypeToKeep.has(element.data().type)),
    )
}

watch(selectedLines, updateLines, {deep: true})
watch(selectedUser, updateUser, {deep: true})
watch(selectedNodes, updateNodes, {deep: true})
watch(selectedEdges, updateEdges, {deep: true})

async function updateLines() {
    // eslint-disable-next-line compat/compat
    const data = await Promise.all(selectedLines.value.map((nodeType) => loadData(nodeType.filename)))
    const lines = new Set(selectedLines.value.map((line) => line.name))
    const eles = data.flat()
    const stuffToKeep = new Set(eles.map((ele) => ele.data.id))
    const filteredIntersectionNodes = intersections.filter((ele) =>
        ele.data.lines.filter((line) => lines.has(line)).length > 1)
    cy.remove(
        cy.nodes().filter((element) => {
            const data = element.data()
            return !(stuffToKeep.has(data.id)
                || (data.type === 'intersection' && filteredIntersectionNodes.some((node) => node.data.id === data.id)))
        }),
    )
    cy.remove(
        cy.edges().filter((element) => !stuffToKeep.has(element.data().id)),
    )
    cy.add(filteredIntersectionNodes)
    cy.add(eles)
    for (const ele of filteredIntersectionNodes) {
        const children = ele.data.children.flatMap((childId) => cy.nodes(`[id="${childId}"]`))
        for (const child of children) {
            child.move({parent: ele.data.id})
        }
    }
    // @ts-expect-error
    // const helperEdges = createInvisibleForces(cy.nodes().toArray() as StationNode[])
    // console.log('---> helperEdges:', helperEdges)
    // cy.add(helperEdges)
    updateUser()
    updateLayout()
}

function updateUser() {
    // just take both things. better be safe than sorry.
    const userIdentifier = new Set(selectedUser.value.flatMap((user) => [user.name, user.key]))
    const stationNodes = cy.nodes('[type="station"]')
    const assignedStationNodes = stationNodes.filter((node) => {
        return node.data('assignedUsers').some((assignedUser) => userIdentifier.has(assignedUser))
    })
    const filtered = selectedUser.value.length
    for (const node of stationNodes) {
        if (filtered && !assignedStationNodes.contains(node)) {
            node.addClass('unused')
        }
        else {
            node.removeClass('unused')
        }
    }
    for (const edge of cy.edges('[type="segment"]')) {
        if (filtered && (!assignedStationNodes.contains(edge.source())
            || !assignedStationNodes.contains(edge.target()))) {
            edge.addClass('unused')
        }
        else {
            edge.removeClass('unused')
        }
    }
}

async function updateNodes() {
    const edgesToKeep = new Set(selectedEdges.value
        .filter(isEdgePossible)
        .map((edge) => edge.type))
    cleanEdges(edgesToKeep)

    // eslint-disable-next-line compat/compat
    const data = await Promise.all(selectedNodes.value.map((nodeType) => loadData(nodeType.filename)))
    const nodesToKeep = new Set(selectedNodes.value.map((nodeType) => nodeType.type))
    cy.remove(
        cy.nodes().filter((element) => !nodesToKeep.has(element.data().type)),
    )
    cy.add(data.flat())
    updateLayout()
}

async function updateEdges() {
    // eslint-disable-next-line compat/compat
    const data = await Promise.all(selectedEdges.value.map((edgeType) => loadData(edgeType.filename)))
    const edgesToKeep = new Set(selectedEdges.value.map((edgeType) => edgeType.type))
    cleanEdges(edgesToKeep)
    cy.add(data.flat())
    updateLayout()
}

async function exportImage() {
    const imageBlob = await cy.png({
        output: 'blob-promise',
        full: true,
        scale: 4,
    })
    saveBlob(imageBlob, 'export.png')
}

function exportSvg() {
    // https://www.npmjs.com/package/cytoscape-svg
    const svg = cy.svg({
        full: true,
        scale: 4,
    })
    saveText(svg, 'export.svg')
}

function exportJson() {
    saveText(JSON.stringify(cy.json()), 'export.json')
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
