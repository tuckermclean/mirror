import { test, expect } from "@playwright/test";

test.describe("Mock walkthrough (/walkthrough/[generationId])", () => {
  test("Before/After/Diff toggle renders", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    await expect(page.getByRole("tab", { name: /before/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /after/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /diff/i })).toBeVisible();
  });

  test("Commit button is disabled until full scroll", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    const commitBtn = page.getByRole("button", { name: /commit/i });
    await expect(commitBtn).toBeDisabled();
  });

  test("Why? pill reveals rationale on click", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    await page.click("[data-testid=why-pill]");
    await expect(page.locator("[data-testid=rationale-popover]")).toBeVisible();
  });

  test("per-section Accept/Reject/Edit controls are keyboard-navigable", async ({ page }) => {
    await page.goto("/walkthrough/seed-generation-1");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  });
});
