import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Run the full existing browser suite through Vercel's shared-origin ingress.
// Dev compilation is slower than the normal production/Docker E2E server.
export default defineConfig({
  ...base,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
});
