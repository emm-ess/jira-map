<template>
    <div id="cy" ref="cyEle" />

    <base-select
        id="layout"
        v-model="layout"
        :items="LAYOUTS"
    >
        Layout
    </base-select>
    <base-select
        id="mentions"
        v-model="commentMentions"
        :items="AVAILABLE_MENTIONS"
    >
        Mentions
    </base-select>
</template>

<script lang="ts" setup>
import cytoscape from 'cytoscape'
import {onMounted, ref, useTemplateRef, watch} from 'vue'

import BaseSelect from '@/components/BaseSelect.vue'

import {AVAILABLE_MENTIONS, loadData, usersForCytoscape} from './data.ts'
import {LAYOUTS} from './layouts.ts'

const cyEle = useTemplateRef('cyEle')

const layout = ref(LAYOUTS[0])
const commentMentions = ref(AVAILABLE_MENTIONS[0])

let cy: cytoscape.Core

onMounted(() => {
    cy = cytoscape({
        container: cyEle.value,
        style: [{
            selector: 'node',
            style: {
                label: 'data(displayName)',
            },
        }, {
            selector: 'edge',
            style: {
                width: 'mapData(weight, 0, 1, 1, 10)',
                'line-color': '#888',

                'target-arrow-shape': 'triangle',
                'target-arrow-color': '#888',

                'curve-style': 'bezier',
            },
        }],
    })
    cy.add(usersForCytoscape)
    cy.layout(layout.value.layout).run()
})

watch(layout, (newLayout) => {
    cy.layout({
        ...newLayout.layout,
    }).run()
})

watch(commentMentions, async (newCommentMentions) => {
    const data = await loadData(newCommentMentions.file)
    cy.remove(
        cy.elements().filter((element) => element.group() === 'edges'),
    )
    cy.add(data)
}, {immediate: true})
</script>

<style lang="sass" scoped>
#cy
    width: 100vw
    height: 100vh
</style>
