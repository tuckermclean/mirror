// RED: requires running app with an authenticated admin session.
// The E2E admin user and Clerk admin role must be configured before these
// tests can pass (see pnpm setup:clerk and AGENTS.md one-time Clerk setup).
import { test, expect } from "@playwright/test";

test.describe("Admin costs page visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/costs");
  });

  test("costs page matches golden screenshot", async ({ page }) => {
    await expect(page).toHaveScreenshot("costs-admin.png", {
      fullPage: true,
      threshold: 0.01,
    });
  });

  test("CostProgressBar progressbar element is visible", async ({ page }) => {
    const bar = page.getByRole("progressbar", { name: /monthly llm spend/i });
    await expect(bar).toBeVisible();
    await expect(bar).toHaveScreenshot("cost-progress-bar.png");
  });
});
