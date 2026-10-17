<template>
    <form-fieldset :title="help.panel">
        <template #summary>
            Layout steps
        </template>
        <form-fieldset open :title="help.layoutGroup">
            <template #summary>
                Layout
            </template>
            <base-select
                id="layout"
                v-model="cyStore.layout"
                :items="LAYOUTS"
                :title="help.layout"
            >
                Layout
            </base-select>
            <base-checkbox
                id="randomize"
                v-model="cyStore.randomStartPositions"
                :title="help.randomize"
            >
                Randomize start positions
            </base-checkbox>
            <base-select
                id="restriction-order"
                v-model="cyStore.restrictionOrder"
                :items="RESTRICTION_ORDERS"
                :title="help.restrictionOrder"
            >
                Resolve restrictions
            </base-select>
            <button
                type="button"
                :title="help.rerun"
                @click="cyStore.runLayout"
            >
                Re-run layouting
            </button>
            <button
                type="button"
                :title="help.hack"
                @click="addIntersectionHack"
            >
                add intersection hack
            </button>
        </form-fieldset>
        <form-fieldset open :title="help.transitGroup">
            <template #summary>
                Transit map
            </template>
            <base-checkbox
                id="pull-related"
                v-model="cyStore.pullRelated"
                :title="help.pullRelated"
            >
                Pull related stations together
            </base-checkbox>
            <button
                type="button"
                :title="help.stress"
                @click="cyStore.stressLayoutStep"
            >
                1. Stress layout (even stop spacing)
            </button>
            <button
                type="button"
                :title="help.octilinear"
                @click="cyStore.octilinearStep"
            >
                2. Octilinear tracks (45°)
            </button>
            <button
                type="button"
                :title="help.untangle"
                @click="cyStore.untangleLines"
            >
                3. Order lines at interchanges (fewest crossings)
            </button>
        </form-fieldset>
        <form-fieldset open :title="help.insideGroup">
            <template #summary>
                Inside intersections
            </template>
            <button
                type="button"
                :title="help.computeRestrictions"
                @click="cyStore.computeRestrictions"
            >
                Compute intersection restrictions
            </button>
            <button
                type="button"
                :title="help.clearRestrictions"
                :disabled="!cyStore.restrictable"
                @click="cyStore.clearRestrictions"
            >
                Clear intersection restrictions
            </button>
            <button
                type="button"
                :title="help.moveStations"
                :disabled="!cyStore.stationsMovable"
                @click="cyStore.moveStations"
            >
                Move stations into intersections
            </button>
            <button
                type="button"
                :title="help.cluster"
                @click="cyStore.clusterIntersections"
            >
                Cluster intersection stations
            </button>
        </form-fieldset>
        <form-fieldset open :title="help.betweenGroup">
            <template #summary>
                Between intersections
            </template>
            <button
                type="button"
                :title="help.computeLineRestrictions"
                @click="cyStore.computeLineRestrictions"
            >
                Compute line restrictions
            </button>
            <button
                type="button"
                :title="help.clearLineRestrictions"
                :disabled="!cyStore.lineRestrictable"
                @click="cyStore.clearLineRestrictions"
            >
                Clear line restrictions
            </button>
            <button
                type="button"
                :title="help.alignStations"
                :disabled="!cyStore.lineRestrictable"
                @click="cyStore.alignStationsOntoLines"
            >
                Move stations onto lines
            </button>
        </form-fieldset>
        <form-fieldset open :title="help.geometryGroup">
            <template #summary>
                Geometry
            </template>
            <button
                type="button"
                :title="help.raster"
                @click="cyStore.raster"
            >
                Raster nodes/lines (45°)
            </button>
        </form-fieldset>
        <p v-if="cyStore.status">
            {{ cyStore.status }}
        </p>
    </form-fieldset>
</template>

<script lang="ts" setup>
import {addIntersectionHack, useCyStore} from '../graph/cyWrapper.ts'
import {RESTRICTION_ORDERS} from '../graph/layoutHelper.ts'
import {LAYOUTS} from '../graph/layouts.ts'
import BaseCheckbox from './BaseCheckbox.vue'
import BaseSelect from './BaseSelect.vue'
import FormFieldset from './FormFieldset.vue'

const cyStore = useCyStore()

/** Tooltips: what each step does, what it reads, when to use it. Shown on hover. */
function lines(...text: string[]): string {
    return text.join('\n')
}

const help = {
    panel: lines(
        'Steps of the map layout, each one triggered by hand.',
        'The "Transit map" group is the main pipeline; the other groups are older or more specific tools.',
        'Every step reads the positions that are on the map when you click it.',
    ),

    layoutGroup: 'Run a layout algorithm for the whole map.',
    layout: lines(
        'Algorithm used by "Re-run layouting".',
        'Changing it runs the layout straight away.',
        '"hopefully mappy" = fcose tuned for this map, "custom elk" = ELK (disco).',
    ),
    randomize: lines(
        'On: a layout run starts from random positions.',
        'Off: it starts from the current positions and only refines them. Use this to keep what the other steps did.',
        'Only layouts that support it (fcose) honour this.',
    ),
    restrictionOrder: lines(
        'When two restrictions contradict each other, the one checked first wins.',
        'This sets the order they are checked in: as computed, random, or by their position on the map.',
        'Used by "Compute line restrictions" and by every layout run that applies restrictions.',
        'Measured effect is small, because conflicts are rare.',
    ),
    rerun: lines(
        'Runs the selected layout on the whole map now.',
        'If intersection and/or line restrictions are computed, they are merged (contradicting ones dropped) and handed to the layout (fcose only).',
        'See "Randomize start positions" for where it starts from.',
    ),
    hack: lines(
        'Adds a helper node on top of every interchange: same position and size, type "intersection-hack".',
        'The next layout run removes them again. Debug helper.',
    ),

    transitGroup: lines(
        'Main pipeline: first a map that LOOKS like a transit map, then bring it into transit-map form.',
        'Run the steps in order; each reads the positions the previous one left.',
        'Interchange = the stations of several lines that are one stop. Track = lines running along the same way, drawn as one.',
    ),
    pullRelated: lines(
        'Used by step 1 only.',
        'Stations whose tickets are about the same thing (shared words in the summaries, close areas) are drawn somewhat closer together - unless they share a line.',
        'Off by default: measured neutral at low strength, harmful at high strength.',
    ),
    stress: lines(
        'Step 1.',
        'Lays the whole network out from scratch so it looks like a transit map: each interchange is one node, parallel lines are bundled into one track, every stop is the same distance from the next, dense centre with long arms.',
        'Ignores the current positions. The same data always gives the same map. Takes 1-2 s.',
        'Stations of an interchange are placed in the default order: run step 3 again afterwards.',
        'Then run step 2.',
    ),
    octilinear: lines(
        'Step 2.',
        'Turns every track onto horizontal, vertical or 45 degrees while keeping the layout recognisable.',
        'Starts from the current positions, so run it after step 1 (or any other layout).',
        'Tracks in loops whose directions contradict can stay a few degrees off; running it again can still move stations slightly.',
        'Puts the stations of an interchange back in the default order: run step 3 afterwards.',
    ),
    untangle: lines(
        'Step 3.',
        'The stations of an interchange stand side by side. This swaps places between them whenever that makes fewer lines cross (greedy search).',
        'Run it after step 2. Only interchange stations move; running it again changes nothing, and so does "Cluster intersection stations" (it keeps this order).',
        'Measured on the real data: line crossings about 300 -> 200.',
    ),

    insideGroup: lines(
        'Arrange the stations of each interchange (the boxes that join the stations of several lines).',
        'Two ways: restrictions (compute, then move or re-layout) or one-click clustering.',
    ),
    computeRestrictions: lines(
        'Works out how the stations of each interchange should be placed: stations whose line runs horizontally are stacked vertically, vertical ones go side by side, 10 px apart.',
        'The result is stored as restrictions, used by "Move stations into intersections" and by "Re-run layouting".',
        'Based on the current positions; recompute after anything moved.',
    ),
    clearRestrictions: 'Forgets the computed intersection restrictions. "Re-run layouting" no longer uses them.',
    moveStations: lines(
        'Moves the stations of each interchange next to each other as the computed restrictions say.',
        'Needs "Compute intersection restrictions" first.',
        'Repeating compute + move does not necessarily settle.',
    ),
    cluster: lines(
        'Spreads the stations of each interchange around their common centre, 10 px apart, ordered by the direction their line leaves in.',
        'Independent of the restriction buttons. Works on the current positions; running it again changes nothing.',
        'Stations already standing on those places (in any order, e.g. after step 3) stay where they are.',
    ),

    betweenGroup: lines(
        'Keep the stretches of a line between interchanges straight (horizontal or vertical).',
        'Works like the intersection restrictions: compute, then either move stations or re-run the layout.',
    ),
    computeLineRestrictions: lines(
        'Every horizontal or vertical stretch of a line, as currently drawn, becomes a restriction: its stations are aligned and kept in travel order.',
        'Diagonal stretches are skipped (fcose cannot express them).',
        'Stored for "Re-run layouting" (merged with the intersection restrictions) and for "Move stations onto lines". The order they are checked in follows "Resolve restrictions".',
    ),
    clearLineRestrictions: 'Forgets the computed line restrictions. "Re-run layouting" no longer uses them.',
    alignStations: lines(
        'Snaps the stations of each stretch onto their common line right now, without running a layout.',
        'Needs "Compute line restrictions" first.',
        'Can pull the stations of an interchange apart: cluster them afterwards.',
    ),

    geometryGroup: 'Older, per-line approach to 45 degree geometry.',
    raster: lines(
        'Straightens every line on its own into segments at multiples of 45 degrees.',
        'Tears interchanges apart (use "Cluster intersection stations" afterwards).',
        'The "Transit map" steps do this for the whole map at once.',
    ),
}
</script>
