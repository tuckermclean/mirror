/**
 * Unit tests for readImportRawPath().
 *
 * DB is fully mocked; no DATABASE_URL needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must appear before the import of readImportRawPath.
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
  imports: {
    rawPath: Symbol("imports.rawPath"),
    id: Symbol("imports.id"),
    status: Symbol("imports.status"),
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
const IMPORT_ID = "import-uuid-abc123";
const REQUESTER_ID = "user-uuid-def456";
const REASON = "worker background task";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("readImportRawPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockImplementation(() => ({ values: mockValues }));
    mockValues.mockResolvedValue([]);
    mockLimit.mockResolvedValue([{ rawPath: "uploads/abc/export.zip" }]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
  });

  it("returns the rawPath row for the given importId", async () => {
    const result = await readImportRawPath(IMPORT_ID, REQUESTER_ID, REASON);
    expect(result).toEqual({ rawPath: "uploads/abc/export.zip" });
  });

  it("writes an audit_log row with all required fields and exact accessorId", async () => {
    await readImportRawPath(IMPORT_ID, REQUESTER_ID, REASON);

    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: REQUESTER_ID,
        accessorId: REQUESTER_ID,
        tableName: "imports",
        rowId: IMPORT_ID,
        fieldName: "raw_path",
        reason: REASON,
      })
    );
  });

  it("uses exact accessorId value — not expect.any(String)", async () => {
    await readImportRawPath(IMPORT_ID, REQUESTER_ID, REASON);

    const callArg = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg["accessorId"]).toBe(REQUESTER_ID);
  });

  it("returns undefined when no import row is found", async () => {
    mockLimit.mockResolvedValue([]);
    const result = await readImportRawPath(IMPORT_ID, REQUESTER_ID, REASON);
    expect(result).toBeUndefined();
  });

  it("forwards ipAddress to the audit row when provided", async () => {
    await readImportRawPath(IMPORT_ID, REQUESTER_ID, REASON, {
      ipAddress: "203.0.113.42",
    });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: "203.0.113.42" })
    );
  });

  it("uses subjectUserId as audit userId when different from requesterId", async () => {
    const SUBJECT_ID = "subject-user-uuid-xyz789";
    await readImportRawPath(IMPORT_ID, REQUESTER_ID, REASON, {
      subjectUserId: SUBJECT_ID,
    });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SUBJECT_ID, accessorId: REQUESTER_ID })
    );
  });

  it("does NOT return data when audit write throws (fail-closed)", async () => {
    mockValues.mockRejectedValueOnce(new Error("audit DB down"));
    await expect(
      readImportRawPath(IMPORT_ID, REQUESTER_ID, REASON)
    ).rejects.toThrow("audit DB down");
  });

  it("propagates query errors without writing an audit row", async () => {
    mockLimit.mockRejectedValueOnce(new Error("query failed"));
    await expect(
      readImportRawPath(IMPORT_ID, REQUESTER_ID, REASON)
    ).rejects.toThrow("query failed");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
