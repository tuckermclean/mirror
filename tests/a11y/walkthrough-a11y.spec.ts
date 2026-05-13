// RED: app doesn't exist yet — fails until Wk 3
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Walkthrough accessibility (WCAG AA)", () => {
  test("walkthrough page has zero axe violations", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toHaveLength(0);
  });

  test("rationale popover has zero axe violations when open", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    await page.click("[data-testid=why-pill]");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations).toHaveLength(0);
  });
});
