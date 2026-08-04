<template>
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

<script setup lang="ts">
import type {ElementDefinition} from 'cytoscape'
import {ref, useTemplateRef} from 'vue'

import type {Data} from '../../types/data'

const dialog = useTemplateRef('dialog')
const selectedItem = ref<ElementDefinition>()

function restIssueFields(issue: Data.Issue): string {
    const {key, summary, description, assignee, assignedUsers, mentionedUsers, lastViewed, ...rest} = issue
    return JSON.stringify(rest, undefined, 2)
}

function showPopover(item: ElementDefinition) {
    selectedItem.value = item
    dialog.value?.showPopover()
}

defineExpose({showPopover})
</script>

<style scoped lang="sass">
dialog
    max-width: 80%
    max-height: 80%
    overflow: auto

dd
    margin: 0 0 0 16px
    padding: 0
</style>
