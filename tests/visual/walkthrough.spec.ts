// NEEDS GOLDEN SCREENSHOTS: run `pnpm test:visual --update-snapshots` against a running app to capture baselines
import { test, expect } from "@playwright/test";

test.describe("Walkthrough visual regression", () => {
  test("Before view matches golden screenshot", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    await page.getByRole("tab", { name: /before/i }).click();
    await expect(page).toHaveScreenshot("walkthrough-before.png", {
      fullPage: true,
      threshold: 0.01,
    });
  });

  test("After view matches golden screenshot", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    await page.getByRole("tab", { name: /after/i }).click();
    await expect(page).toHaveScreenshot("walkthrough-after.png", {
      fullPage: true,
      threshold: 0.01,
    });
  });

  test("Diff view matches golden screenshot", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    await page.getByRole("tab", { name: /diff/i }).click();
    await expect(page).toHaveScreenshot("walkthrough-diff.png", {
      fullPage: true,
      threshold: 0.01,
    });
  });
});
