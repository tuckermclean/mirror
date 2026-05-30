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
      if (email && password) {
        await clerk.signIn({
          page,
          signInParams: { strategy: "password", identifier: email, password },
        });
        // clerk.signIn() returns before the post-sign-in redirect completes on
        // webkit. waitForLoadState('networkidle') resolves while still on /sign-in,
        // so the redirect fires later and interrupts the test's own page.goto.
        // Wait for the URL to actually leave /sign-in first (the redirect has fired),
        // then wait for the landing page to fully settle.
        await page.waitForURL((url) => !url.pathname.includes("sign-in"), {
          timeout: 10000,
        });
        await page.waitForLoadState("networkidle");
      }
    }

    await use(page);
  },
});

export { expect } from "@playwright/test";
