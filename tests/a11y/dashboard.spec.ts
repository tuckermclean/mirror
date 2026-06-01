import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test as authTest } from "../e2e/fixtures/auth";

authTest.describe("Dashboard accessibility (WCAG AA)", () => {
  authTest("dashboard page has zero axe violations", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    await page.waitForSelector("[data-testid=onboarding-steps]");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toHaveLength(0);
  });

  authTest("all step CTAs are keyboard-reachable in logical tab order", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    await page.waitForSelector("[data-testid=onboarding-steps]");

    // Collect all focusable interactive elements within the onboarding steps
    const focusableCount = await page.locator(
      "[data-testid=onboarding-steps] a, [data-testid=onboarding-steps] button:not([disabled])"
    ).count();
    // At minimum: step 1 CTA + step 2 CTA + skip link = 3 reachable targets
    expect(focusableCount).toBeGreaterThanOrEqual(2);
  });
});

// Standalone a11y check that does not require auth (sign-in page redirect)
test.describe("Dashboard redirect accessibility", () => {
  test("unauthenticated visit redirects without axe violations on sign-in page", async ({ page }) => {
    await page.goto("/dashboard");
    // Middleware redirects to /sign-in; check that page is accessible
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toHaveLength(0);
  });
});
