import { defineConfig, devices } from '@playwright/test';

// Opt-in disposable Page fixture. The parent owns servers and the 165s child deadline.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'node-page-sync.spec.js',
  outputDir: './playwright-report/page-sync-results',
  preserveOutput: 'always',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 140000,
  globalTimeout: 150000,
  expect: { timeout: 8000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.EDITORIAL_PAGES_BASE_URL,
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
    reducedMotion: 'reduce',
    actionTimeout: 8000,
    navigationTimeout: 12000,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'native-page-sync' }],
});
