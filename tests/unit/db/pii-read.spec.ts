/**
 * Unit tests for readPii<T>().
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

// Spy on eq and and from drizzle-orm to verify ownership filtering in WHERE clause.
const mockEq = vi.hoisted(() => vi.fn((...args: unknown[]) => ({ _tag: "eq", args })));
const mockAnd = vi.hoisted(() => vi.fn((...args: unknown[]) => ({ _tag: "and", args })));

vi.mock("drizzle-orm", async (importActual) => {
  const actual = await importActual<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (...args: Parameters<typeof actual.eq>) => mockEq(...args),
    and: (...args: Parameters<typeof actual.and>) => mockAnd(...args),
  };
});

// Transaction mock: the callback receives a tx object; we invoke it synchronously
// so tests can assert on tx.insert / tx.update calls.
const mockTxValues = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockTxInsert = vi.hoisted(() => vi.fn(() => ({ values: mockTxValues })));
const mockTxUpdateWhere = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockTxUpdateSet = vi.hoisted(() => vi.fn(() => ({ where: mockTxUpdateWhere })));
const mockTxUpdate = vi.hoisted(() => vi.fn(() => ({ set: mockTxUpdateSet })));
const mockTx = vi.hoisted(() => ({ insert: mockTxInsert, update: mockTxUpdate }));
const mockTransaction = vi.hoisted(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  () => vi.fn(async (fn: (tx: any) => Promise<void>) => fn(mockTx))
);

vi.mock("@/db/client", () => ({
  db: { insert: mockInsert, select: mockSelect, transaction: mockTransaction },
}));

vi.mock("@/db/schema", () => ({
  auditLog: Symbol("auditLog"),
  interviews: {
    transcript: Symbol("interviews.transcript"),
    id: Symbol("interviews.id"),
    userId: Symbol("interviews.userId"),
  },
  imports: {
    rawPath: Symbol("imports.rawPath"),
    parsed: Symbol("imports.parsed"),
    id: Symbol("imports.id"),
    userId: Symbol("imports.userId"),
  },
}));

import { readPii, writePii, readInterviewTranscript, readImportRawPath, readImportParsed } from "@/lib/db/pii-read";

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

  it("flags ALIASED PII imports (e.g. interviews as ivs) — bypass prevention", async () => {
    const { ESLint } = await import("eslint");
    const cwd = process.cwd();
    const eslint = new ESLint({ cwd });

    // An attacker-style bypass: alias the PII table on import so the literal
    // binding-name selector (object.name='interviews') no longer matches.
    const fixture = [
      'import { db } from "@/db/client";',
      'import { interviews as ivs } from "@/db/schema";',
      "export async function bad() {",
      "  return db.select({ transcript: ivs.transcript }).from(ivs);",
      "}",
    ].join("\n");

    const results = await eslint.lintText(fixture, {
      filePath: path.join(cwd, "src", "lib", "pii-alias-fixture.ts"),
    });

    const messages = results[0]?.messages ?? [];
    const piiErrors = messages.filter((m) =>
      m.message.includes("Aliased import of PII table")
    );
    expect(
      piiErrors.length,
      `Aliased PII import must still be flagged; got: ${JSON.stringify(messages.map((m) => m.message))}`
    ).toBeGreaterThanOrEqual(1);
  });

  it("flags aliased imports.rawPath / linkedinSnapshots.rawHtml access", async () => {
    const { ESLint } = await import("eslint");
    const cwd = process.cwd();
    const eslint = new ESLint({ cwd });

    const fixture = [
      'import { db } from "@/db/client";',
      'import { imports as imp, linkedinSnapshots as snaps } from "@/db/schema";',
      "export async function bad() {",
      "  const a = db.select({ p: imp.rawPath }).from(imp);",
      "  const b = db.select({ h: snaps.rawHtml }).from(snaps);",
      "  return [a, b];",
      "}",
    ].join("\n");

    const results = await eslint.lintText(fixture, {
      filePath: path.join(cwd, "src", "lib", "pii-alias-fixture2.ts"),
    });

    const messages = results[0]?.messages ?? [];
    const piiErrors = messages.filter((m) =>
      m.message.includes("Aliased import of PII table")
    );
    expect(
      piiErrors.length,
      `Aliased imports/snapshots PII reads must be flagged; got: ${JSON.stringify(messages.map((m) => m.message))}`
    ).toBeGreaterThanOrEqual(2);
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
    // Restore eq/and spy implementations after vi.clearAllMocks() resets them.
    mockEq.mockImplementation((...args: unknown[]) => ({ _tag: "eq", args }));
    mockAnd.mockImplementation((...args: unknown[]) => ({ _tag: "and", args }));
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
    await readInterviewTranscript("interview-1", "user-1", "test reason", { ipAddress: "203.0.113.42" });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: "203.0.113.42" })
    );
  });

  it("defaults accessorId to userId when not provided (subject self-read)", async () => {
    await readInterviewTranscript("interview-1", "user-1", "test reason");
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", accessorId: "user-1" })
    );
  });

  it("records an explicit accessorId distinct from userId (service-account read)", async () => {
    await readInterviewTranscript(
      "interview-1",
      "user-1",
      "support investigation",
      { accessorId: "service-account-7" }
    );
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        accessorId: "service-account-7",
      })
    );
  });

  it("enforces ownership: WHERE clause includes eq(interviews.userId, userId) — IDOR prevention", async () => {
    // Arrange: import the mocked schema to get the userId symbol
    const schema = await import("@/db/schema");
    const { interviews } = schema;

    // Act
    await readInterviewTranscript("interview-1", "user-1", "test reason");

    // Assert: eq must have been called with interviews.userId and the userId arg
    const eqCalls = mockEq.mock.calls;
    const userIdCheck = eqCalls.find(
      (call) => call[0] === interviews.userId && call[1] === "user-1"
    );
    expect(
      userIdCheck,
      "eq(interviews.userId, userId) must appear in WHERE clause to prevent IDOR"
    ).toBeDefined();

    // Assert: and() must have been called to combine the id and userId conditions
    expect(
      mockAnd,
      "and() must be used to combine interviewId and userId conditions"
    ).toHaveBeenCalled();
  });
});

describe("readImportRawPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockImplementation(() => ({ values: mockValues }));
    mockValues.mockResolvedValue([]);
    mockLimit.mockResolvedValue([{ rawPath: "imports/user-1/profile.pdf" }]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockEq.mockImplementation((...args: unknown[]) => ({ _tag: "eq", args }));
    mockAnd.mockImplementation((...args: unknown[]) => ({ _tag: "and", args }));
  });

  it("returns the rawPath for the given importId", async () => {
    const result = await readImportRawPath("import-1", "user-1", "test reason");
    expect(result).toEqual({ rawPath: "imports/user-1/profile.pdf" });
  });

  it("writes an audit_log row with correct fields", async () => {
    await readImportRawPath("import-1", "user-1", "test reason");
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        accessorId: "user-1",
        tableName: "imports",
        rowId: "import-1",
        fieldName: "raw_path",
        reason: "test reason",
      })
    );
  });

  it("returns undefined when no import row is found", async () => {
    mockLimit.mockResolvedValue([]);
    const result = await readImportRawPath("missing-id", "user-1", "test reason");
    expect(result).toBeUndefined();
  });

  it("enforces ownership: WHERE clause includes eq(imports.userId, accessorId) — IDOR prevention", async () => {
    const schema = await import("@/db/schema");
    const { imports } = schema;

    await readImportRawPath("import-1", "user-1", "test reason");

    const eqCalls = mockEq.mock.calls;
    const userIdCheck = eqCalls.find(
      (call) => call[0] === imports.userId && call[1] === "user-1"
    );
    expect(
      userIdCheck,
      "eq(imports.userId, accessorId) must appear in WHERE clause to prevent IDOR"
    ).toBeDefined();

    expect(
      mockAnd,
      "and() must be used to combine importId and userId conditions"
    ).toHaveBeenCalled();
  });
});

describe("readImportParsed", () => {
  const parsedData = { source: "linkedin_pdf", messages: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockImplementation(() => ({ values: mockValues }));
    mockValues.mockResolvedValue([]);
    mockLimit.mockResolvedValue([{ parsed: parsedData }]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockEq.mockImplementation((...args: unknown[]) => ({ _tag: "eq", args }));
    mockAnd.mockImplementation((...args: unknown[]) => ({ _tag: "and", args }));
  });

  it("returns the parsed field for the given importId", async () => {
    const result = await readImportParsed("import-1", "user-1", "test reason");
    expect(result).toEqual({ parsed: parsedData });
  });

  it("writes an audit_log row with correct fields", async () => {
    await readImportParsed("import-1", "user-1", "test reason");
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        accessorId: "user-1",
        tableName: "imports",
        rowId: "import-1",
        fieldName: "parsed",
        reason: "test reason",
      })
    );
  });

  it("returns undefined when no import row is found", async () => {
    mockLimit.mockResolvedValue([]);
    const result = await readImportParsed("missing-id", "user-1", "test reason");
    expect(result).toBeUndefined();
  });

  it("enforces ownership: WHERE clause includes eq(imports.userId, userId) — IDOR prevention", async () => {
    const schema = await import("@/db/schema");
    const { imports } = schema;

    await readImportParsed("import-1", "user-1", "test reason");

    const eqCalls = mockEq.mock.calls;
    const userIdCheck = eqCalls.find(
      (call) => call[0] === imports.userId && call[1] === "user-1"
    );
    expect(
      userIdCheck,
      "eq(imports.userId, userId) must appear in WHERE clause to prevent IDOR"
    ).toBeDefined();

    expect(
      mockAnd,
      "and() must be used to combine importId and userId conditions"
    ).toHaveBeenCalled();
  });
});

const baseWriteAudit = {
  userId: "user-uuid-1",
  accessorId: "user-uuid-1",
  tableName: "imports",
  rowId: "import-uuid-1",
  fieldName: "parsed",
  reason: "test write",
} as const;

describe("writePii", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTxInsert.mockImplementation(() => ({ values: mockTxValues }));
    mockTxValues.mockResolvedValue([]);
    mockTxUpdate.mockImplementation(() => ({ set: mockTxUpdateSet }));
    mockTxUpdateSet.mockImplementation(() => ({ where: mockTxUpdateWhere }));
    mockTxUpdateWhere.mockResolvedValue([]);
    mockTransaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (fn: (tx: any) => Promise<void>) => fn(mockTx)
    );
  });

  it("calls the mutation with the transaction object", async () => {
    const mutation = vi.fn().mockResolvedValue(undefined);
    await writePii(mutation, baseWriteAudit);
    expect(mutation).toHaveBeenCalledOnce();
    expect(mutation).toHaveBeenCalledWith(mockTx);
  });

  it("inserts an audit_log row inside the transaction with all required fields", async () => {
    await writePii(vi.fn().mockResolvedValue(undefined), baseWriteAudit);
    expect(mockTxInsert).toHaveBeenCalledOnce();
    expect(mockTxValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: baseWriteAudit.userId,
        accessorId: baseWriteAudit.accessorId,
        tableName: baseWriteAudit.tableName,
        rowId: baseWriteAudit.rowId,
        fieldName: baseWriteAudit.fieldName,
        reason: baseWriteAudit.reason,
      })
    );
  });

  it("propagates an error from the mutation and does not insert the audit row", async () => {
    const mutation = vi.fn().mockRejectedValue(new Error("mutation failed"));
    // Make the transaction re-throw when the callback throws
    mockTransaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (fn: (tx: any) => Promise<void>) => fn(mockTx)
    );
    await expect(writePii(mutation, baseWriteAudit)).rejects.toThrow("mutation failed");
    expect(mockTxInsert).not.toHaveBeenCalled();
  });

  it("propagates an error from the audit insert", async () => {
    mockTxValues.mockRejectedValueOnce(new Error("audit insert failed"));
    await expect(
      writePii(vi.fn().mockResolvedValue(undefined), baseWriteAudit)
    ).rejects.toThrow("audit insert failed");
  });

  it("passes ipAddress to the audit row when provided", async () => {
    await writePii(vi.fn().mockResolvedValue(undefined), {
      ...baseWriteAudit,
      ipAddress: "203.0.113.42",
    });
    expect(mockTxValues).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: "203.0.113.42" })
    );
  });
});
