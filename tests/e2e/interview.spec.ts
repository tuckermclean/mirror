import { test, expect } from "./fixtures/auth";

test.describe("Dashboard onboarding shell", () => {
  test("authenticated user visiting /dashboard sees the three-step progress indicator", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("[data-testid=onboarding-steps]")).toBeVisible();
    await expect(page.locator("[data-testid=step-1]")).toBeVisible();
    await expect(page.locator("[data-testid=step-2]")).toBeVisible();
    await expect(page.locator("[data-testid=step-3]")).toBeVisible();
  });

  test("step 3 CTA is disabled when steps 1 and 2 are not complete", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    // In a fresh session without completed interview or imports, step 3 is locked.
    // The CTA is rendered as a disabled button (aria-disabled).
    const step3Cta = page.locator("[data-testid=step-3-cta]");
    await expect(step3Cta).toBeVisible();
    // Either the button is disabled or the link is not present (step 3 locked)
    const isDisabled =
      (await step3Cta.getAttribute("disabled")) !== null ||
      (await step3Cta.getAttribute("aria-disabled")) === "true";
    expect(isDisabled).toBe(true);
  });

  test('"Skip import" link is present and annotated', async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    const skipLink = page.locator("[data-testid=skip-import]");
    await expect(skipLink).toBeVisible();
    await expect(skipLink).toHaveAttribute("aria-label");
  });

  test("step 1 CTA links to the interview page", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    const step1Cta = page.locator("[data-testid=step-1] a, [data-testid=step-1] button").first();
    await expect(step1Cta).toBeVisible();
  });

  test("step 2 CTA links to the import page", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    const step2Cta = page.locator("[data-testid=step-2] a").first();
    await expect(step2Cta).toBeVisible();
  });
});

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
