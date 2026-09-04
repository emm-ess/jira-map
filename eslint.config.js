import baseConfig from '@emm-ess-configs/eslint-config-vue'
import {addGitIgnore, globals} from '@emm-ess-configs/eslint-config-vue/helper'

export default [
    addGitIgnore(import.meta.dirname),
    ...baseConfig,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
        },
    },
    {
        name: 'vue-stuff',
        files: ['src/**/*'],
        languageOptions: {
            globals: {
                ...globals.browser,
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
        },
    },
    {
        rules: {
            'unicorn/filename-case': ['warn', {
                cases: {
                    kebabCase: true,
                    pascalCase: true,
                    camelCase: true,
                },
            }],

            'sonarjs/fixme-tag': 0,
            // should be handled by typescript
            'sonarjs/different-types-comparison': 0,
            '@stylistic/block-spacing': 0,
            'unicorn/explicit-length-check': 0,

            // rules turned off since it is still a rapid prototype
            'sonarjs/no-unused-vars': 'warn',
            'sonarjs/no-dead-store': 'warn',
            'sonarjs/cognitive-complexity': 'warn',
            'sonarjs/unused-import': 'warn',
            'no-useless-escape': 'warn',

            'unicorn/no-array-sort': 0,
            'unicorn/no-array-reduce': 0,
            'unicorn/no-array-for-each': 0,
            'unicorn/no-array-callback-reference': 0,
            '@typescript-eslint/restrict-template-expressions': 0,
            '@typescript-eslint/no-unsafe-return': 0,
            '@typescript-eslint/no-unsafe-argument': 0,
            '@typescript-eslint/no-unsafe-call': 0,
            '@typescript-eslint/no-unsafe-assignment': 0,
            '@typescript-eslint/no-unused-vars': 0,
            '@typescript-eslint/no-non-null-assertion': 0,
            '@typescript-eslint/no-unsafe-member-access': 0,
            '@typescript-eslint/no-unnecessary-condition': 0,
            '@typescript-eslint/no-empty-function': 0,
            '@typescript-eslint/no-explicit-any': 0,
            'sonarjs/no-alphabetical-sort': 0,
            'sonarjs/pseudo-random': 0,
        },
    },
    {
        files: ['src/graph/*.*'],
        rules: {
            'unicorn/prefer-query-selector': 0,
        },
    },
    {
        files: ['tsconfig.*.json'],
        rules: {
            'json/*': 0,
        },
    },
    {
        files: ['vite.config.ts'],
        rules: {
            'import-x/no-cycle': 0,
        },
    },
    {
        files: ['*.d.ts', 'types/shims.d.ts'],
        rules: {
            '@typescript-eslint/consistent-type-definitions': 0,
        },
    },
]
