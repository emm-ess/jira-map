import baseConfig from '@emm-ess-configs/eslint-config-vue'
import {addGitIgnore, globals} from '@emm-ess-configs/eslint-config-vue/helper'

export default [
    addGitIgnore(import.meta.dirname),
    ...baseConfig,
    {
        name: 'vue-stuff',
        files: ['src/**/*'],
        languageOptions: {
            globals: {
                ...globals.browser,
            },
            parserOptions: {
                projectService: true,
            },
        },
    },
    {
        name: 'node-stuff',
        files: ['*.ts'],
        ignores: ['src/**/*.*'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            parserOptions: {
                projectService: true,
            },
        },
    },
    {
        rules: {
            'sonarjs/fixme-tag': 0,
            // should be handled by typescript
            'sonarjs/different-types-comparison': 0,
            '@stylistic/block-spacing': 0,
            'unicorn/explicit-length-check': 0,
        },
    },
    {
        files: ['tsconfig.*.json'],
        rules: {
            'json/*': 0,
        },
    },
]
