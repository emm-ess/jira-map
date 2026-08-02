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
                <legend>Nodes</legend>
                <base-checkbox
                    v-for="nodeType in Object.values(AVAILABLE_NODE_TYPES)"
                    :id="nodeType.type"
                    :key="nodeType.type"
                    v-model="selectedNodes"
                    :value="nodeType"
                >
                    {{ nodeType.name }}
                </base-checkbox>
            </fieldset>
            <fieldset>
                <legend>Edges</legend>
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
                <dd>{{ value }}</dd>
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

import {
    AVAILABLE_EDGES,
    AVAILABLE_NODE_TYPES,
    type EdgeSelection,
    type EdgeType,
    type NodeSelection,
} from '../scripts/const.ts'
import {loadData} from './data.ts'
import {LAYOUTS} from './layouts.ts'

const cyEle = useTemplateRef('cyEle')
const dialog = useTemplateRef('dialog')

const layout = ref(LAYOUTS[0])
const selectedNodes = ref<NodeSelection[]>([AVAILABLE_NODE_TYPES.USER])
const selectedEdges = ref<EdgeSelection[]>([AVAILABLE_EDGES.MENTION_PER_USER])

const selectedItem = ref<ElementDefinition>()

let cy: cytoscape.Core

onMounted(async () => {
    cy = cytoscape({
        container: cyEle.value,
        style: cytoscopeStyle,
    })
    await updateNodes()
    await updateEdges()
    cy.layout(layout.value.layout).run()
    cy.on('click', 'node', selectItem)
})

watch(layout, (newLayout) => {
    cy.clearQueue()
    cy.layout(newLayout.layout).run()
})

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

watch(selectedNodes, updateNodes, {deep: true})
watch(selectedEdges, updateEdges, {immediate: true, deep: true})

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
}

async function updateEdges() {
    // eslint-disable-next-line compat/compat
    const data = await Promise.all(selectedEdges.value.map((edgeType) => loadData(edgeType.filename)))
    const edgesToKeep = new Set(selectedEdges.value.map((edgeType) => edgeType.type))
    cleanEdges(edgesToKeep)
    cy.add(data.flat())
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

fieldset
    display: flex
    flex-direction: column
    gap: 8px

dd
    margin: 0 0 0 16px
    padding: 0
</style>
