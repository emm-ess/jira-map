<template>
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
</template>

<script lang="ts" setup>
import {useTemplateRef} from 'vue'

import {cy} from '../graph/cyWrapper.ts'
import {saveBlob, saveText} from '../misc.ts'

const fileInput = useTemplateRef('fileInput')

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
    const content = await fileInput.value?.files?.[0].text()
    if (content) {
        cy.json(JSON.parse(content))
    }
}
</script>

<style scoped lang="sass">
#json-import
    display: none
</style>
