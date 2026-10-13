import { defineConfig, devices } from '@playwright/test';

// Opt-in diagnostic only. The harness owns fixture servers and their teardown.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'node-page-fast-save.spec.js',
  outputDir: './playwright-report/page-fast-save-results',
  preserveOutput: 'always',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 165000,
  globalTimeout: 180000,
  expect: { timeout: 10000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.EDITORIAL_PAGES_BASE_URL,
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
    reducedMotion: 'reduce',
    actionTimeout: 10000,
    navigationTimeout: 15000,
    // Authentication must never be recorded. Curated screenshots are taken
    // explicitly, only after the native Page form is open.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'native-page-fast-save' }],
});
