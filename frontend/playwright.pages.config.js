import { defineConfig, devices } from '@playwright/test';

// Separate harness/fixtures: the existing CMS and RFQ suites are not selected.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'node-pages.spec.js',
  outputDir: './playwright-report/pages-results',
  preserveOutput: 'always',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.EDITORIAL_PAGES_BASE_URL,
    locale: 'en-US',
    reducedMotion: 'reduce',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    {
      name: 'native-page-cms',
      grep: /native Page:/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        // Native login submits disposable passwords. Do not persist its network
        // traffic or session tokens in a trace; PNG evidence is retained instead.
        trace: 'off',
      },
    },
    {
      name: 'public-page-desktop',
      grep: /public Page:/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'public-page-mobile',
      grep: /public Page: responsive/,
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
});
