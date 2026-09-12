import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    env: { COVENANT_FAKE_PORTS: '1' },
  },
})
