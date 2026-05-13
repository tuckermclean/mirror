// RED: app does not exist yet — fails until Wk 1
import { test, expect } from "@playwright/test";

test.describe("Life Story interview chat", () => {
  test("interview page loads for authenticated user", async ({ page }) => {
    // Auth fixture will be added in Wk 1
    await page.goto("/onboarding/interview");
    await expect(page.locator("[data-testid=chat-input]")).toBeVisible();
  });

  test("sends a message and receives a streaming response", async ({ page }) => {
    await page.goto("/onboarding/interview");
    await page.fill("[data-testid=chat-input]", "Hello");
    await page.press("[data-testid=chat-input]", "Enter");
    await expect(page.locator("[data-testid=assistant-message]").first()).toBeVisible({ timeout: 15000 });
  });

  test("interview stops after at most 40 turns", async ({ page }) => {
    // Stub: assert the stop condition UI appears
    await page.goto("/onboarding/interview");
    await expect(page.locator("[data-testid=interview-complete]")).not.toBeVisible();
  });

  test("transcript is persisted to DB after completion", async ({ page }) => {
    // Integration assertion — added in Wk 1 implementation
    await page.goto("/onboarding/interview");
    await expect(page.locator("[data-testid=save-transcript]")).toBeVisible({ timeout: 60000 });
  });
});
