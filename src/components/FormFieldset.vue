<template>
    <fieldset>
        <details :open>
            <summary><slot name="summary" /></summary>
            <div class="scrollwrapper">
                <slot />
            </div>
        </details>
    </fieldset>
</template>

<script setup lang="ts">
defineProps<{
    open?: boolean
}>()
</script>

<style scoped lang="sass">
fieldset
    flex: 1 1 auto
    overflow: auto

.scrollwrapper
    display: flex
    flex-direction: column
    gap: 8px
</style>
