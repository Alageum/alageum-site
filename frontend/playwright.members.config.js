import { defineConfig, devices } from '@playwright/test';

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
export default defineConfig({
  testDir: './e2e', testMatch: 'members.spec.js',
  outputDir: process.env.E2E_MEMBER_OUTPUT || './playwright-report/member-results',
  preserveOutput: 'always', forbidOnly: Boolean(process.env.CI), fullyParallel: false,
  workers: 1, retries: 0, timeout: 120000, expect: { timeout: 15000 },
  reporter: [['list'], ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || './playwright-report/member-real-results.json' }]],
  use: {
    baseURL: process.env.E2E_MEMBER_BASE_URL, locale: 'ru-RU', reducedMotion: 'reduce',
    actionTimeout: 15000, navigationTimeout: 30000,
    // Disposable passwords/tokens must never enter automatic failure artifacts.
    trace: 'off', video: 'off', screenshot: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'member-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'member-mobile', grep: /responsive/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
});
