/**
 * Integration tests for src/lib/db/delete-user.ts — RED first per TDD.
 *
 * Exercises the GDPR Art. 17 redaction-in-place path documented in ADR-009.
 * Uses a real Postgres (DATABASE_URL) so the FK behaviour and column NOT NULL
 * constraints are the same ones production sees; mocked unit tests would let
 * the audit_log.accessor_id RESTRICT FK violation slip through.
 *
 * Run with: DATABASE_URL=... pnpm test:integration
 * Skipped automatically when DATABASE_URL is absent.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { db } from "@/db/client";
import {
  users,
  interviews,
  imports,
  linkedinSnapshots,
  generations,
  commits,
  outcomes,
  outcomeDeltas,
  llmSpendLedger,
  auditLog,
} from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { deleteUser, DELETED_PLAN } from "@/lib/db/delete-user";

const itWithDb = process.env["DATABASE_URL"] ? it : it.skip;
const describeWithDb = process.env["DATABASE_URL"] ? describe : describe.skip;

// Unique suffix per call so parallel runs and repeated beforeEach calls don't collide.
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

async function insertTestUser(label: string) {
  const id = suffix();
  const [row] = await db
    .insert(users)
    .values({
      clerkId: `test-${label}-${id}`,
      email: `test-${label}-${id}@example.test`,
      plan: "free",
    })
    .returning();
  if (!row) throw new Error("failed to insert test user");
  return row;
}

describeWithDb("deleteUser — GDPR redaction-in-place (ADR-009)", () => {
  let subject: { id: string; clerkId: string; email: string };
  let accessor: { id: string; clerkId: string; email: string };

  beforeEach(async () => {
    subject = await insertTestUser("subject");
    accessor = await insertTestUser("accessor");
  });

  afterEach(async () => {
    // Per-test cleanup so the array never accumulates across beforeEach calls.
    // Guard against undefined in case beforeEach threw before assigning subject/accessor.
    for (const user of [subject, accessor]) {
      if (!user) continue;
      await db.delete(auditLog).where(or(eq(auditLog.userId, user.id), eq(auditLog.accessorId, user.id)));
      await db.delete(users).where(eq(users.id, user.id));
    }
  });

  itWithDb("redacts PII columns on the users row but preserves users.id", async () => {
    const originalId = subject.id;

    await deleteUser(subject.id);

    const [row] = await db.select().from(users).where(eq(users.id, originalId));
    expect(row, "users.id row must survive redaction").toBeDefined();
    expect(row?.id).toBe(originalId);
    expect(row?.email).not.toBe(subject.email);
    expect(row?.email).not.toContain("@example.test");
    expect(row?.clerkId).not.toBe(subject.clerkId);
    expect(row?.plan).toBe(DELETED_PLAN);
    expect(row?.voiceProfileId).toBeNull();
  });

  itWithDb("redacted placeholders are deterministic in users.id (idempotent)", async () => {
    await deleteUser(subject.id);
    const [afterFirst] = await db.select().from(users).where(eq(users.id, subject.id));

    await deleteUser(subject.id);
    const [afterSecond] = await db.select().from(users).where(eq(users.id, subject.id));

    expect(afterSecond?.email).toBe(afterFirst?.email);
    expect(afterSecond?.clerkId).toBe(afterFirst?.clerkId);
    expect(afterSecond?.plan).toBe(DELETED_PLAN);
  });

  itWithDb("deletes all PII-bearing child rows in interviews/imports/snapshots", async () => {
    await db.insert(interviews).values({ userId: subject.id, transcript: [] });
    const [imp] = await db
      .insert(imports)
      .values({ userId: subject.id, source: "chatgpt" })
      .returning();
    await db
      .insert(linkedinSnapshots)
      .values({ userId: subject.id, rawHtml: "<html>secret</html>" });
    if (!imp) throw new Error("failed to insert import");

    await deleteUser(subject.id);

    const remainingInterviews = await db
      .select()
      .from(interviews)
      .where(eq(interviews.userId, subject.id));
    const remainingImports = await db
      .select()
      .from(imports)
      .where(eq(imports.userId, subject.id));
    const remainingSnapshots = await db
      .select()
      .from(linkedinSnapshots)
      .where(eq(linkedinSnapshots.userId, subject.id));

    expect(remainingInterviews).toHaveLength(0);
    expect(remainingImports).toHaveLength(0);
    expect(remainingSnapshots).toHaveLength(0);
  });

  itWithDb("deletes generations, commits, outcomes, outcome_deltas, llm_spend_ledger", async () => {
    const [gen] = await db
      .insert(generations)
      .values({
        userId: subject.id,
        output: {},
        rationale: {},
        model: "claude-opus-4-7",
        promptHash: "abc",
      })
      .returning();
    if (!gen) throw new Error("failed to insert generation");

    await db.insert(commits).values({
      userId: subject.id,
      generationId: gen.id,
      method: "manual",
    });
    await db.insert(outcomes).values({
      userId: subject.id,
      weekOf: "2026-05-25",
      source: "manual",
    });
    await db.insert(outcomeDeltas).values({
      userId: subject.id,
      generationId: gen.id,
    });
    await db.insert(llmSpendLedger).values({
      userId: subject.id,
      generationId: gen.id,
      model: "claude-opus-4-7",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: "0.012345",
    });

    await deleteUser(subject.id);

    for (const [label, query] of [
      ["generations", db.select().from(generations).where(eq(generations.userId, subject.id))],
      ["commits", db.select().from(commits).where(eq(commits.userId, subject.id))],
      ["outcomes", db.select().from(outcomes).where(eq(outcomes.userId, subject.id))],
      [
        "outcome_deltas",
        db.select().from(outcomeDeltas).where(eq(outcomeDeltas.userId, subject.id)),
      ],
      [
        "llm_spend_ledger",
        db.select().from(llmSpendLedger).where(eq(llmSpendLedger.userId, subject.id)),
      ],
    ] as const) {
      const rows = await query;
      expect(rows, `${label} rows for the deleted user must be gone`).toHaveLength(0);
    }
  });

  itWithDb(
    "succeeds when the subject is also an accessor with audit_log rows (the RESTRICT case)",
    async () => {
      // This is the regression the whole change exists to fix. Before ADR-009,
      // DELETE FROM users on a subject with audit_log.accessor_id rows raised
      // a FK violation because of ON DELETE RESTRICT.
      await db.insert(auditLog).values({
        userId: accessor.id,
        accessorId: subject.id,
        tableName: "interviews",
        rowId: subject.id,
        fieldName: "transcript",
      });

      await expect(deleteUser(subject.id)).resolves.not.toThrow();

      const [row] = await db.select().from(users).where(eq(users.id, subject.id));
      expect(row?.id).toBe(subject.id);
      expect(row?.plan).toBe(DELETED_PLAN);
    }
  );

  itWithDb("leaves the accessor's audit_log rows intact after subject erasure", async () => {
    const [logRow] = await db
      .insert(auditLog)
      .values({
        userId: subject.id, // the read was *about* the subject
        accessorId: accessor.id, // performed by the accessor
        tableName: "interviews",
        rowId: subject.id,
        fieldName: "transcript",
      })
      .returning();
    if (!logRow) throw new Error("failed to insert audit_log row");

    await deleteUser(subject.id);

    // The audit row must still exist — the accessor's trail outlives the subject.
    // userId may be redacted/NULLed; accessorId and tableName/fieldName are the
    // forensic load-bearing fields and must survive verbatim.
    const [stillThere] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.id, logRow.id));
    expect(stillThere, "audit_log row must outlive subject deletion").toBeDefined();
    expect(stillThere?.accessorId).toBe(accessor.id);
    expect(stillThere?.tableName).toBe("interviews");
    expect(stillThere?.fieldName).toBe("transcript");
  });

  itWithDb("the redacted user can be deleted (the actual no-PII row is removable)", async () => {
    // Belt-and-braces: after redaction, if a future ADR adds a true hard-delete
    // path, the row is structurally deletable as long as no audit_log entry
    // references it as an accessor. This test confirms the redacted row is not
    // an inadvertent permanent fixture.
    await deleteUser(subject.id);
    await db.delete(users).where(eq(users.id, subject.id));
    const after = await db.select().from(users).where(eq(users.id, subject.id));
    expect(after).toHaveLength(0);
  });

  itWithDb("is a no-op when userId does not exist in the DB", async () => {
    // Documents the contract: zero rows updated/deleted → silent success.
    // A caller checking only Promise<void> resolution cannot distinguish
    // "redacted" from "never existed" — both are valid outcomes.
    await expect(
      deleteUser("00000000-0000-0000-0000-000000000000")
    ).resolves.not.toThrow();
  });

  itWithDb("nulls voiceProfileId when the referenced import is deleted mid-transaction", async () => {
    // Tests the interesting FK path: users.voiceProfileId → imports.id ON DELETE SET NULL.
    // When the import is deleted inside the transaction, the cascade fires and sets
    // voiceProfileId to null; the subsequent explicit .set({ voiceProfileId: null })
    // in the UPDATE is then a no-op write-of-same — both succeed without constraint violation.
    const [imp] = await db
      .insert(imports)
      .values({ userId: subject.id, source: "chatgpt" })
      .returning();
    if (!imp) throw new Error("failed to insert import");

    await db
      .update(users)
      .set({ voiceProfileId: imp.id })
      .where(eq(users.id, subject.id));

    await deleteUser(subject.id);

    const [row] = await db.select().from(users).where(eq(users.id, subject.id));
    expect(row?.voiceProfileId).toBeNull();
    const remainingImports = await db
      .select()
      .from(imports)
      .where(eq(imports.userId, subject.id));
    expect(remainingImports).toHaveLength(0);
  });
});
