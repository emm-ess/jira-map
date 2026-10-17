import path from 'node:path'

import {defineConfig} from 'vitest/config'

// Separate from vite.config.ts: tests need neither the Vue plugin nor the dev tools.
export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(import.meta.dirname, './src'),
        },
    },
    test: {
        include: ['test/**/*.test.ts'],
        environment: 'node',
        setupFiles: ['test/setup.ts'],
    },
})
