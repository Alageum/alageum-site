import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const evidence = path.resolve(import.meta.dirname, '../ptmm-qualification-evidence');
const port = Number(process.env.E2E_PTMM_PORT || 3118);
const baseURL = process.env.E2E_PTMM_BASE_URL || `http://127.0.0.1:${port}`;
// An inherited catalogue reporter override must never overwrite its old evidence.
process.env.PLAYWRIGHT_JSON_OUTPUT_FILE = path.join(evidence, 'results.json');
export default defineConfig({
  testDir: './e2e', testMatch: 'ptmm-qualification.spec.js',
  outputDir: path.join(evidence, 'test-results'),
  fullyParallel: true, forbidOnly: Boolean(process.env.CI),
  retries: 0, workers: 2, timeout: 45_000, globalTimeout: 240_000,
  reporter: [[process.env.CI ? 'github' : 'list'], ['json', { outputFile: path.join(evidence, 'results.json') }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  projects: [
    { name: 'ptmm-narrow-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'ptmm-mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  // Reuse an explicitly supplied, already built site, or start that production
  // build on our own port. This configuration never builds or starts Next dev.
  webServer: process.env.E2E_PTMM_BASE_URL ? undefined : {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/catalog`, reuseExistingServer: !process.env.CI, timeout: 90_000,
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  },
});
