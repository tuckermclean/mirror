/**
 * Unit tests for the mirror/import.process Inngest function.
 *
 * All external I/O (R2, DB, parsers) is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports so vi.mock hoisting works
// ---------------------------------------------------------------------------

const mockSend = vi.hoisted(() => vi.fn());
const mockGetObjectCommand = vi.hoisted(() => vi.fn());
const mockR2 = vi.hoisted(() => ({ send: mockSend }));

vi.mock("@/lib/r2", () => ({
  r2: mockR2,
  R2_BUCKET: "test-bucket",
}));

const mockReadImportRawPath = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/pii-read", () => ({
  readImportRawPath: mockReadImportRawPath,
  readPii: vi.fn(),
  readInterviewTranscript: vi.fn(),
}));

const mockParseAiHistory = vi.hoisted(() => vi.fn());
vi.mock("@/lib/parsers/index", () => ({
  parseAiHistory: mockParseAiHistory,
  detectSourceFromBytes: vi.fn(),
}));

const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbSet = vi.hoisted(() => vi.fn());
const mockDbWhere = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({
  db: {
    update: mockDbUpdate,
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  imports: {
    id: Symbol("imports.id"),
    status: Symbol("imports.status"),
    parsed: Symbol("imports.parsed"),
    userId: Symbol("imports.userId"),
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: mockGetObjectCommand,
  PutObjectCommand: vi.fn(),
  S3Client: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBodyStream(bytes: Uint8Array) {
  return {
    transformToByteArray: vi.fn().mockResolvedValue(bytes),
  };
}

// ---------------------------------------------------------------------------
// Import the module under test after mocks are set up
// ---------------------------------------------------------------------------
import { importProcess } from "@/inngest/import-process";
import { NonRetriableError } from "inngest";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("importProcess Inngest function", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default DB chaining for update().set().where()
    mockDbWhere.mockResolvedValue([]);
    mockDbSet.mockReturnValue({ where: mockDbWhere });
    mockDbUpdate.mockReturnValue({ set: mockDbSet });
  });

  it("is exported as 'importProcess'", () => {
    expect(importProcess).toBeDefined();
  });

  it("sets status=processing at the start, status=done on success", async () => {
    const importId = "import-uuid-1";
    const userId = "user-uuid-1";
    const rawPath = "imports/user-uuid-1/uuid/export.zip";
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const parsedResult = { source: "chatgpt", messages: [], totalConversations: 0 };

    mockReadImportRawPath.mockResolvedValue({ rawPath, userId });
    mockSend.mockResolvedValue({ Body: makeBodyStream(fakeBytes) });
    mockParseAiHistory.mockResolvedValue(parsedResult);

    // Execute the function handler directly
    const handler = (importProcess as unknown as { handler: (...args: unknown[]) => Promise<unknown> }).handler;
    await handler({ event: { data: { importId } }, step: makeStep() });

    // status=processing set first
    expect(mockDbSet).toHaveBeenCalledWith(expect.objectContaining({ status: "processing" }));
    // status=done set after success
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done", parsed: parsedResult })
    );
  });

  it("sets status=failed when an error is thrown", async () => {
    const importId = "import-uuid-2";

    mockReadImportRawPath.mockRejectedValue(new Error("DB read failed"));

    const handler = (importProcess as unknown as { handler: (...args: unknown[]) => Promise<unknown> }).handler;
    await expect(
      handler({ event: { data: { importId } }, step: makeStep() })
    ).rejects.toThrow();

    expect(mockDbSet).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("uses GetObjectCommand (not a public URL) to download from R2", async () => {
    const importId = "import-uuid-3";
    const rawPath = "imports/u/uuid/export.zip";
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const parsedResult = { source: "chatgpt", messages: [], totalConversations: 0 };

    mockReadImportRawPath.mockResolvedValue({ rawPath, userId: "u" });
    mockSend.mockResolvedValue({ Body: makeBodyStream(fakeBytes) });
    mockParseAiHistory.mockResolvedValue(parsedResult);

    const handler = (importProcess as unknown as { handler: (...args: unknown[]) => Promise<unknown> }).handler;
    await handler({ event: { data: { importId } }, step: makeStep() });

    expect(mockGetObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: rawPath, Bucket: "test-bucket" })
    );
    expect(mockSend).toHaveBeenCalled();
  });

  it("reads rawPath through readImportRawPath (pii-read)", async () => {
    const importId = "import-uuid-4";
    const rawPath = "imports/u/uuid/file.zip";
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

    mockReadImportRawPath.mockResolvedValue({ rawPath, userId: "u" });
    mockSend.mockResolvedValue({ Body: makeBodyStream(fakeBytes) });
    mockParseAiHistory.mockResolvedValue({ source: "chatgpt", messages: [], totalConversations: 0 });

    const handler = (importProcess as unknown as { handler: (...args: unknown[]) => Promise<unknown> }).handler;
    await handler({ event: { data: { importId } }, step: makeStep() });

    expect(mockReadImportRawPath).toHaveBeenCalledWith(
      importId,
      expect.any(String),
      expect.any(String)
    );
  });

  it("throws NonRetriableError when rawPath row is not found", async () => {
    mockReadImportRawPath.mockResolvedValue(undefined);

    const handler = (importProcess as unknown as { handler: (...args: unknown[]) => Promise<unknown> }).handler;
    await expect(
      handler({ event: { data: { importId: "missing" } }, step: makeStep() })
    ).rejects.toThrow(NonRetriableError);
  });

  it("wraps I/O operations in step.run for Inngest checkpointing", async () => {
    const importId = "import-uuid-5";
    const rawPath = "imports/u/uuid/export.zip";
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

    mockReadImportRawPath.mockResolvedValue({ rawPath, userId: "u" });
    mockSend.mockResolvedValue({ Body: makeBodyStream(fakeBytes) });
    mockParseAiHistory.mockResolvedValue({ source: "chatgpt", messages: [], totalConversations: 0 });

    const step = makeStep();
    const handler = (importProcess as unknown as { handler: (...args: unknown[]) => Promise<unknown> }).handler;
    await handler({ event: { data: { importId } }, step });

    expect(step.run).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Helper: stub Inngest step object
// ---------------------------------------------------------------------------
function makeStep() {
  return {
    run: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
    sleep: vi.fn(),
    sendEvent: vi.fn(),
    invoke: vi.fn(),
  };
}
