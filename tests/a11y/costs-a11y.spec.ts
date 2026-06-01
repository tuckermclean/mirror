// RED: requires running app with an authenticated admin session.
// The E2E admin user and Clerk admin role must be configured before these
// tests can pass (see pnpm setup:clerk and AGENTS.md one-time Clerk setup).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Admin costs page accessibility (WCAG AA)", () => {
  test("costs page has zero axe violations", async ({ page }) => {
    await page.goto("/admin/costs");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toHaveLength(0);
  });

  test("CostProgressBar has valid progressbar ARIA attributes", async ({ page }) => {
    await page.goto("/admin/costs");
    const bar = page.getByRole("progressbar", { name: /monthly llm spend/i });
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("aria-valuemin", "0");
    await expect(bar).toHaveAttribute("aria-valuemax", "100");
    const valuenow = await bar.getAttribute("aria-valuenow");
    expect(Number(valuenow)).toBeGreaterThanOrEqual(0);
    expect(Number(valuenow)).toBeLessThanOrEqual(100);
  });
});
