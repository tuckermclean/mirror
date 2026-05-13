import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";

type AuthFixtures = {
  authedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    const clerkKey = process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"];
    const hasClerkKey = clerkKey && clerkKey !== "pk_test_placeholder";

    if (hasClerkKey) {
      const { setupClerkTestingToken } = await import("@clerk/testing/playwright");
      await setupClerkTestingToken({ page });
    }

    await use(page);
  },
});

export { expect } from "@playwright/test";
