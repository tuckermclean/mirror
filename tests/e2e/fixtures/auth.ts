import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";

type AuthFixtures = {
  authedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    const clerkKey = process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"];
    const secretKey = process.env["CLERK_SECRET_KEY"];
    const hasClerkKey =
      clerkKey && clerkKey !== "pk_test_placeholder" && secretKey;

    if (hasClerkKey) {
      const { clerk, setupClerkTestingToken } = await import("@clerk/testing/playwright");
      // Register the FAPI route interceptor (adds ?__clerk_testing_token to all
      // Clerk FAPI requests so Clerk returns a real session).
      await setupClerkTestingToken({ page });
      // Navigate to a public page so ClerkJS initialises in the browser and
      // fires the /v1/client FAPI request. Playwright intercepts it, Clerk
      // returns a session, and the session cookie is set before the test's own
      // page.goto. Without this, auth.protect() redirects before ClerkJS loads.
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const email = process.env["CLERK_TEST_USER_EMAIL"];
      const password = process.env["CLERK_TEST_USER_PASSWORD"];
      const pkPrefix = clerkKey?.slice(0, 30);
      console.log(`[authedPage] FAPI key prefix: ${pkPrefix}, email: ${email}, password set: ${!!password}`);
      if (email && password) {
        console.log("[authedPage] calling clerk.signIn...");
        await clerk.signIn({
          page,
          signInParams: { strategy: "password", identifier: email, password },
        });
        console.log(`[authedPage] clerk.signIn returned, url: ${page.url()}`);
        const clerkState = await page.evaluate(() => {
          const c = (window as unknown as { Clerk?: { user?: { id?: string }; session?: { status?: string }; loaded?: boolean } }).Clerk;
          return {
            loaded: c?.loaded,
            userId: c?.user?.id ?? null,
            sessionStatus: c?.session?.status ?? null,
          };
        }).catch(() => ({ loaded: false, userId: null, sessionStatus: null }));
        console.log(`[authedPage] Clerk state after signIn: ${JSON.stringify(clerkState)}`);
        // clerk.signIn() returns before the post-sign-in redirect completes on
        // webkit. waitForLoadState('networkidle') resolves while still on /sign-in,
        // so the redirect fires later and interrupts the test's own page.goto.
        // Wait for the URL to actually leave /sign-in first (the redirect has fired),
        // then wait for the landing page to fully settle.
        await page.waitForURL((url) => !url.pathname.includes("sign-in"), {
          timeout: 10000,
        });
        await page.waitForLoadState("networkidle");
        // Wait for ClerkJS to finish establishing the session client-side.
        // Without this, ClerkJS fires another navigation to '/' while the test
        // is navigating away, causing "interrupted by another navigation" on webkit.
        await page
          .waitForFunction(
            () =>
              !!(
                window as unknown as {
                  Clerk?: { user?: { id?: string } };
                }
              ).Clerk?.user?.id,
            { timeout: 10000 }
          )
          .catch(() => {
            // Clerk global may not be available in all environments — continue anyway.
          });
      }
    }

    await use(page);
  },
});

export { expect } from "@playwright/test";
