import { defineConfig, devices } from '@playwright/test';

// Disposable credentials are entered by the test. Never record network traces,
// videos, storage snapshots, or automatic login-failure screenshots.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'quote-print-real.spec.js',
  outputDir: process.env.E2E_QUOTE_PRINT_OUTPUT || './playwright-report/quote-print-real-results',
  preserveOutput: 'always',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || './playwright-report/quote-print-real-results.json' }]],
  use: {
    baseURL: process.env.E2E_QUOTE_PRINT_BASE_URL,
    locale: 'ru-RU',
    reducedMotion: 'reduce',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'quote-print-real-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'quote-print-real-mobile', grep: /responsive own persisted/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
});
