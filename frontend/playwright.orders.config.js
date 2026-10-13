import { defineConfig, devices } from '@playwright/test';

// Disposable credentials and bearer tokens never enter failure artifacts.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'orders.spec.js',
  outputDir: process.env.E2E_ORDERS_OUTPUT || './playwright-report/orders-results',
  preserveOutput: 'always',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || './playwright-report/orders-real-results.json' }]],
  use: {
    baseURL: process.env.E2E_ORDERS_BASE_URL,
    locale: 'ru-RU',
    reducedMotion: 'reduce',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    trace: 'off', video: 'off', screenshot: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'orders-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'orders-mobile', grep: /responsive/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
});
