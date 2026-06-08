import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";

/**
 * Outcome-tracking consent persistence (Week 4 "Outcome tracking",
 * COMPLIANCE.md §2.2 — consent is the GDPR Art. 6(1)(a) lawful basis for the
 * optional outcome-tracking feature).
 *
 * State lives on `users.outcomeTrackingConsentAt`:
 *   - NULL      → no consent (never granted, or revoked)
 *   - timestamp → consented, recording when the opt-in happened
 *
 * Revoke sets the column back to NULL so collection actually stops — the
 * capture path gates on `hasOutcomeTrackingConsent` before writing any row.
 *
 * `userId` is the internal `users.id` (resolved via resolveActiveUserId), not
 * the Clerk id.
 */

/** Grant consent. Idempotent — re-granting just refreshes the timestamp. */
export async function grantOutcomeTrackingConsent(userId: string): Promise<Date> {
  const now = new Date();
  await db
    .update(users)
    .set({ outcomeTrackingConsentAt: now })
    .where(eq(users.id, userId));
  return now;
}

/** Revoke consent. Idempotent — clearing an already-null column is a no-op. */
export async function revokeOutcomeTrackingConsent(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ outcomeTrackingConsentAt: null })
    .where(eq(users.id, userId));
}

/** True when the user currently has outcome-tracking consent. */
export async function hasOutcomeTrackingConsent(userId: string): Promise<boolean> {
  const rows = await db
    .select({ at: users.outcomeTrackingConsentAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.at != null;
}
