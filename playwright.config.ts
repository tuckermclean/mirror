import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testMatch: ["tests/e2e/**/*.spec.ts", "tests/visual/**/*.spec.ts", "tests/a11y/**/*.spec.ts", "tests/perf/**/*.spec.ts"],
  globalSetup: "./tests/e2e/global-setup",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
