<template>
    <form-fieldset>
        <template #summary>
            Layout steps
        </template>
        <base-select
            id="layout"
            v-model="cyStore.layout"
            :items="LAYOUTS"
        >
            Layout
        </base-select>
        <button type="button" @click="cyStore.runLayout">
            Re-run layouting
        </button>
        <button type="button" @click="addIntersectionHack">
            add intersection hack
        </button>
        <button type="button" @click="cyStore.computeRestrictions">
            Compute intersection restrictions
        </button>
        <button
            type="button"
            :disabled="!cyStore.restrictable"
            @click="cyStore.clearRestrictions"
        >
            Clear intersection restrictions
        </button>
        <button
            type="button"
            :disabled="!cyStore.stationsMovable"
            @click="cyStore.moveStations"
        >
            Move stations into intersections
        </button>
        <button type="button" @click="cyStore.raster">
            Raster nodes/lines (45°)
        </button>
        <p v-if="cyStore.status">
            {{ cyStore.status }}
        </p>
    </form-fieldset>
</template>

<script lang="ts" setup>
import {addIntersectionHack, useCyStore} from '../graph/cyWrapper.ts'
import {LAYOUTS} from '../graph/layouts.ts'
import BaseSelect from './BaseSelect.vue'
import FormFieldset from './FormFieldset.vue'

const cyStore = useCyStore()
</script>
