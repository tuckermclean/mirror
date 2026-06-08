/**
 * E2E for the Week 4 "Outcome tracking" workstream: weekly self-report submit
 * flow + consent grant/revoke toggle on the dashboard.
 *
 * These flows require an authenticated session. When the Clerk test-user
 * environment is not provisioned in this worktree (no CLERK_SECRET_KEY /
 * CLERK_TEST_USER_EMAIL), the authed specs are skipped with a clear reason
 * rather than failing for infra reasons — mirroring the existing E2E pattern.
 */
import { test as base, expect } from "@playwright/test";
import { test as authedTest } from "./fixtures/auth";

const clerkConfigured =
  !!process.env["CLERK_SECRET_KEY"] && !!process.env["CLERK_TEST_USER_EMAIL"];

base.describe("Outcome tracking — unauthenticated", () => {
  base("dashboard outcome routes require auth (redirect to sign-in)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);
  });

  base("POST /api/outcomes returns 401 when unauthenticated", async ({ request }) => {
    const res = await request.post("/api/outcomes", {
      data: { weekOf: "2026-02-02", profileViews: 1 },
    });
    expect(res.status()).toBe(401);
  });

  base("POST /api/outcomes/consent returns 401 when unauthenticated", async ({ request }) => {
    const res = await request.post("/api/outcomes/consent");
    expect(res.status()).toBe(401);
  });
});

authedTest.describe("Outcome tracking — authenticated", () => {
  authedTest.skip(
    !clerkConfigured,
    "Clerk test-user env not provisioned (CLERK_SECRET_KEY / CLERK_TEST_USER_EMAIL absent)"
  );

  authedTest(
    "user can grant consent, then submit a weekly self-report",
    async ({ authedPage: page }) => {
      await page.goto("/dashboard");

      // The nudge prompts for consent before any capture form is shown.
      const grant = page.locator("[data-testid=outcome-consent-grant]");
      await expect(grant).toBeVisible();
      await grant.click();

      // After consent the weekly self-report form appears.
      const form = page.locator("[data-testid=outcome-report-form]");
      await expect(form).toBeVisible();

      await page.fill("[data-testid=outcome-profile-views]", "42");
      await page.fill("[data-testid=outcome-recruiter-msgs]", "3");
      await page.click("[data-testid=outcome-report-submit]");

      await expect(page.locator("[data-testid=outcome-report-success]")).toBeVisible({
        timeout: 10000,
      });
    }
  );

  authedTest(
    "user can revoke consent, which hides the capture form",
    async ({ authedPage: page }) => {
      await page.goto("/dashboard");

      const grant = page.locator("[data-testid=outcome-consent-grant]");
      if (await grant.isVisible()) await grant.click();

      await page.click("[data-testid=outcome-consent-revoke]");
      await expect(page.locator("[data-testid=outcome-report-form]")).toBeHidden();
    }
  );
});
