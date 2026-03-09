import { defineConfig } from '@playwright/test'

const API_PORT = 19090
const DASHBOARD_WS_PORT = 19092
const DASHBOARD_PORT = 15173

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${DASHBOARD_PORT}`,
  },
  webServer: [
    {
      command: `PORT=${API_PORT} DASHBOARD_WS_PORT=${DASHBOARD_WS_PORT} bun run src/index.ts`,
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `bun run --cwd dashboard vite --port ${DASHBOARD_PORT}`,
      port: DASHBOARD_PORT,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: 'api',
      testMatch: 'tests/api.spec.ts',
    },
    {
      name: 'ws',
      testMatch: 'tests/ws.spec.ts',
      use: { browserName: 'chromium' },
    },
    {
      name: 'dashboard',
      testMatch: 'tests/dashboard.spec.ts',
      use: { browserName: 'chromium' },
    },
  ],
})
