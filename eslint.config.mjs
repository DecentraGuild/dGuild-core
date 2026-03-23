import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'

export default [
  { ignores: ['**/dist/**', '**/.nuxt/**', '**/.output/**', '**/node_modules/**', '_integrate/api/scripts/*.cjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      // TypeScript handles undefined variables; disable core rule for TS files.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-useless-assignment': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser,
      },
      globals: {
        defineNuxtConfig: 'readonly',
        defineNuxtPlugin: 'readonly',
        definePageMeta: 'readonly',
        useRuntimeConfig: 'readonly',
        // Nuxt composables and app-wide helpers (auto-imported)
        useAsyncData: 'readonly',
        useSeoMeta: 'readonly',
        useDocsNav: 'readonly',
        useDocMarkdown: 'readonly',
        useRpc: 'readonly',
        useAuth: 'readonly',
        useRouter: 'readonly',
        useRoute: 'readonly',
        ref: 'readonly',
        computed: 'readonly',
        reactive: 'readonly',
        watch: 'readonly',
        onMounted: 'readonly',
        onUnmounted: 'readonly',
        fetch: 'readonly',
        navigateTo: 'readonly',
        // Browser env
        window: 'readonly',
        navigator: 'readonly',
      },
    },
    rules: {
      // Let TypeScript type-check undefineds in Vue SFCs.
      'no-undef': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/require-default-prop': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-useless-assignment': 'off',
    },
  },
]
