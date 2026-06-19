import type { FullConfig } from "@playwright/test";

export default async function globalSetup(_config: FullConfig) {
  if (!process.env["CLERK_SECRET_KEY"]) return;
  const { clerkSetup } = await import("@clerk/testing/playwright");

  // clerkSetup() calls Clerk's Backend API to mint the testing token used by the
  // suite. Under CI contention that call can throw a transient ClerkAPIResponseError
  // (empty body), which would fail the entire run before any test executes — and
  // global setup is NOT re-run by per-test retries. Retry with linear backoff so a
  // single API blip doesn't sink the whole E2E job.
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await clerkSetup();
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
}
