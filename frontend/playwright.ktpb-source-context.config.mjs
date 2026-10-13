import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const evidence = path.resolve(import.meta.dirname, '../ktpb-source-context-evidence');
const port = Number(process.env.E2E_KTPB_PORT || 3119);
const baseURL = process.env.E2E_KTPB_BASE_URL || `http://127.0.0.1:${port}`;
process.env.PLAYWRIGHT_JSON_OUTPUT_FILE = path.join(evidence, 'results.json');
export default defineConfig({
  // The non-.spec filename prevents collection by the unchanged legacy suite.
  testDir: './e2e', testMatch: 'ktpb-source-context.browser.js',
  outputDir: path.join(evidence, 'test-results'),
  fullyParallel: true, forbidOnly: Boolean(process.env.CI),
  retries: 0, workers: 2, timeout: 45_000, globalTimeout: 240_000,
  reporter: [[process.env.CI ? 'github' : 'list'], ['json', { outputFile: path.join(evidence, 'results.json') }]],
  // Actual console, measured DOM and successful viewport PNGs are retained by
  // each case. Failure PNGs remain automatic; no unbounded trace archive.
  use: { baseURL, trace: 'off', screenshot: 'only-on-failure', video: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  projects: [
    { name: 'ktpb-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'ktpb-mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: process.env.E2E_KTPB_BASE_URL ? undefined : {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/catalog`, reuseExistingServer: !process.env.CI, timeout: 90_000,
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  },
});
