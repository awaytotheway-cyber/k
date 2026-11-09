import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * These tests run against a real server and a real database, because the thing
 * being guarded — a click becoming attributed revenue — spans the pixel, the
 * ingest API, the attribution engine and the dashboard. Mocking any of them
 * would guard nothing.
 *
 * PLAYWRIGHT_CHROMIUM lets a host point at a pre-installed browser instead of
 * downloading one; leave it unset and Playwright uses its own.
 */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Reuse a running dev server locally; start one in CI.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
