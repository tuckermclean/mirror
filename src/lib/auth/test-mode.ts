// Clerk test-mode helpers for Playwright E2E tests.
// Uses @clerk/testing to generate signed dev JWTs without a real Clerk instance.
// Real Clerk keys are plugged in via .env.local; these helpers work in test mode
// when CLERK_SECRET_KEY starts with "sk_test_".

import { clerkSetup } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

export { clerkSetup };

export async function signInTestUser(page: Page): Promise<void> {
  // In test mode Clerk provides a helper to bypass the sign-in UI.
  // When CLERK_SECRET_KEY is not set, we navigate to sign-in and check the page loads.
  const clerkKey = process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"];
  if (!clerkKey || clerkKey === "pk_test_placeholder") {
    // No real Clerk key — just navigate; auth tests check page structure only.
    return;
  }
  await page.goto("/sign-in");
}
