/**
 * Unit tests for readImportRawPath() in pii-read.ts.
 *
 * DB is fully mocked; no DATABASE_URL needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  imports: {
    rawPath: Symbol("imports.rawPath"),
    id: Symbol("imports.id"),
    userId: Symbol("imports.userId"),
  },
}));

import { readImportRawPath } from "@/lib/db/pii-read";

describe("readImportRawPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockImplementation(() => ({ values: mockValues }));
    mockValues.mockResolvedValue([]);
    mockLimit.mockResolvedValue([{ rawPath: "imports/user-1/uuid/export.zip" }]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
  });

  it("returns the rawPath for the given importId", async () => {
    const result = await readImportRawPath("import-1", "user-1", "inngest worker");
    expect(result).toEqual({ rawPath: "imports/user-1/uuid/export.zip" });
  });

  it("writes an audit_log row with correct fields", async () => {
    await readImportRawPath("import-1", "user-1", "inngest worker");
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        accessorId: "user-1",
        tableName: "imports",
        rowId: "import-1",
        fieldName: "raw_path",
        reason: "inngest worker",
      })
    );
  });

  it("returns undefined when no import row is found", async () => {
    mockLimit.mockResolvedValue([]);
    const result = await readImportRawPath("missing-id", "user-1", "test");
    expect(result).toBeUndefined();
  });

  it("forwards ipAddress to the audit row when provided", async () => {
    await readImportRawPath("import-1", "user-1", "test reason", "10.0.0.1");
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: "10.0.0.1" })
    );
  });

  it("does not return data when audit write throws", async () => {
    mockValues.mockRejectedValueOnce(new Error("audit DB down"));
    await expect(
      readImportRawPath("import-1", "user-1", "test")
    ).rejects.toThrow("audit DB down");
  });
});
