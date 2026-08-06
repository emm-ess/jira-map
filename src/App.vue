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
                    :disabled="sprintRange"
                >
                    {{ human.displayName }}
                </base-checkbox>
            </form-fieldset>

            <form-fieldset>
                <template #summary>
                    Sprint-Range
                </template>
                <base-checkbox
                    id="sprintRange"
                    v-model="sprintRange"
                >
                    SprintRange
                </base-checkbox>

                <label>
                    Start
                    <input
                        v-model="startSprint"
                        type="number"
                        :disabled="!sprintRange"
                        :min="sprintBounds[0]"
                        :max="sprintBounds[1]"
                    >
                </label>
                <label>
                    End
                    <input
                        v-model="endSprint"
                        type="number"
                        :disabled="!sprintRange"
                        :min="sprintBounds[0]"
                        :max="sprintBounds[1]"
                    >
                </label>
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
            <button type="button" @click="selectJsonFile">
                Import JSON
            </button>
            <input
                id="json-import"
                ref="fileInput"
                type="file"
                name="json-import"
                accept=".json"
                @change="importJsonFile()"
            >
        </form>
    </main>

    <element-dialog ref="dialog" />
</template>

<script lang="ts" setup>
import cytoscape, {type EventObject, type NodeCollection, type NodeSingular} from 'cytoscape'
import type {FcoseLayoutOptions} from 'cytoscape-fcose'
import {computed, onMounted, ref, useTemplateRef, watch} from 'vue'

import BaseCheckbox from '@/components/BaseCheckbox.vue'
import BaseSelect from '@/components/BaseSelect.vue'
import ElementDialog from '@/components/ElementDialog.vue'
import FormFieldset from '@/components/FormFieldset.vue'
import {onLayoutStop} from '@/customLayout.ts'
import {cytoscopeStyle} from '@/cytoscopeStyle.ts'
import {getIntersectionRestrictions, moveStationsAccordingToRestrictions} from '@/layoutHelper.ts'
import {saveBlob, saveText} from '@/misc.ts'

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
const fileInput = useTemplateRef('fileInput')

const layout = ref(LAYOUTS[1])
// const selectedLines = ref([AVAILABLE_LINES[8], AVAILABLE_LINES[13]])
const selectedLines = ref(AVAILABLE_LINES.filter((line) => line.handPickedColor))
const selectedUser = ref<string[]>([])
const selectedNodes = ref<NodeSelection[]>([]) // [AVAILABLE_NODE_TYPES.USER])
const selectedEdges = ref<EdgeSelection[]>([]) // [AVAILABLE_EDGES.MENTION_PER_USER])

const sprintRange = ref(false)
const startSprint = ref(1)
const endSprint = ref(10)
const sprintBounds = ref<[min: number, max: number]>([1, 10])

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
watch([startSprint, endSprint, sprintRange], updateSprintRange)

function updateSprintBounds(): void {
    let min = Infinity
    let max = 0
    for (const node of cy.nodes('[type="station"]')) {
        const sprintNumber = node.data('sprintNumber')
        if (sprintNumber !== undefined) {
            min = Math.min(min, sprintNumber)
            max = Math.max(max, sprintNumber)
        }
    }
    sprintBounds.value = [min, max]
}

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
    updateSprintBounds()
    updateUser()
    updateLayout()
}

function updateUser() {
    if (sprintRange.value) {
        return
    }
    // just take both things. better be safe than sorry.
    const userIdentifier = new Set(selectedUser.value.flatMap((user) => [user.name, user.key]))
    updateMarkedNodes((node) => {
        return node.data('assignedUsers').some((assignedUser) => userIdentifier.has(assignedUser))
    })
}

function updateSprintRange() {
    if (!sprintRange.value) {
        return
    }
    const startSprintClamped = Math.max(startSprint.value, sprintBounds.value[0])
    const endSprintClamped = Math.min(endSprint.value, sprintBounds.value[1])
    const sprintValues = new Set(Array.from({length: endSprintClamped - startSprintClamped + 1}, (_, i) => i + startSprintClamped))
    console.log('sprintValues', sprintValues)
    updateMarkedNodes((node) => {
        return sprintValues.has(node.data('sprintNumber'))
    })
}

function updateMarkedNodes(nodeFilter: (node: NodeSingular) => boolean) {
    const stationNodes = cy.nodes('[type="station"]')
    const filteredNodes = stationNodes.filter(nodeFilter)
    const filtered = !!filteredNodes.size()
    for (const node of stationNodes) {
        if (filtered && !filteredNodes.contains(node)) {
            node.addClass('unused')
        }
        else {
            node.removeClass('unused')
        }
    }
    for (const edge of cy.edges('[type="segment"]')) {
        if (filtered && (!filteredNodes.contains(edge.source())
            || !filteredNodes.contains(edge.target()))) {
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

function selectJsonFile() {
    if (fileInput.value) {
        fileInput.value.click()
    }
}

async function importJsonFile() {
    const content = await fileInput.value.files[0].text()
    cy.json(JSON.parse(content))
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

#json-import
    display: none
</style>
