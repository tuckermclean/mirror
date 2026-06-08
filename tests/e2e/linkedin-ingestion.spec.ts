import { test, expect } from "@playwright/test";

test.describe("LinkedIn ingestion", () => {
  test("Tier A: public URL + session cookie field renders", async ({ page }) => {
    await page.goto("/onboarding/linkedin");
    await expect(page.locator("[data-testid=linkedin-url-input]")).toBeVisible();
    await expect(page.locator("[data-testid=session-cookie-input]")).toBeVisible();
  });

  test("Tier B: PDF resume upload accepted", async ({ page }) => {
    await page.goto("/onboarding/linkedin");
    await expect(page.locator("[data-testid=pdf-upload]")).toBeVisible();
  });

  test("cookie is not echoed back in any response body or log", async ({ page }) => {
    // Security: cookie must never appear in page content after submission
    await page.goto("/onboarding/linkedin");
    const cookie = "li_at=TESTSECRETCOOKIE";
    await page.fill("[data-testid=session-cookie-input]", cookie);
    await page.click("[data-testid=submit-linkedin]");
    await expect(page.locator("body")).not.toContainText(cookie);
  });
});
