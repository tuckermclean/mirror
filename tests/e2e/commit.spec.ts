// RED: app and extension do not exist yet — fails until Wk 5
import { test, expect } from "@playwright/test";

test.describe("Commit flow", () => {
  test("export-to-doc button produces a downloadable file", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click("[data-testid=export-doc-btn]"),
    ]);
    expect(download.suggestedFilename()).toMatch(/mirror-profile/i);
  });

  test("commit is recorded in DB with accepted fields", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    // Scroll to unlock commit
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.click("[data-testid=commit-btn]");
    await expect(page.locator("[data-testid=commit-success]")).toBeVisible({ timeout: 10000 });
  });
});
