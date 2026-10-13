import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e-photography', fullyParallel:false, workers:1,
  reporter:'list', retries:0, timeout:45000,
  outputDir:'test-results/photography',
  use:{ baseURL:process.env.E2E_PHOTOGRAPHY_BASE_URL || 'http://127.0.0.1:3117', screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium'} },
  projects:[{name:'photo-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},{name:'photo-mobile',use:{...devices['Pixel 7']}}],
});
