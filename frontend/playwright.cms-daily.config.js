import { defineConfig, devices } from '@playwright/test';

// Servers and the disposable native CMS fixture are started by the caller.
// Login/session material must not be included in saved traces or screenshots.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'node-cms-daily.spec.js',
  outputDir: './playwright-report/cms-daily-results',
  preserveOutput: 'always',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_CMS_BASE_URL || 'http://127.0.0.1:8016/cms',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'native-cms-daily-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1200 } } }],
});
