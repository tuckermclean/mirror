import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AWS SDK
const mockSend = vi.fn();
vi.mock("@/lib/r2", () => ({
  r2: { send: mockSend },
  R2_BUCKET: "test-bucket",
}));

// Mock DB
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
vi.mock("@/db/client", () => ({
  db: {
    update: mockUpdate,
    select: mockSelect,
  },
}));

vi.mock("@/db/schema", () => ({
  imports: {
    id: "id",
    rawPath: "raw_path",
    userId: "user_id",
    status: "status",
    parsed: "parsed",
    source: "source",
  },
}));

// Mock pii-read
const mockReadImportRawPath = vi.fn();
vi.mock("@/lib/db/pii-read", () => ({
  readImportRawPath: mockReadImportRawPath,
}));

// Mock parser
const mockParseAiHistory = vi.fn();
vi.mock("@/lib/parsers/index", () => ({
  parseAiHistory: mockParseAiHistory,
}));

// Mock Inngest client (v4 API: 2-arg form — options includes triggers)
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((opts: unknown, handler: unknown) => ({ opts, handler })),
  },
}));

// Mock @aws-sdk/client-s3 GetObjectCommand
vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: vi.fn((params: unknown) => ({ command: "GetObject", params })),
}));

describe("importProcess Inngest function", () => {
  const WHERE_MOCK = vi.fn().mockResolvedValue([]);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: WHERE_MOCK,
      }),
    });
  });

  it("uses GetObjectCommand to download file from R2 (not public URL)", async () => {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");

    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const mockBody = {
      transformToByteArray: vi.fn().mockResolvedValue(fakeBytes),
    };
    mockSend.mockResolvedValue({ Body: mockBody });
    mockReadImportRawPath.mockResolvedValue({
      id: "import-1",
      rawPath: "imports/user-1/uuid/file.zip",
      userId: "user-1",
    });
    mockParseAiHistory.mockResolvedValue({ source: "chatgpt", messages: [], totalConversations: 1 });

    const updateSetMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    mockUpdate.mockReturnValue({ set: updateSetMock });

    const { runImportProcess } = await import("@/inngest/import-process");
    await runImportProcess({ importId: "import-1", userId: "user-1" });

    expect(GetObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: "imports/user-1/uuid/file.zip" })
    );
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ command: "GetObject" }));
  });

  it("sets status to 'processing' at the start", async () => {
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    mockSend.mockResolvedValue({ Body: { transformToByteArray: vi.fn().mockResolvedValue(fakeBytes) } });
    mockReadImportRawPath.mockResolvedValue({ id: "import-1", rawPath: "imports/u/u/f.zip", userId: "user-1" });
    mockParseAiHistory.mockResolvedValue({ source: "chatgpt", messages: [], totalConversations: 0 });

    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    mockUpdate.mockReturnValue({ set: setMock });

    const { runImportProcess } = await import("@/inngest/import-process");
    await runImportProcess({ importId: "import-1", userId: "user-1" });

    // First update call should set status = "processing"
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ status: "processing" }));
  });

  it("sets status to 'done' on successful parse", async () => {
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    mockSend.mockResolvedValue({ Body: { transformToByteArray: vi.fn().mockResolvedValue(fakeBytes) } });
    mockReadImportRawPath.mockResolvedValue({ id: "import-1", rawPath: "imports/u/u/f.zip", userId: "user-1" });
    mockParseAiHistory.mockResolvedValue({ source: "chatgpt", messages: [], totalConversations: 1 });

    const setCalls: Array<Record<string, unknown>> = [];
    const setMock = vi.fn((val: Record<string, unknown>) => {
      setCalls.push(val);
      return { where: vi.fn().mockResolvedValue([]) };
    });
    mockUpdate.mockReturnValue({ set: setMock });

    const { runImportProcess } = await import("@/inngest/import-process");
    await runImportProcess({ importId: "import-1", userId: "user-1" });

    const doneCall = setCalls.find((c) => c["status"] === "done");
    expect(doneCall).toBeDefined();
  });

  it("sets status to 'failed' when R2 download throws", async () => {
    mockSend.mockRejectedValue(new Error("R2 access denied"));
    mockReadImportRawPath.mockResolvedValue({ id: "import-1", rawPath: "imports/u/u/f.zip", userId: "user-1" });

    const setCalls: Array<Record<string, unknown>> = [];
    const setMock = vi.fn((val: Record<string, unknown>) => {
      setCalls.push(val);
      return { where: vi.fn().mockResolvedValue([]) };
    });
    mockUpdate.mockReturnValue({ set: setMock });

    const { runImportProcess } = await import("@/inngest/import-process");
    await expect(runImportProcess({ importId: "import-1", userId: "user-1" })).rejects.toThrow();

    const failedCall = setCalls.find((c) => c["status"] === "failed");
    expect(failedCall).toBeDefined();
  });

  it("reads rawPath through pii-read, not direct db.select", async () => {
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    mockSend.mockResolvedValue({ Body: { transformToByteArray: vi.fn().mockResolvedValue(fakeBytes) } });
    mockReadImportRawPath.mockResolvedValue({ id: "import-1", rawPath: "imports/u/u/f.zip", userId: "user-1" });
    mockParseAiHistory.mockResolvedValue({ source: "chatgpt", messages: [], totalConversations: 0 });

    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    mockUpdate.mockReturnValue({ set: setMock });

    const { runImportProcess } = await import("@/inngest/import-process");
    await runImportProcess({ importId: "import-1", userId: "user-1" });

    // pii-read was called — direct db.select was NOT
    expect(mockReadImportRawPath).toHaveBeenCalledWith("import-1", "user-1", expect.any(String));
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
