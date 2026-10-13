import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Dedicated fixtures use their explicit configs, never the legacy stack.
  testIgnore: ["**/node-rfq.spec.js", "**/node-quote-throttle.spec.js", "**/node-cms.spec.js", "**/node-cms-daily.spec.js", "**/node-pages.spec.js", "**/node-page-fast-save.spec.js", "**/node-page-sync.spec.js", "**/company-profile.spec.js", "**/organization-selection.spec.js", "**/support-tickets.spec.js", "**/orders.spec.js", "**/invoices.spec.js", "**/documents.spec.js", "**/members.spec.js", "**/quote-print.spec.js", "**/quote-print-real.spec.js"],
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
