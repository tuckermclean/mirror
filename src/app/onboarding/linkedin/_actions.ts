"use server";

import { auth } from "@clerk/nextjs/server";
import { inngest } from "@/lib/inngest/client";
import { logger } from "@/lib/logger";
import { ValidationError } from "@/lib/errors";

// TODO: swap this stub to `import { encryptCookie } from "@/lib/crypto/cookie"`
// once the security specialist ships that module.
// The stub lives in a separate file so it is easily replaced without touching
// this server action.
type EncryptCookieFn = (cookie: string) => Promise<string>;

/**
 * Returns the real encryptCookie implementation when available, or throws a
 * ValidationError so we never silently store the session cookie in plaintext.
 *
 * Importing via a stub wrapper insulates this file from TS2307 until
 * @/lib/crypto/cookie is created.
 */
async function getEncryptCookie(): Promise<EncryptCookieFn> {
  // The crypto module is not yet in the codebase — this import will be
  // replaced with a real one once @/lib/crypto/cookie ships.
  // Intentionally never silently fall back to storing the raw cookie.
  throw new ValidationError(
    "Encryption module unavailable — cannot safely store session cookie. " +
    "Replace this stub with `import { encryptCookie } from '@/lib/crypto/cookie'`."
  );
}

export type LinkedInActionResult =
  | { success: true }
  | { success: false; error: string };

export async function submitLinkedInForm(
  formData: FormData
): Promise<LinkedInActionResult> {
  const { userId } = await auth();
  if (!userId) {
    throw new ValidationError("Unauthenticated");
  }

  const profileUrl = (formData.get("profileUrl") as string | null)?.trim() ?? "";
  const rawCookie = (formData.get("sessionCookie") as string | null)?.trim() ?? "";
  // PDF file is accepted but handed off to a separate upload flow — the
  // Inngest function receives the encrypted cookie and profile URL; file
  // storage goes through the existing import pipeline.

  if (!profileUrl) {
    return { success: false, error: "LinkedIn profile URL is required." };
  }

  let encryptedCookie: string | null = null;

  if (rawCookie) {
    try {
      const encryptCookie = await getEncryptCookie();
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
