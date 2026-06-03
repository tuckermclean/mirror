/**
 * Unit tests for src/inngest/import-process.ts — RED phase per TDD.
 *
 * All external I/O is mocked. Tests verify status transitions, R2 download
 * via GetObjectCommand (no public URL), pii-read usage, and parse + store.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbSet = vi.hoisted(() => vi.fn());
const mockDbUpdateWhere = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockDbSelectFrom = vi.hoisted(() => vi.fn());
const mockDbSelectWhere = vi.hoisted(() => vi.fn());
const mockDbSelectLimit = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({
  db: {
    update: mockDbUpdate,
    select: vi.fn(() => ({ from: mockDbSelectFrom })),
  },
}));

vi.mock("@/db/schema", () => ({
  imports: {
    id: Symbol("imports.id"),
    userId: Symbol("imports.userId"),
    source: Symbol("imports.source"),
    status: Symbol("imports.status"),
    parsed: Symbol("imports.parsed"),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => `eq(${String(val)})`),
}));

const mockR2Send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/r2", () => ({ r2: { send: mockR2Send }, R2_BUCKET: "test-bucket" }));

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: class {
    constructor(public opts: unknown) {}
  },
  PutObjectCommand: class {
    constructor(public opts: unknown) {}
  },
}));

const mockReadImportRawPath = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/pii-read", () => ({ readImportRawPath: mockReadImportRawPath }));

const mockParseAiHistory = vi.hoisted(() => vi.fn());
vi.mock("@/lib/parsers/index", () => ({ parseAiHistory: mockParseAiHistory }));

const capturedHandlers = vi.hoisted(() => new Map<string, Function>());
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((_opts: unknown, _trigger: unknown, handler: Function) => {
      capturedHandlers.set("import.process", handler);
      return { id: "mirror/import.process" };
    }),
  },
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const FAKE_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

function makeBody(bytes: Uint8Array) {
  return {
    transformToByteArray: vi.fn().mockResolvedValue(bytes),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("importProcess Inngest function", () => {
  let handler: (ctx: { event: { data: { importId: string } } }) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Setup update chain: db.update(t).set(s).where(w)
    mockDbUpdateWhere.mockResolvedValue([]);
    mockDbSet.mockReturnValue({ where: mockDbUpdateWhere });
    mockDbUpdate.mockReturnValue({ set: mockDbSet });

    // Setup select chain
    mockDbSelectLimit.mockResolvedValue([{ id: "import-1", userId: "user-1" }]);
    mockDbSelectWhere.mockReturnValue({ limit: mockDbSelectLimit });
    mockDbSelectFrom.mockReturnValue({ where: mockDbSelectWhere });

    // Default: rawPath found
    mockReadImportRawPath.mockResolvedValue({ rawPath: "imports/user-1/uuid/export.zip" });

    // Default: R2 download succeeds
    mockR2Send.mockResolvedValue({ Body: makeBody(FAKE_BYTES) });

    // Default: parse succeeds
    mockParseAiHistory.mockResolvedValue({
      source: "chatgpt",
      messages: [],
      totalConversations: 0,
    });

    await import("@/inngest/import-process");
    const h = capturedHandlers.get("import.process");
    if (!h) throw new Error("handler not registered");
    handler = h as typeof handler;
  });

  it("registers a function with id mirror/import.process", async () => {
    const { inngest } = await import("@/lib/inngest/client");
    expect(inngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mirror/import.process" }),
      expect.objectContaining({ event: "mirror/import.process" }),
      expect.any(Function)
    );
  });

  it("sets status to processing at the start", async () => {
    await handler({ event: { data: { importId: "import-1" } } });

    const firstSet = mockDbSet.mock.calls[0]![0] as { status: string };
    expect(firstSet.status).toBe("processing");
  });

  it("reads rawPath through readImportRawPath — not direct DB access", async () => {
    await handler({ event: { data: { importId: "import-1" } } });

    expect(mockReadImportRawPath).toHaveBeenCalledOnce();
    expect(mockReadImportRawPath).toHaveBeenCalledWith(
      "import-1",
      "user-1",
      expect.any(String)
    );
  });

  it("downloads file from R2 using GetObjectCommand — no public URL", async () => {
    await handler({ event: { data: { importId: "import-1" } } });

    expect(mockR2Send).toHaveBeenCalledOnce();
    const cmd = mockR2Send.mock.calls[0]![0] as { opts: { Bucket: string; Key: string } };
    expect(cmd.opts.Bucket).toBe("test-bucket");
    expect(cmd.opts.Key).toBe("imports/user-1/uuid/export.zip");
  });

  it("passes downloaded bytes to parseAiHistory", async () => {
    await handler({ event: { data: { importId: "import-1" } } });

    expect(mockParseAiHistory).toHaveBeenCalledOnce();
    const [bytes] = mockParseAiHistory.mock.calls[0] as [Uint8Array];
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it("sets status to done and stores parsed result on success", async () => {
    const parsed = { source: "chatgpt", messages: [{ role: "user", content: "hi" }], totalConversations: 1 };
    mockParseAiHistory.mockResolvedValue(parsed);

    await handler({ event: { data: { importId: "import-1" } } });

    // Find the set() call that has status "done"
    const doneCalls = mockDbSet.mock.calls.filter(
      (c) => (c[0] as { status?: string }).status === "done"
    );
    expect(doneCalls.length).toBeGreaterThanOrEqual(1);
    const doneArgs = doneCalls[0]![0] as { status: string; parsed: unknown };
    expect(doneArgs.parsed).toEqual(parsed);
  });

  it("sets status to failed in top-level catch when parseAiHistory throws", async () => {
    mockParseAiHistory.mockRejectedValue(new Error("parse failed"));

    await expect(
      handler({ event: { data: { importId: "import-1" } } })
    ).rejects.toThrow("parse failed");

    const failedCalls = mockDbSet.mock.calls.filter(
      (c) => (c[0] as { status?: string }).status === "failed"
    );
    expect(failedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("sets status to failed when R2 download fails", async () => {
    mockR2Send.mockRejectedValue(new Error("R2 error"));

    await expect(
      handler({ event: { data: { importId: "import-1" } } })
    ).rejects.toThrow("R2 error");

    const failedCalls = mockDbSet.mock.calls.filter(
      (c) => (c[0] as { status?: string }).status === "failed"
    );
    expect(failedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("sets status to failed when import is not found", async () => {
    mockDbSelectLimit.mockResolvedValue([]);

    await expect(
      handler({ event: { data: { importId: "missing-id" } } })
    ).rejects.toThrow();

    const failedCalls = mockDbSet.mock.calls.filter(
      (c) => (c[0] as { status?: string }).status === "failed"
    );
    expect(failedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("sets status to failed when rawPath is null", async () => {
    mockReadImportRawPath.mockResolvedValue({ rawPath: null });

    await expect(
      handler({ event: { data: { importId: "import-1" } } })
    ).rejects.toThrow();

    const failedCalls = mockDbSet.mock.calls.filter(
      (c) => (c[0] as { status?: string }).status === "failed"
    );
    expect(failedCalls.length).toBeGreaterThanOrEqual(1);
  });
});
