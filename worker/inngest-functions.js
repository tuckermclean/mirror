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

import { Inngest } from "inngest";
import { decryptCookie } from "./crypto.js";
import { scrapeLinkedInProfile } from "./scraper.js";

// ---------------------------------------------------------------------------
// Structured logger — JSON to stdout
// ---------------------------------------------------------------------------

function log(level, msg, meta = {}) {
  process.stdout.write(JSON.stringify({ level, msg, ...meta }) + "\n");
}

// ---------------------------------------------------------------------------
// Inngest client
// ---------------------------------------------------------------------------

const inngest = new Inngest({
  id: "mirror",
  ...(process.env["INNGEST_EVENT_KEY"]
    ? { eventKey: process.env["INNGEST_EVENT_KEY"] }
    : {}),
  ...(process.env["INNGEST_SIGNING_KEY"]
    ? { signingKey: process.env["INNGEST_SIGNING_KEY"] }
    : { isDev: true }),
});

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
  },
  { event: "mirror/linkedin.scrape.requested" },
  async ({ event, step }) => {
    const { userId, profileUrl, encryptedCookie } = event.data;

    log("info", "[inngest] scrape-linkedin-profile triggered", {
      userId,
      profileUrl,
      // CRITICAL: encryptedCookie is NOT logged — only its presence is noted
      hasCookie: Boolean(encryptedCookie),
    });

    // Step 1: Decrypt the session cookie
    const decryptedCookie = await step.run("decrypt-cookie", async () => {
      const cookie = await decryptCookie(encryptedCookie);
      return cookie;
    });

    // Step 2: Scrape the LinkedIn profile, then immediately zero the cookie
    const parsed = await step.run("scrape-profile", async () => {
      let cookie = decryptedCookie;
      try {
        const result = await scrapeLinkedInProfile(profileUrl, cookie);
        return result;
      } finally {
        // Zero out the cookie variable — it must not survive this step
        // eslint-disable-next-line no-unused-vars
        cookie = null;
      }
    });

    log("info", "[inngest] profile scraped, persisting snapshot", { userId });

    // Step 3: Persist the snapshot to the main app (no cookie is sent)
    const { snapshotId } = await step.run("persist-snapshot", async () => {
      return persistSnapshot(userId, parsed);
    });

    log("info", "[inngest] snapshot persisted", { userId, snapshotId });

    // Emit completion event for downstream consumers (e.g. generation pipeline)
    await step.run("emit-snapshot-created", async () => {
      await inngest.send({
        name: "mirror/linkedin.snapshot.created",
        data: { userId, snapshotId },
      });
    });

    return { userId, snapshotId };
  }
);
