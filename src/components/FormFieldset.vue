<template>
    <fieldset>
        <details>
            <summary><slot name="summary" /></summary>
            <div class="scrollwrapper">
                <slot />
            </div>
        </details>
    </fieldset>
</template>

<style scoped lang="sass">
fieldset
    flex: 1 1 auto
    overflow: auto

.scrollwrapper
    display: flex
    flex-direction: column
    gap: 8px
</style>
