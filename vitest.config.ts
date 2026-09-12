import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/adapters/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    // UI test files opt into jsdom with a `// @vitest-environment jsdom` docblock.
    environment: 'node',
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
})
