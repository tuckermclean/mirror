// RED: app doesn't exist yet — fails until Wk 3 (walkthrough) and Wk 6 (pre-launch)
import { test, expect } from "@playwright/test";

test.describe("Performance budgets (Lighthouse CI)", () => {
  test("walkthrough TTFB is under 400ms", async ({ page }) => {
    const response = await page.goto("/walkthrough/seed-generation-1");
    // Timing from navigation response headers
    const ttfb = response ? await response.timing() : null;
    // @ts-expect-error: timing shape varies
    expect(ttfb?.responseStart ?? 9999).toBeLessThan(400);
  });

  test("walkthrough Lighthouse performance score >= 90", async () => {
    // Placeholder: Lighthouse CI runs via CI script, not inline Playwright
    // This test will be wired to Lighthouse CI results in Wk 6
    expect(true).toBe(false); // forces red until Wk 6
  });
});
