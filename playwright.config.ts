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
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      // Clerk's setupClerkTestingToken route interceptor returns HTML instead of
      // JSON for webkit's /v1/client/handshake FAPI request in CI, causing the
      // Clerk client to redirect mid-navigation. Auth-gated tests are excluded
      // from webkit until @clerk/testing has webkit-compatible FAPI proxying.
      testIgnore: ["**/interview.spec.ts", "**/auth.spec.ts"],
    },
  ],
});
