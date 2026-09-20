<template>
    <main ref="root">
        <form @submit.prevent>
            <map-layout />
            <map-data />
            <map-imexports />
        </form>
    </main>

    <element-dialog ref="dialog" />
</template>

<script lang="ts" setup>
import {type EventObject} from 'cytoscape'
import {onMounted, useTemplateRef} from 'vue'

import ElementDialog from './components/ElementDialog.vue'
import MapData from './components/MapData.vue'
import MapImexports from './components/MapImexports.vue'
import MapLayout from './components/MapLayout.vue'
import {cy, cyDomNode} from './graph/cyWrapper.ts'

const root = useTemplateRef('root')
const dialog = useTemplateRef('dialog')

onMounted(async () => {
    root.value?.prepend(cyDomNode)
    console.log('cy', cy)
    cy.on('click', 'node', selectItem)
    cy.on('click', 'edge', selectItem)
})

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

form
    display: flex
    flex-direction: column
    gap: 16px
    padding: 16px
    width: 12.25%
    height: 100%
</style>
