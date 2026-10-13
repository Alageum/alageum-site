import { defineConfig, devices } from '@playwright/test';

// The workflow partitions all five unchanged assertions into three current
// Node browser flows and two Python-only API contracts; discovery checks both.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
export default defineConfig({
  testDir: './e2e', testMatch: 'security.spec.js', fullyParallel: false,
  workers: 1, retries: 0, forbidOnly: Boolean(process.env.CI),
  outputDir: './playwright-report/security-results',
  reporter: [['list'], ['json', { outputFile: './playwright-report/security-results.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3140',
    trace: 'off', video: 'off', screenshot: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
});
