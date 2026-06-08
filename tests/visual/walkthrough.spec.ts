/**
 * Visual regression tests for the Walkthrough page.
 *
 * SKIPPED — golden screenshots have not yet been captured.
 *
 * To capture baselines, run a local app instance and then:
 *   pnpm test:visual --update-snapshots
 *
 * Once `tests/visual/walkthrough.golden/` contains the three .png files,
 * remove the `test.skip` calls (or replace with the plain `test` import).
 *
 * Do NOT un-skip in CI until the golden files are committed to the repo,
 * otherwise every run will fail with "missing expected screenshot" errors.
 */
import { test, expect } from "@playwright/test";

test.describe("Walkthrough visual regression", () => {
  test.skip("Before view matches golden screenshot", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    await page.getByRole("tab", { name: /before/i }).click();
    await expect(page).toHaveScreenshot("walkthrough-before.png", {
      fullPage: true,
      threshold: 0.01,
    });
  });

  test.skip("After view matches golden screenshot", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    await page.getByRole("tab", { name: /after/i }).click();
    await expect(page).toHaveScreenshot("walkthrough-after.png", {
      fullPage: true,
      threshold: 0.01,
    });
  });

  test.skip("Diff view matches golden screenshot", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    await page.getByRole("tab", { name: /diff/i }).click();
    await expect(page).toHaveScreenshot("walkthrough-diff.png", {
      fullPage: true,
      threshold: 0.01,
    });
  });
});
