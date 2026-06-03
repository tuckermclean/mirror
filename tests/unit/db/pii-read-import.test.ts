import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
const mockSelect = vi.fn();

vi.mock("@/db/client", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
  },
}));

vi.mock("@/db/schema", () => ({
  auditLog: { tableName: "audit_log" },
  imports: { id: "id", rawPath: "raw_path", userId: "user_id" },
}));

describe("readImportRawPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns the rawPath for a matching import row", async () => {
    const mockRow = { id: "import-uuid", rawPath: "imports/user-1/uuid/file.zip", userId: "user-1" };
    const fromMock = { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([mockRow]) }) };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) });

    const { readImportRawPath } = await import("@/lib/db/pii-read");
    const result = await readImportRawPath("import-uuid", "user-1", "worker download");
    expect(result).toBeDefined();
    expect(result?.rawPath).toBe("imports/user-1/uuid/file.zip");
  });

  it("returns undefined when no row is found", async () => {
    const fromMock = { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) });

    const { readImportRawPath } = await import("@/lib/db/pii-read");
    const result = await readImportRawPath("missing-uuid", "user-1", "worker download");
    expect(result).toBeUndefined();
  });

  it("writes an audit_log row after the read", async () => {
    const mockRow = { id: "import-uuid", rawPath: "imports/user-1/uuid/file.zip", userId: "user-1" };
    const fromMock = { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([mockRow]) }) };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) });
    const valuesMock = vi.fn().mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: valuesMock });

    const { readImportRawPath } = await import("@/lib/db/pii-read");
    await readImportRawPath("import-uuid", "user-1", "worker download");

    expect(mockInsert).toHaveBeenCalled();
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "imports",
        fieldName: "raw_path",
        rowId: "import-uuid",
        reason: "worker download",
      })
    );
  });
});
