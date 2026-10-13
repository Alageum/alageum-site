import { defineConfig, devices } from '@playwright/test';

// Pure browser fixtures; this does not exercise a real verifier or NCALayer.
export default defineConfig({
  testDir: './e2e-signing', testMatch: '*.spec.js',
  fullyParallel: false, workers: 1, retries: 0, timeout: 45000,
  outputDir: './playwright-report/document-signing-fixtures',
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3217', trace: 'off', video: 'off', screenshot: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  webServer: { command: 'npm run dev -- --hostname 127.0.0.1 --port 3217', url: 'http://127.0.0.1:3217', timeout: 120000, reuseExistingServer: false,
    env: { NEXT_PUBLIC_DOCUMENT_SIGNING_ENABLED: '1', NEXT_PUBLIC_API_URL: '/api/v1', ALAGEUM_DOCUMENT_BUILD: '1' } },
  projects: [{ name: 'signing-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'signing-mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } }],
});
