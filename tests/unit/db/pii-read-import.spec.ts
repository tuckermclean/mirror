/**
 * Unit tests for readImportRawPath() — verifies the PII audit wrapper contract.
 *
 * Security contract: reads from imports.raw_path MUST be gated behind the
 * PII audit wrapper so every access is recorded in audit_log.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted before SUT import
// ---------------------------------------------------------------------------
const mockValues = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockInsert = vi.hoisted(() => vi.fn(() => ({ values: mockValues })));
const mockLimit = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn(() => ({ limit: mockLimit })));
const mockFrom = vi.hoisted(() => vi.fn(() => ({ where: mockWhere })));
const mockSelect = vi.hoisted(() => vi.fn(() => ({ from: mockFrom })));

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

vi.mock("@/db/client", () => ({
  db: { insert: mockInsert, select: mockSelect },
}));

vi.mock("@/db/schema", () => ({
  auditLog: Symbol("auditLog"),
  imports: {
    rawPath: Symbol("imports.rawPath"),
    id: Symbol("imports.id"),
    userId: Symbol("imports.userId"),
  },
  interviews: {
    transcript: Symbol("interviews.transcript"),
    id: Symbol("interviews.id"),
  },
}));

import { readImportRawPath } from "@/lib/db/pii-read";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const IMPORT_ID = "import-uuid-1";
const ACCESSOR_ID = "user-uuid-1";
const REASON = "inngest worker: download raw file";

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockImplementation(() => ({ values: mockValues }));
  mockValues.mockResolvedValue([]);
  mockLimit.mockResolvedValue([{ rawPath: "imports/user/uuid/export.zip" }]);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
  // Restore eq/and spy implementations after vi.clearAllMocks() resets them.
  mockEq.mockImplementation((...args: unknown[]) => ({ _tag: "eq", args }));
  mockAnd.mockImplementation((...args: unknown[]) => ({ _tag: "and", args }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("readImportRawPath", () => {
  it("returns the rawPath row for the given importId", async () => {
    const result = await readImportRawPath(IMPORT_ID, ACCESSOR_ID, REASON);
    expect(result).toEqual({ rawPath: "imports/user/uuid/export.zip" });
  });

  it("returns undefined when no import row is found", async () => {
    mockLimit.mockResolvedValue([]);
    const result = await readImportRawPath(IMPORT_ID, ACCESSOR_ID, REASON);
    expect(result).toBeUndefined();
  });

  it("writes an audit_log row with correct tableName and fieldName", async () => {
    await readImportRawPath(IMPORT_ID, ACCESSOR_ID, REASON);
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "imports",
        rowId: IMPORT_ID,
        fieldName: "raw_path",
        accessorId: ACCESSOR_ID,
        reason: REASON,
      })
    );
  });

  it("sets userId equal to accessorId in the audit row (system self-access)", async () => {
    await readImportRawPath(IMPORT_ID, ACCESSOR_ID, REASON);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ACCESSOR_ID,
        accessorId: ACCESSOR_ID,
      })
    );
  });

  it("forwards ipAddress to the audit row when provided", async () => {
    await readImportRawPath(IMPORT_ID, ACCESSOR_ID, REASON, "203.0.113.5");
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: "203.0.113.5" })
    );
  });

  it("does NOT return data when audit write fails (fail-closed)", async () => {
    mockValues.mockRejectedValueOnce(new Error("audit DB down"));
    await expect(
      readImportRawPath(IMPORT_ID, ACCESSOR_ID, REASON)
    ).rejects.toThrow("audit DB down");
  });

  it("forwards reason to the audit row", async () => {
    await readImportRawPath(IMPORT_ID, ACCESSOR_ID, "non-empty reason");
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "non-empty reason" })
    );
  });

  it("rejects an empty reason — prevents silent audit bypass", async () => {
    await expect(
      readImportRawPath(IMPORT_ID, ACCESSOR_ID, "")
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("rejects a whitespace-only reason — prevents silent audit bypass", async () => {
    await expect(
      readImportRawPath(IMPORT_ID, ACCESSOR_ID, "   ")
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("enforces ownership: WHERE clause includes eq(imports.userId, accessorId) — IDOR prevention", async () => {
    const schema = await import("@/db/schema");
    const { imports } = schema;

    await readImportRawPath(IMPORT_ID, ACCESSOR_ID, REASON);

    const eqCalls = mockEq.mock.calls;
    const userIdCheck = eqCalls.find(
      (call) => call[0] === imports.userId && call[1] === ACCESSOR_ID
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
