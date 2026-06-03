/**
 * Integration tests for readPii<T>() — requires DATABASE_URL.
 *
 * Verifies that the wrapper writes a correct audit_log row against the real DB
 * and returns the query result unchanged.
 *
 * Run with: DATABASE_URL=... pnpm test:integration
 * Automatically skipped when DATABASE_URL is absent.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db/client";
import { users, auditLog } from "@/db/schema";
import { readPii } from "@/lib/db/pii-read";
import { and, eq } from "drizzle-orm";

const describeWithDb = process.env["DATABASE_URL"] ? describe : describe.skip;

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeWithDb("readPii — integration", () => {
  let userId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        clerkId: `test-piiread-${suffix()}`,
        email: `test-piiread-${suffix()}@example.test`,
        plan: "free",
      })
      .returning();
    if (!user) throw new Error("failed to insert test user");
    userId = user.id;
  });

  afterAll(async () => {
    if (!userId) return;
    await db.delete(auditLog).where(eq(auditLog.accessorId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("executes the query and returns its result", async () => {
    const expected = { id: "interview-1", summary: "test" };
    const query = async () => expected;

    const result = await readPii(query, {
      userId,
      accessorId: userId,
      tableName: "interviews",
      rowId: "00000000-0000-0000-0000-000000000001",
      fieldName: "transcript",
      reason: "integration test — readPii returns query data",
    });

    expect(result).toEqual(expected);
  });

  it("writes an audit_log row with correct fields", async () => {
    const query = async () => ({ data: "pii" });

    await readPii(query, {
      userId,
      accessorId: userId,
      tableName: "interviews",
      rowId: "00000000-0000-0000-0000-000000000002",
      fieldName: "transcript",
      reason: "integration test — audit trail verification",
      ipAddress: "198.51.100.1",
    });

    const logs = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.accessorId, userId),
          eq(auditLog.fieldName, "transcript"),
          eq(auditLog.rowId, "00000000-0000-0000-0000-000000000002")
        )
      );

    expect(logs).toHaveLength(1);
    const log = logs[0]!;
    expect(log.userId).toBe(userId);
    expect(log.tableName).toBe("interviews");
    expect(log.fieldName).toBe("transcript");
    expect(log.reason).toBe("integration test — audit trail verification");
    expect(log.ipAddress).toBe("198.51.100.1");
    expect(log.accessedAt).toBeInstanceOf(Date);
  });
});
