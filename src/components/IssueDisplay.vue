<template>
    <article>
        <template v-if="issue">
            <h1>{{ issue.key }}: {{ issue.summary }}</h1>
            <pre>{{ issue.description }}</pre>
            <pre>{{ restIssueFields(issue) }}</pre>
        </template>
        <template v-else>
            invalid issue id: {{ id }}
        </template>
    </article>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

import {useData} from '@/composables/data.ts'

import type {DataPrepared} from '../../types/data-prepared'

const {id} = defineProps<{
    id: string
}>()

const issues = useData<Record<string, DataPrepared.Issue>>('data/issues')

const issue = computed<DataPrepared.Issue | undefined>(() => {
    return issues.data.value?.[id]
})

function restIssueFields(issue: DataPrepared.Issue): string {
    const {key, summary, description, assignee, assignedUsers, mentionedUsers, lastViewed, ...rest} = issue
    return JSON.stringify(rest, undefined, 2)
}
</script>
