import { defineConfig, devices } from '@playwright/test';

// Run after playwright.node.config.js against its still-running real services.
// This suite waits for the production 60-second window; it never resets quotas.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'node-quote-throttle.spec.js',
  outputDir: './playwright-report/quote-throttle-results',
  preserveOutput: 'always',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 95_000,
  globalTimeout: 100_000,
  expect: { timeout: 5_000 },
  reporter: [
    [process.env.CI ? 'github' : 'list'],
    ['json', { outputFile: './playwright-report/quote-throttle-cases.json' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3141',
    actionTimeout: 8_000,
    navigationTimeout: 10_000,
    // This flow observes authenticated requests and account-scoped drafts.
    // Retain deliberate PNGs/sanitized evidence, never token-bearing traces.
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'quote-throttle-desktop', use: { ...devices['Desktop Chrome'] } }],
});
