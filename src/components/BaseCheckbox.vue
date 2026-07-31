<template>
    <label>
        <input
            :id
            v-model="model"
            type="checkbox"
            :value
            :disabled
        >
        <span><slot /></span>
    </label>
</template>

<script setup lang="ts" generic="ValueType">
const model = defineModel<ValueType[]>({required: true})

defineProps<{
    value: ValueType
    id: string
    disabled?: boolean
}>()
</script>

<style scoped lang="sass">
input:disabled + span
    opacity: 0.5
</style>
