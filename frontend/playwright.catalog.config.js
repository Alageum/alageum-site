import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_CATALOG_PORT || 3100);
const baseURL = process.env.E2E_CATALOG_BASE_URL || `http://127.0.0.1:${port}`;
const launchOptions = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : {};

// The demo catalog needs only Next.js. The API-backed security suite retains
// its existing config and can still be run separately with test:e2e.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "catalog.spec.js",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions,
  },
  projects: [
    { name: "catalog-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "catalog-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_CATALOG_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        url: `${baseURL}/catalog`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { NEXT_TELEMETRY_DISABLED: "1" },
      },
});
