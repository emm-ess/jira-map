<template>
    <label :for="id">
        <slot />
    </label>
    <select
        :id="id"
        v-model="model"
        :name="id"
    >
            <option
                v-for="item in items"
                :key="item.name"
                :value="item"
            >
                {{ item.name }}
            </option>
    </select>
</template>

<script
    lang="ts"
    setup
    generic="ItemType extends {name: string} "
>
const model = defineModel<ItemType>()

defineProps<{
    id: string
    items: ItemType[]
}>()
</script>
