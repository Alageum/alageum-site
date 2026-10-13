import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'node-cms.spec.js',
  outputDir: './playwright-report/cms-results',
  preserveOutput: 'always',
  forbidOnly: Boolean(process.env.CI), fullyParallel: false, workers: 1,
  retries: 0, timeout: 45000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_CMS_BASE_URL || 'http://127.0.0.1:8016/cms',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'native-cms-chromium', use: { ...devices['Desktop Chrome'] } }],
});
