import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['.next/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', '.data/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
]
