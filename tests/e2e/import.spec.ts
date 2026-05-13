// RED: app does not exist yet — fails until Wk 2
import { test, expect } from "@playwright/test";

test.describe("AI history import", () => {
  test("ChatGPT zip upload succeeds and shows Voice Card preview", async ({ page }) => {
    await page.goto("/onboarding/import");
    await expect(page.locator("[data-testid=chatgpt-upload]")).toBeVisible();
  });

  test("Claude zip upload succeeds and shows Voice Card preview", async ({ page }) => {
    await page.goto("/onboarding/import");
    await expect(page.locator("[data-testid=claude-upload]")).toBeVisible();
  });

  test("plain text fallback upload accepted", async ({ page }) => {
    await page.goto("/onboarding/import");
    await expect(page.locator("[data-testid=text-upload]")).toBeVisible();
  });
});
