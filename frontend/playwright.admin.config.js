import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir: './e2e', testMatch: 'catalog-admin.spec.js', fullyParallel: false, workers: 1,
 use: { ...devices['Desktop Chrome'], baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', trace: 'off', video: 'off', screenshot: 'off',
  launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}, },
});
