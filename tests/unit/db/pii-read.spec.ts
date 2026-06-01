/**
 * Unit tests for readPii<T>() — RED phase per TDD.
 *
 * DB is fully mocked; no DATABASE_URL needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Mocks — must appear before the import of readPii so vi.mock hoisting works.
// ---------------------------------------------------------------------------
const mockValues = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockInsert = vi.hoisted(() => vi.fn(() => ({ values: mockValues })));
const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());
const mockLimit = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({
  db: { insert: mockInsert, select: mockSelect },
}));

vi.mock("@/db/schema", () => ({
  auditLog: Symbol("auditLog"),
  interviews: {
    transcript: Symbol("interviews.transcript"),
    id: Symbol("interviews.id"),
  },
}));

import { readPii, readInterviewTranscript } from "@/lib/db/pii-read";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const baseAudit = {
  userId: "user-uuid-1",
  accessorId: "user-uuid-1",
  tableName: "interviews",
  rowId: "row-uuid-1",
  fieldName: "transcript",
  reason: "automated test",
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("readPii", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockImplementation(() => ({ values: mockValues }));
    mockValues.mockResolvedValue([]);
    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
  });

  it("calls the query function exactly once and returns its result", async () => {
    const expected = [{ id: "row-1", data: "sensitive" }];
    const query = vi.fn().mockResolvedValue(expected);

    const result = await readPii(query, baseAudit);

    expect(query).toHaveBeenCalledOnce();
    expect(result).toBe(expected);
  });

  it("writes an audit_log row with all required fields", async () => {
    const query = vi.fn().mockResolvedValue(null);

    await readPii(query, baseAudit);

    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: baseAudit.userId,
        accessorId: baseAudit.accessorId,
        tableName: baseAudit.tableName,
        rowId: baseAudit.rowId,
        fieldName: baseAudit.fieldName,
        reason: baseAudit.reason,
      })
    );
  });

  it("passes ipAddress to the audit row when provided", async () => {
    const query = vi.fn().mockResolvedValue(null);
    const audit = { ...baseAudit, ipAddress: "203.0.113.42" };

    await readPii(query, audit);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: "203.0.113.42" })
    );
  });

  it("returns the query result even when audit has no ipAddress", async () => {
    const expected = { secret: "value" };
    const result = await readPii(async () => expected, baseAudit);
    expect(result).toEqual(expected);
  });

  it("requires reason in audit params (TypeScript compile-time enforcement)", () => {
    // This is a compile-time test. If `reason` were optional, the @ts-expect-error below
    // would be "unused" and pnpm typecheck would fail — which is exactly the gate.
    type AuditParam = Parameters<typeof readPii>[1];

    const _withReason: AuditParam = {
      userId: "u",
      accessorId: "a",
      tableName: "t",
      rowId: "r",
      fieldName: "f",
      reason: "present",
    };
    void _withReason;

    // @ts-expect-error — reason is required; omitting it must be a compile error
    const _withoutReason: AuditParam = {
      userId: "u",
      accessorId: "a",
      tableName: "t",
      rowId: "r",
      fieldName: "f",
    };
    void _withoutReason;

    expect(true).toBe(true);
  });

  it("chat route.ts has no no-restricted-syntax eslint-disable bypasses", () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "api", "chat", "route.ts"),
      "utf-8"
    );
    expect(
      content,
      "route.ts must not suppress the PII ESLint rule — use readPii() instead"
    ).not.toMatch(/eslint-disable.*no-restricted-syntax/);
  });

  it("does NOT return data when audit write throws", async () => {
    mockValues.mockRejectedValueOnce(new Error("DB down"));
    await expect(readPii(async () => "sensitive", baseAudit)).rejects.toThrow("DB down");
  });

  it("propagates query errors without writing an audit row", async () => {
    const query = vi.fn().mockRejectedValue(new Error("query failed"));
    await expect(readPii(query, baseAudit)).rejects.toThrow("query failed");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("flags direct interviews.transcript access with the ESLint PII rule", async () => {
    const { ESLint } = await import("eslint");
    const cwd = process.cwd();
    const eslint = new ESLint({ cwd });

    // Inline fixture: a file that imports db and selects a PII column directly.
    // The imports don't need to resolve — no-restricted-syntax is purely syntactic.
    const fixture = [
      'import { db } from "@/db/client";',
      'import { interviews } from "@/db/schema";',
      "export async function bad() {",
      "  return db.select({ transcript: interviews.transcript }).from(interviews);",
      "}",
    ].join("\n");

    const results = await eslint.lintText(fixture, {
      // Absolute path so ESLint resolves the config correctly; not in ignore list.
      filePath: path.join(cwd, "src", "lib", "pii-fixture.ts"),
    });

    const messages = results[0]?.messages ?? [];
    const piiErrors = messages.filter((m) =>
      m.message.includes("Direct PII column read")
    );
    // Surface all lint messages if assertion fails for easier debugging
    expect(
      piiErrors.length,
      `Expected PII lint error but got messages: ${JSON.stringify(messages.map((m) => m.message))}`
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("readInterviewTranscript", () => {
  const transcriptData = [{ role: "user", content: "hello" }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockImplementation(() => ({ values: mockValues }));
    mockValues.mockResolvedValue([]);
    mockLimit.mockResolvedValue([{ transcript: transcriptData }]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
  });

  it("returns the transcript row for the given interviewId", async () => {
    const result = await readInterviewTranscript("interview-1", "user-1", "test reason");
    expect(result).toEqual({ transcript: transcriptData });
  });

  it("writes an audit_log row with correct fields", async () => {
    await readInterviewTranscript("interview-1", "user-1", "test reason");
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        accessorId: "user-1",
        tableName: "interviews",
        rowId: "interview-1",
        fieldName: "transcript",
        reason: "test reason",
      })
    );
  });

  it("returns undefined when no interview row is found", async () => {
    mockLimit.mockResolvedValue([]);
    const result = await readInterviewTranscript("missing-id", "user-1", "test reason");
    expect(result).toBeUndefined();
  });

  it("forwards ipAddress to the audit row when provided", async () => {
    await readInterviewTranscript("interview-1", "user-1", "test reason", "203.0.113.42");
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: "203.0.113.42" })
    );
  });
});
