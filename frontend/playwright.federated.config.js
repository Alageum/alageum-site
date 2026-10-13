import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './federated-e2e', fullyParallel: false, workers: 1, retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3118', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
