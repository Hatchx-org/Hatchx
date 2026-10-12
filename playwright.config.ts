import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = process.env.HATCHX_E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const startsLocalServer = !process.env.HATCHX_E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.015 } },
  use: {
    baseURL,
    locale: "en-US",
    timezoneId: "America/New_York",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: startsLocalServer
    ? {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
          NEXT_PUBLIC_SITE_URL: baseURL,
        },
      }
    : undefined,
});
