// RED: app does not exist yet — fails until Wk 1
import { test as base, expect } from "@playwright/test";
import { test as authedTest } from "./fixtures/auth";

base.describe("Auth flow (Clerk)", () => {
  base.test("sign-up page loads", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.locator("body")).toBeVisible();
  });

  base.test("Google OAuth button is present", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });

  base.test("unauthenticated visit to /dashboard redirects to /sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);
  });

});

base.describe("Inngest public route access", () => {
  base.test("/api/inngest responds to GET without 401/403 (Inngest introspection is public)", async ({
    request,
  }) => {
    const response = await request.get("/api/inngest");
    // Inngest introspection returns 200 in dev or 200/401 when signing key is
    // present but not in the request.  What we must NOT see is our own 401
    // from Clerk middleware — i.e., it must not redirect to /sign-in.
    expect(response.status()).not.toBe(307);
    expect(response.status()).not.toBe(308);
    // Inngest responds with JSON (either introspection payload or an error).
    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/json/);
  });
});

authedTest.describe("Authenticated access", () => {
  authedTest("authenticated user can reach /dashboard", async ({ authedPage }) => {
    await authedPage.goto("/dashboard");
    // Must NOT be redirected to sign-in — the user is authenticated.
    await expect(authedPage).not.toHaveURL(/sign-in/);
    await expect(authedPage.locator("body")).toBeVisible();
  });
});
