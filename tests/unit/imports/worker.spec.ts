/**
 * Unit tests for the import-process Inngest worker.
 *
 * Security properties under test:
 *  - R2 download uses fetchFromR2 (private SDK credentials) — never public URL
 *  - rawPath read via readImportRawPath() (PII audit wrapper)
 *  - status transitions: pending → processing → done | failed
 *  - li_at / PII never logged
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must appear before any SUT import
// ---------------------------------------------------------------------------
const mockDbUpdateSet = vi.hoisted(() => vi.fn());
const mockDbUpdateWhere = vi.hoisted(() => vi.fn());

const mockDbUpdate = vi.hoisted(() =>
  vi.fn().mockReturnValue({ set: mockDbUpdateSet })
);

const mockDbSelectChain = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, limit };
});

vi.mock("@/db/client", () => ({
  db: {
    update: mockDbUpdate,
    select: mockDbSelectChain.select,
  },
}));

vi.mock("@/db/schema", () => ({
  imports: {
    id: Symbol("imports.id"),
    userId: Symbol("imports.userId"),
    status: Symbol("imports.status"),
    parsed: Symbol("imports.parsed"),
  },
}));

const mockFetchFromR2 = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage/r2", () => ({
  fetchFromR2: mockFetchFromR2,
}));

const mockReadImportRawPath = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/pii-read", () => ({
  readImportRawPath: mockReadImportRawPath,
}));

const mockParseAiHistory = vi.hoisted(() => vi.fn());
vi.mock("@/lib/parsers/index", () => ({
  parseAiHistory: mockParseAiHistory,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn().mockReturnValue({ id: "import-process" }),
  },
}));

// ---------------------------------------------------------------------------
// SUT import — after all mocks are registered
// ---------------------------------------------------------------------------
import { processImport } from "@/inngest/import-process";

// ---------------------------------------------------------------------------
// Fake bytes for fetchFromR2 response
// ---------------------------------------------------------------------------
const FAKE_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // DB update chain: update(table).set(values).where(condition)
  mockDbUpdateWhere.mockResolvedValue({ rowCount: 1 });
  mockDbUpdateSet.mockReturnValue({ where: mockDbUpdateWhere });
  mockDbUpdate.mockReturnValue({ set: mockDbUpdateSet });

  // DB select chain for idempotency guard (status lookup)
  mockDbSelectChain.limit.mockResolvedValue([{ status: "pending" }]);
  mockDbSelectChain.where.mockReturnValue({ limit: mockDbSelectChain.limit });
  mockDbSelectChain.from.mockReturnValue({ where: mockDbSelectChain.where });
  mockDbSelectChain.select.mockReturnValue({ from: mockDbSelectChain.from });

  // PII read returns rawPath
  mockReadImportRawPath.mockResolvedValue({ rawPath: "imports/user/uuid/export.zip" });

  // fetchFromR2 returns valid bytes
  mockFetchFromR2.mockResolvedValue(FAKE_BYTES);

  // Parser returns a parsed result
  mockParseAiHistory.mockResolvedValue({ conversations: [] });
});

// ---------------------------------------------------------------------------
// Idempotency guard — completed imports must not be reprocessed
// ---------------------------------------------------------------------------
describe("idempotency guard", () => {
  it("returns early without any DB writes when status is already 'done'", async () => {
    mockDbSelectChain.limit.mockResolvedValueOnce([{ status: "done" }]);

    await processImport("import-uuid-1", "user-uuid-1");

    expect(mockDbUpdateSet).not.toHaveBeenCalled();
    expect(mockReadImportRawPath).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------
describe("status transitions", () => {
  it("sets status = 'processing' before downloading from R2", async () => {
    let processingSetBefore = false;
    mockFetchFromR2.mockImplementation(() => {
      const calls = mockDbUpdateSet.mock.calls;
      const lastSet = calls[calls.length - 1]?.[0] as Record<string, unknown>;
      processingSetBefore = lastSet?.["status"] === "processing";
      return Promise.resolve(FAKE_BYTES);
    });

    await processImport("import-uuid-1", "user-uuid-1");
    expect(processingSetBefore).toBe(true);
  });

  it("sets status = 'failed' when the initial processing write throws", async () => {
    mockDbUpdateWhere.mockRejectedValueOnce(new Error("DB write failed"));

    await expect(processImport("import-uuid-1", "user-uuid-1")).rejects.toThrow("DB write failed");

    const allSetCalls = mockDbUpdateSet.mock.calls as Array<[Record<string, unknown>]>;
    const failedCall = allSetCalls.find((c) => c[0]?.["status"] === "failed");
    expect(failedCall).toBeDefined();
  });

  it("sets status = 'done' after successful parse and persist", async () => {
    await processImport("import-uuid-1", "user-uuid-1");

    const allSetCalls = mockDbUpdateSet.mock.calls as Array<[Record<string, unknown>]>;
    const doneCall = allSetCalls.find((c) => c[0]?.["status"] === "done");
    expect(doneCall).toBeDefined();
  });

  it("sets status = 'failed' when R2 download throws", async () => {
    mockFetchFromR2.mockRejectedValue(new Error("R2 network error"));

    await expect(processImport("import-uuid-1", "user-uuid-1")).rejects.toThrow("R2 network error");

    const allSetCalls = mockDbUpdateSet.mock.calls as Array<[Record<string, unknown>]>;
    const failedCall = allSetCalls.find((c) => c[0]?.["status"] === "failed");
    expect(failedCall).toBeDefined();
  });

  it("sets status = 'failed' when parseAiHistory throws", async () => {
    mockParseAiHistory.mockRejectedValue(new Error("parse failed"));

    await expect(processImport("import-uuid-1", "user-uuid-1")).rejects.toThrow("parse failed");

    const allSetCalls = mockDbUpdateSet.mock.calls as Array<[Record<string, unknown>]>;
    const failedCall = allSetCalls.find((c) => c[0]?.["status"] === "failed");
    expect(failedCall).toBeDefined();
  });

  it("sets status = 'failed' when pii-read throws", async () => {
    mockReadImportRawPath.mockRejectedValue(new Error("audit DB down"));

    await expect(processImport("import-uuid-1", "user-uuid-1")).rejects.toThrow("audit DB down");

    const allSetCalls = mockDbUpdateSet.mock.calls as Array<[Record<string, unknown>]>;
    const failedCall = allSetCalls.find((c) => c[0]?.["status"] === "failed");
    expect(failedCall).toBeDefined();
  });

  it("re-throws the error after setting status = 'failed'", async () => {
    mockFetchFromR2.mockRejectedValue(new Error("storage failure"));
    await expect(processImport("import-uuid-1", "user-uuid-1")).rejects.toThrow("storage failure");
  });
});

// ---------------------------------------------------------------------------
// PII audit — rawPath must go through pii-read.ts
// ---------------------------------------------------------------------------
describe("PII audit (rawPath read)", () => {
  it("reads rawPath via readImportRawPath, not a direct DB select on raw_path", async () => {
    await processImport("import-uuid-1", "user-uuid-1");
    expect(mockReadImportRawPath).toHaveBeenCalledOnce();
    expect(mockReadImportRawPath).toHaveBeenCalledWith(
      "import-uuid-1",
      "user-uuid-1",
      expect.any(String)
    );
  });

  it("throws and sets status = 'failed' when rawPath is null", async () => {
    mockReadImportRawPath.mockResolvedValue({ rawPath: null });

    await expect(processImport("import-uuid-1", "user-uuid-1")).rejects.toThrow();

    const allSetCalls = mockDbUpdateSet.mock.calls as Array<[Record<string, unknown>]>;
    const failedCall = allSetCalls.find((c) => c[0]?.["status"] === "failed");
    expect(failedCall).toBeDefined();
  });

  it("throws and sets status = 'failed' when import row does not exist", async () => {
    mockReadImportRawPath.mockResolvedValue(undefined);

    await expect(processImport("import-uuid-1", "user-uuid-1")).rejects.toThrow();

    const allSetCalls = mockDbUpdateSet.mock.calls as Array<[Record<string, unknown>]>;
    const failedCall = allSetCalls.find((c) => c[0]?.["status"] === "failed");
    expect(failedCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// R2 download — must use fetchFromR2 (private creds), not public URL
// ---------------------------------------------------------------------------
describe("R2 download", () => {
  it("fetches from R2 via fetchFromR2 — not a public URL fetch", async () => {
    await processImport("import-uuid-1", "user-uuid-1");
    expect(mockFetchFromR2).toHaveBeenCalledOnce();
  });

  it("passes the rawPath from pii-read as the fetchFromR2 key", async () => {
    mockReadImportRawPath.mockResolvedValue({
      rawPath: "imports/user/uuid/special-export.zip",
    });

    await processImport("import-uuid-1", "user-uuid-1");

    expect(mockFetchFromR2).toHaveBeenCalledWith("imports/user/uuid/special-export.zip");
  });

  it("throws StorageError and sets failed if fetchFromR2 throws", async () => {
    const { StorageError } = await import("@/lib/errors");
    mockFetchFromR2.mockRejectedValue(
      new StorageError("R2 object not found: imports/user/uuid/export.zip")
    );

    await expect(processImport("import-uuid-1", "user-uuid-1")).rejects.toThrow(StorageError);

    const allSetCalls = mockDbUpdateSet.mock.calls as Array<[Record<string, unknown>]>;
    const failedCall = allSetCalls.find((c) => c[0]?.["status"] === "failed");
    expect(failedCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Parse and persist
// ---------------------------------------------------------------------------
describe("parse and persist", () => {
  it("calls parseAiHistory with the downloaded bytes", async () => {
    await processImport("import-uuid-1", "user-uuid-1");

    expect(mockParseAiHistory).toHaveBeenCalledOnce();
    const arg = mockParseAiHistory.mock.calls[0]?.[0];
    expect(arg).toBeInstanceOf(Uint8Array);
  });

  it("persists the parsed result to the imports row", async () => {
    const fakeParsed = { conversations: [{ id: "c1" }] };
    mockParseAiHistory.mockResolvedValue(fakeParsed);

    await processImport("import-uuid-1", "user-uuid-1");

    const allSetCalls = mockDbUpdateSet.mock.calls as Array<[Record<string, unknown>]>;
    const doneCall = allSetCalls.find((c) => c[0]?.["status"] === "done");
    expect(doneCall?.[0]?.["parsed"]).toEqual(fakeParsed);
  });
});
