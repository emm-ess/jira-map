<template>
    <main>
        <div id="cy" ref="cyEle" />

        <form>
            <base-select
                id="layout"
                v-model="layout"
                :items="LAYOUTS"
            >
                Layout
            </base-select>

            <fieldset>
                <legend>"Lines"</legend>
                <div class="scrollwrapper">
                    <base-checkbox
                        v-for="line in AVAILABLE_LINES"
                        :id="line.name"
                        :key="line.name"
                        v-model="selectedLines"
                        :value="line"
                    >
                        {{ line.name }}
                    </base-checkbox>
                </div>
            </fieldset>

            <fieldset>
                <legend>Nodes</legend>
                <div class="scrollwrapper">
                    <base-checkbox
                        v-for="nodeType in Object.values(AVAILABLE_NODE_TYPES)"
                        :id="nodeType.type"
                        :key="nodeType.type"
                        v-model="selectedNodes"
                        :value="nodeType"
                    >
                        {{ nodeType.name }}
                    </base-checkbox>
                </div>
            </fieldset>

            <fieldset>
                <legend>Edges</legend>
                <div class="scrollwrapper">
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
                </div>
            </fieldset>
        </form>
    </main>

    <dialog
        ref="dialog"
        class="selected-item"
        popover
    >
        <dl v-if="selectedItem">
            <template
                v-for="[key, value] in Object.entries(selectedItem)"
                :key="key"
            >
                <dt>{{ key }}</dt>
                <dd>
                    <template v-if="key === 'issues'">
                        <article v-for="issue in value" :key="issue.key">
                            <h1>{{ issue.key }}: {{ issue.summary }}</h1>
                            <pre>
                                {{ issue.description }}
                            </pre>
                            <pre>{{ restIssueFields(issue) }}</pre>
                        </article>
                    </template>
                    <template v-else>
                        {{ value }}
                    </template>
                </dd>
            </template>
        </dl>
    </dialog>
</template>

<script lang="ts" setup>
import cytoscape, {type ElementDefinition, type EventObject} from 'cytoscape'
import {onMounted, ref, useTemplateRef, watch} from 'vue'

import BaseCheckbox from '@/components/BaseCheckbox.vue'
import BaseSelect from '@/components/BaseSelect.vue'
import {cytoscopeStyle} from '@/cytoscopeStyle.ts'
import {randomSelection} from '@/misc.ts'

import {
    AVAILABLE_EDGES,
    AVAILABLE_NODE_TYPES,
    type EdgeSelection,
    type EdgeType,
    type NodeSelection,
} from '../scripts/const.ts'
import type {Data} from '../types/data'
import {AVAILABLE_LINES, intersections, loadData} from './data.ts'
import {LAYOUTS} from './layouts.ts'

const cyEle = useTemplateRef('cyEle')
const dialog = useTemplateRef('dialog')

const layout = ref(LAYOUTS[0])
const selectedLines = ref(randomSelection(AVAILABLE_LINES, 5))
const selectedNodes = ref<NodeSelection[]>([]) // [AVAILABLE_NODE_TYPES.USER])
const selectedEdges = ref<EdgeSelection[]>([]) // [AVAILABLE_EDGES.MENTION_PER_USER])

const selectedItem = ref<ElementDefinition>()

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

function restIssueFields(issue: Data.Issue): string {
    const {key, summary, description, assignee, assignedUsers, mentionedUsers, lastViewed, ...rest} = issue
    return JSON.stringify(rest, null, 2)
}

function updateLayout() {
    cy.clearQueue()
    cy.layout(layout.value.layout).run()
}

function selectItem(element: EventObject): void {
    selectedItem.value = element.target.data()
    dialog.value?.showPopover()
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
    updateLayout()
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
</script>

<style lang="sass" scoped>
main
    display: flex
    width: 100vw
    height: 100vh

#cy
    flex: 1 1 auto

form
    display: flex
    flex-direction: column
    gap: 16px
    padding: 16px
    width: 12.25%
    height: 100%

fieldset
    flex: 1 1 auto
    overflow: auto

.scrollwrapper
    display: flex
    flex-direction: column
    gap: 8px

dialog
    max-width: 80%
    max-height: 80%
    overflow: auto

dd
    margin: 0 0 0 16px
    padding: 0
</style>
