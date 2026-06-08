/**
 * worker/inngest-functions.js — Inngest function definitions for the worker
 *
 * This module defines the Inngest functions that run in the Playwright worker
 * process. Functions are event-driven and orchestrated by Inngest.
 *
 * Internal API contract:
 *   POST /api/internal/linkedin-snapshot
 *   Body: { userId: string, parsed: object }
 *   Auth: Bearer INTERNAL_API_SECRET (from process.env.INTERNAL_API_SECRET)
 *   Response: { snapshotId: string } on success
 *
 * The endpoint MUST NOT receive the session cookie — only the parsed data.
 */

import { inngest } from "./inngest-client.js";
import { decryptCookie } from "./crypto.js";
import { scrapeLinkedInProfile } from "./scraper.js";

// ---------------------------------------------------------------------------
// Structured logger — JSON to stdout
// ---------------------------------------------------------------------------

function log(level, msg, meta = {}) {
  process.stdout.write(JSON.stringify({ level, msg, ...meta }) + "\n");
}

// ---------------------------------------------------------------------------
// Helper: POST parsed snapshot to the main app's internal API
// ---------------------------------------------------------------------------

/**
 * @param {string} userId
 * @param {object} parsed
 * @returns {Promise<{ snapshotId: string }>}
 */
async function persistSnapshot(userId, parsed) {
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
  const secret = process.env["INTERNAL_API_SECRET"];

  if (!secret) {
    throw new Error("INTERNAL_API_SECRET environment variable is required");
  }

  const url = `${appUrl}/api/internal/linkedin-snapshot`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ userId, parsed }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "<unreadable>");
    throw new Error(
      `[inngest] persist-snapshot failed — HTTP ${response.status}: ${body}`
    );
  }

  const data = await response.json();
  return data;
}

// ---------------------------------------------------------------------------
// Inngest function: scrape-linkedin-profile
// ---------------------------------------------------------------------------

export const scrapeLinkedInProfileFn = inngest.createFunction(
  {
    id: "scrape-linkedin-profile",
    name: "Scrape LinkedIn Profile (Tier A)",
    retries: 3,
    triggers: [{ event: "mirror/linkedin.scrape.requested" }],
  },
  async ({ event, step }) => {
    const { userId, profileUrl, encryptedCookie } = event.data;

    log("info", "[inngest] scrape-linkedin-profile triggered", {
      userId,
      profileUrl,
      // CRITICAL: encryptedCookie is NOT logged — only its presence is noted
      hasCookie: Boolean(encryptedCookie),
    });

    // Step 1: Decrypt the cookie (if present) and scrape the profile in a
    // single step so the plaintext li_at cookie is never serialised to Inngest
    // durable state. Returning the decrypted cookie from step.run() would
    // persist it to disk.
    // When encryptedCookie is null the user submitted without a cookie —
    // fall through to the public-scrape path (no decryption needed).
    const parsed = await step.run("decrypt-and-scrape", async () => {
      const cookie = encryptedCookie
        ? await decryptCookie(encryptedCookie)
        : null;
      const result = await scrapeLinkedInProfile(profileUrl, cookie);
      return result;
    });

    log("info", "[inngest] profile scraped, persisting snapshot", { userId });

    // Step 2: Persist the snapshot to the main app (no cookie is sent)
    const { snapshotId } = await step.run("persist-snapshot", async () => {
      return persistSnapshot(userId, parsed);
    });

    log("info", "[inngest] snapshot persisted", { userId, snapshotId });

    // Emit completion event using step.sendEvent() — automatically deduplicated
    // by Inngest on retries (unlike step.run wrapping inngest.send()).
    await step.sendEvent("emit-snapshot-created", {
      name: "mirror/linkedin.snapshot.created",
      data: { userId, snapshotId },
    });

    return { userId, snapshotId };
  }
);
