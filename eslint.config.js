import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import { defineConfig, globalIgnores } from 'eslint/config'

const baseRules = js.configs.recommended.rules ?? {}
const tsRecommendedRules = tsPlugin.configs.recommended?.rules ?? {}
const reactHooksRules = reactHooks.configs['recommended-latest']?.rules ?? {}
const reactRefreshRules = reactRefresh.configs.vite?.rules ?? {}

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  {
    files: [
      'core/**/*.js',
      'server/**/*.js',
      'preload/**/*.js',
      'main.js',
      'vite.config.js',
      'tailwind.config.js',
      'postcss.config.js',
      '*.config.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.commonjs,
        ...globals.browser,
      },
    },
    rules: {
      ...baseRules,
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['renderer/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...baseRules,
      ...tsRecommendedRules,
      ...reactHooksRules,
      ...reactRefreshRules,
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      'react-refresh/only-export-components': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
    },
  },
  {
    files: ['**/*.d.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {},
  },
])
