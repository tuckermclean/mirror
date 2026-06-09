/**
 * Integration tests for outcome tracking persistence (Week 4 "Outcome
 * tracking"). Requires DATABASE_URL pointing at a migrated postgres instance.
 * Skipped automatically when DATABASE_URL is absent.
 *
 * Covers:
 *  - outcomes insert/read round-trip via Drizzle.
 *  - consent grant/revoke persistence on users.outcomeTrackingConsentAt.
 *  - hasOutcomeTrackingConsent reflects persisted state.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db/client";
import { users, outcomes, auditLog } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import {
  grantOutcomeTrackingConsent,
  revokeOutcomeTrackingConsent,
  hasOutcomeTrackingConsent,
} from "@/lib/outcomes/consent";

const itWithDb = process.env["DATABASE_URL"] ? it : it.skip;
const describeWithDb = process.env["DATABASE_URL"] ? describe : describe.skip;

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

async function insertTestUser() {
  const id = suffix();
  const [row] = await db
    .insert(users)
    .values({
      clerkId: `test-outcomes-${id}`,
      email: `test-outcomes-${id}@example.test`,
      plan: "free",
    })
    .returning();
  if (!row) throw new Error("failed to insert test user");
  return row;
}

describeWithDb("outcome tracking persistence", () => {
  let user: { id: string };

  beforeEach(async () => {
    user = await insertTestUser();
  });

  afterEach(async () => {
    await db.delete(auditLog).where(or(eq(auditLog.userId, user.id), eq(auditLog.accessorId, user.id)));
    await db.delete(outcomes).where(eq(outcomes.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  });

  // -------------------------------------------------------------------------
  // outcomes insert/read
  // -------------------------------------------------------------------------
  itWithDb("inserts and reads back a self-reported outcome row", async () => {
    await db.insert(outcomes).values({
      userId: user.id,
      weekOf: "2026-02-02",
      profileViews: 42,
      searchAppearances: 8,
      recruiterMsgs: 3,
      postImpressions: 1200,
      source: "self_report",
    });

    const rows = await db.select().from(outcomes).where(eq(outcomes.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      weekOf: "2026-02-02",
      profileViews: 42,
      searchAppearances: 8,
      recruiterMsgs: 3,
      postImpressions: 1200,
      source: "self_report",
    });
  });

  // -------------------------------------------------------------------------
  // consent grant / revoke
  // -------------------------------------------------------------------------
  itWithDb("a fresh user has no outcome-tracking consent", async () => {
    expect(await hasOutcomeTrackingConsent(user.id)).toBe(false);
  });

  itWithDb("grant persists a consent timestamp and flips the flag to true", async () => {
    const grantedAt = await grantOutcomeTrackingConsent(user.id);
    expect(grantedAt).toBeInstanceOf(Date);

    const [row] = await db
      .select({ at: users.outcomeTrackingConsentAt })
      .from(users)
      .where(eq(users.id, user.id));
    expect(row?.at).not.toBeNull();
    expect(await hasOutcomeTrackingConsent(user.id)).toBe(true);
  });

  itWithDb("revoke clears the consent timestamp and flips the flag to false", async () => {
    await grantOutcomeTrackingConsent(user.id);
    expect(await hasOutcomeTrackingConsent(user.id)).toBe(true);

    await revokeOutcomeTrackingConsent(user.id);

    const [row] = await db
      .select({ at: users.outcomeTrackingConsentAt })
      .from(users)
      .where(eq(users.id, user.id));
    expect(row?.at).toBeNull();
    expect(await hasOutcomeTrackingConsent(user.id)).toBe(false);
  });

  itWithDb("grant is idempotent — re-granting does not error and stays consented", async () => {
    await grantOutcomeTrackingConsent(user.id);
    await grantOutcomeTrackingConsent(user.id);
    expect(await hasOutcomeTrackingConsent(user.id)).toBe(true);
  });
});
