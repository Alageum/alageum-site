import { defineConfig, devices } from '@playwright/test';

// Pinned Playwright 1.62: suppress automatic DOM snapshots of login failures.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

// Explicit opt-in: independent of the legacy/default and optional CMS suites.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'organization-selection.spec.js',
  outputDir: process.env.E2E_ORGANIZATION_OUTPUT || './playwright-report/organization-results',
  preserveOutput: 'always',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_ORGANIZATION_BASE_URL,
    locale: 'ru-RU',
    reducedMotion: 'reduce',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    // Login uses disposable credentials and bearer tokens. Never record network
    // traces, videos, storage snapshots, or automatic login failure screenshots.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'organization-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'organization-mobile', grep: /responsive chooser|responsive active organization/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
});
