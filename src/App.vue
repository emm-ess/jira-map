<template>
    <div id="cy" ref="cyEle"/>

    <base-select id="layout" :items="LAYOUTS" v-model="layout" />
</template>

<script lang="ts" setup>
import BaseSelect from '@/components/BaseSelect.vue'
import {useTemplateRef, onMounted, ref, watch} from 'vue'
import cytoscape from 'cytoscape'

import {LAYOUTS} from './layouts.ts'
import {commentPings, usersForCytoscape} from './data.ts'

const cyEle = useTemplateRef('cyEle')

const layout = ref(LAYOUTS[0])

let cy: cytoscape.Core


onMounted(() => {
    cy = cytoscape({
        container: cyEle.value,
        style: [{
            selector: 'node',
            style: {
                label: 'data(displayName)'
            }
        }, {
            selector: 'edge',
            style: {
                width: 1,
                'line-color': '#888',

                'target-arrow-shape': 'triangle',
                'target-arrow-color': '#888',

                'curve-style': 'bezier'
            }
        }]
    })
    cy.add(usersForCytoscape)
    cy.add(commentPings)
    cy.layout(layout.value.layout).run()
})

watch(layout, (newLayout) => {
    cy.layout({
        ...newLayout.layout,
    }).run()
})
</script>

<style lang="sass" scoped>
#cy
    width: 100vw
    height: 100vh
</style>
