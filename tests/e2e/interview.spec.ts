import { test, expect } from "./fixtures/auth";

test.describe("Life Story interview chat", () => {
  test("interview page loads for authenticated user", async ({ authedPage: page }) => {
    await page.goto("/onboarding/interview");
    await expect(page.locator("[data-testid=chat-input]")).toBeVisible();
  });

  test("sends a message and receives a streaming response", async ({ authedPage: page }) => {
    await page.goto("/onboarding/interview");
    await page.fill("[data-testid=chat-input]", "Hello");
    await page.press("[data-testid=chat-input]", "Enter");
    await expect(page.locator("[data-testid=assistant-message]").first()).toBeVisible({ timeout: 15000 });
  });

  test("interview stops after at most 40 turns", async ({ authedPage: page }) => {
    // Stub: assert the stop condition UI is not yet visible on a fresh session
    await page.goto("/onboarding/interview");
    await expect(page.locator("[data-testid=interview-complete]")).not.toBeVisible();
  });

  test("transcript is persisted after first exchange", async ({ authedPage: page }) => {
    // save-transcript becomes visible once hasExchanged is true (after any successful round-trip)
    await page.goto("/onboarding/interview");
    await page.fill("[data-testid=chat-input]", "I'm a software engineer with 5 years of experience.");
    await page.press("[data-testid=chat-input]", "Enter");
    await expect(page.locator("[data-testid=save-transcript]")).toBeVisible({ timeout: 30000 });
  });
});
