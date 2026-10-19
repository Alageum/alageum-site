import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Dedicated explicit public-only capability proof against the standalone server.
// Keep its fixture-specific budgets isolated from the default/auth suites.
export default defineConfig({
  ...base,
  testMatch: 'public-services.spec.js',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
});
