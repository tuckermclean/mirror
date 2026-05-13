// RED: app does not exist yet — fails until Wk 1
import { test, expect } from "@playwright/test";

test.describe("Auth flow (Clerk)", () => {
  test("sign-up page loads", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.locator("body")).toBeVisible();
  });

  test("Google OAuth button is present", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });

  test("unauthenticated visit to /dashboard redirects to /sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);
  });
});
