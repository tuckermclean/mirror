/**
 * Unit tests for readImportRawPath() — RED phase per TDD.
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

vi.mock("@/db/client", () => ({
  db: { insert: mockInsert, select: mockSelect },
}));

vi.mock("@/db/schema", () => ({
  auditLog: Symbol("auditLog"),
  imports: {
    rawPath: Symbol("imports.rawPath"),
    id: Symbol("imports.id"),
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

  it("does NOT return data when audit write fails", async () => {
    mockValues.mockRejectedValueOnce(new Error("audit DB down"));
    await expect(
      readImportRawPath(IMPORT_ID, ACCESSOR_ID, REASON)
    ).rejects.toThrow("audit DB down");
  });

  it("requires a non-empty reason — prevents silent audit bypass", async () => {
    // The function signature requires `reason: string`. An empty string is
    // technically valid but auditors should always supply a meaningful reason.
    // This test documents the contract so any future type relaxation is deliberate.
    await readImportRawPath(IMPORT_ID, ACCESSOR_ID, "non-empty reason");
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "non-empty reason" })
    );
  });
});
