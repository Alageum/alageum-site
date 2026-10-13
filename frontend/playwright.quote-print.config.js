import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_QUOTES_PORT || 3135);
const baseURL = process.env.E2E_QUOTES_BASE_URL || `http://127.0.0.1:${port}`;
const production = process.env.E2E_QUOTES_PRODUCTION === '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'quote-print.spec.js',
  outputDir: './playwright-report/quote-print-results',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    // Only explicit fictitious document screenshots/PDFs become artifacts.
    trace: 'off', video: 'off', screenshot: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'quote-print-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'quote-print-mobile', grepInvert: /@pdf/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_QUOTES_BASE_URL ? undefined : {
    command: production ? `npm run start -- --hostname 127.0.0.1 --port ${port}` : `npm run dev -- --webpack --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/catalog`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: { NEXT_TELEMETRY_DISABLED: '1', ...(production ? { NODE_ENV: 'production', ALAGEUM_QUOTES_BUILD: '1', NEXT_PUBLIC_CATALOG_SOURCE: 'static' } : {}) },
  },
});
