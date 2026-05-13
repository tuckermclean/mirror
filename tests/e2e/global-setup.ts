import type { FullConfig } from "@playwright/test";

export default async function globalSetup(_config: FullConfig) {
  if (!process.env["CLERK_SECRET_KEY"]) return;
  const { clerkSetup } = await import("@clerk/testing/playwright");
  await clerkSetup();
}
