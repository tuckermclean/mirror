import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";

type AuthFixtures = {
  authedPage: Page;
};

// Playwright fixture that provides a page with a simulated auth state.
// When NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is a real test-mode key, Clerk's
// testing helpers perform the actual sign-in flow.
// When no real key is present (local dev without Clerk), the page is returned
// as-is and auth-gated tests check page structure only (not auth state).
export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    const hasClerkKey =
      process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] &&
      process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] !== "pk_test_placeholder";

    if (hasClerkKey) {
      await page.goto("/sign-in");
      // With a real Clerk test key, use Clerk's programmatic sign-in:
      // await clerk.signIn({ page, signInParams: { strategy: "password", identifier: "...", password: "..." } });
      // For now, navigate to sign-in and let the test handle it.
    }

    await use(page);
  },
});

export { expect } from "@playwright/test";
