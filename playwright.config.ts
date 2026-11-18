import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: process.env.LEDGER_EMULATOR ? [] : '**/ledger.spec.ts',
  workers: 1,
  use: { ...devices['Pixel 7'], channel: 'chrome', baseURL: 'http://localhost:4173', actionTimeout: 8_000 },
  webServer: {
    command: 'pnpm preview --host localhost --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
})
