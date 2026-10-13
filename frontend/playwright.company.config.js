import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.E2E_COMPANY_PORT || 3270);
const baseURL = process.env.E2E_COMPANY_BASE_URL || `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './e2e', testMatch: 'company-pages.spec.js', fullyParallel: true,
  forbidOnly: Boolean(process.env.CI), retries: 0, workers: 2,
  reporter: 'list', outputDir: 'test-results/company',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  projects: [ { name: 'company-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }, { name: 'company-mobile', use: { ...devices['Pixel 7'] } } ],
  webServer: process.env.E2E_COMPANY_BASE_URL ? undefined : { command: `npm run start -- --hostname 127.0.0.1 --port ${port}`, url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120000 },
});
