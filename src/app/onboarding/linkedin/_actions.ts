"use server";

import { auth } from "@clerk/nextjs/server";
import { inngest } from "@/lib/inngest/client";
import { logger } from "@/lib/logger";

/** Matches https://www.linkedin.com/in/<slug> — rejects arbitrary URLs. */
const LINKEDIN_PROFILE_REGEX = /^https:\/\/www\.linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?$/;

export type LinkedInActionResult =
  | { success: true }
  | { success: false; error: string };

export async function submitLinkedInForm(
  formData: FormData
): Promise<LinkedInActionResult> {
  // Auth guard — AGENTS.md: return { success: false } if !userId (never throw)
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthenticated" };
  }

  const profileUrl = (formData.get("profileUrl") as string | null)?.trim() ?? "";
  const rawCookie = (formData.get("sessionCookie") as string | null)?.trim() ?? "";
  // PDF file is accepted but handed off to a separate upload flow — the
  // Inngest function receives the encrypted cookie and profile URL; file
  // storage goes through the existing import pipeline.

  if (!profileUrl) {
    return { success: false, error: "LinkedIn profile URL is required." };
  }

  // Suggestion 2: reject non-LinkedIn /in/ URLs before dispatching a scrape
  if (!LINKEDIN_PROFILE_REGEX.test(profileUrl)) {
    return {
      success: false,
      error: "Profile URL must match https://www.linkedin.com/in/<slug>.",
    };
  }

  let encryptedCookie: string | null = null;

  if (rawCookie) {
    try {
      // Blocker 2: use the real crypto module (shipped in this PR)
      const { encryptCookie } = await import("@/lib/crypto/cookie");
      encryptedCookie = await encryptCookie(rawCookie);
      // rawCookie intentionally never logged, never returned, never stored
      // unencrypted. Only encryptedCookie leaves this function.
    } catch (err) {
      logger.error("linkedin-action: failed to encrypt session cookie", {
        userId,
        err: err instanceof Error ? err.message : String(err),
        // NOTE: never log rawCookie here
      });
      return {
        success: false,
        error: "Could not securely store session cookie. Please try again.",
      };
    }
  }

  await inngest.send({
    name: "mirror/linkedin.scrape.requested",
    data: {
      userId,
      profileUrl,
      encryptedCookie,
    },
  });

  logger.info("linkedin-action: scrape event dispatched", { userId });

  return { success: true };
}
