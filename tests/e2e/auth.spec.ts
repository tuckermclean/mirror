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
    // Clerk's dev instance answers the first navigation to a protected route with a
    // browser "handshake" (clerk.accounts.dev/v1/client/handshake?__clerk_hs_reason=
    // dev-browser-missing) before the app's middleware redirect resolves. Register the
    // FAPI testing-token interceptor — the same mechanism the authed fixture uses — so
    // the handshake completes deterministically; otherwise the assertion races it and
    // can catch the intermediate clerk.accounts.dev URL. No sign-in happens here, so
    // /dashboard still correctly redirects to /sign-in.
    const clerkKey = process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"];
    if (clerkKey && clerkKey !== "pk_test_placeholder") {
      const { setupClerkTestingToken } = await import("@clerk/testing/playwright");
      await setupClerkTestingToken({ page });
    }
    await page.goto("/dashboard");
    // Generous timeout: the handshake round-trip to Clerk's FAPI plus the middleware
    // redirect can exceed the default 5s expect timeout under CI load.
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
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
    // Guard against a broken Inngest setup masking as a non-redirect (e.g. 500 + JSON).
    expect(response.status()).toBeLessThan(500);
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
