import {ref} from 'vue'

import {loadData} from '../data.ts'

export function useData<T>(file: string) {
    const loading = ref(true)

    const data = ref<T | undefined>()

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ;(async () => {
        data.value = await loadData<T>(file)
        loading.value = false
    })()

    return {
        loading,
        data,
    }
}
