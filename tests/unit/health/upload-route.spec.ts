/**
 * Unit tests for POST /api/imports/upload.
 *
 * All external I/O (Clerk auth, R2, DB, Inngest, parsers) is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));

const mockR2Send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/r2", () => ({
  r2: { send: mockR2Send },
  R2_BUCKET: "test-bucket",
}));

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: vi.fn().mockImplementation((x) => x),
  GetObjectCommand: vi.fn(),
  S3Client: vi.fn(),
}));

const mockDetect = vi.hoisted(() => vi.fn().mockReturnValue("chatgpt"));
vi.mock("@/lib/parsers/index", () => ({
  detectSourceFromBytes: mockDetect,
  parseAiHistory: vi.fn(),
}));

const mockDbInsert = vi.hoisted(() => vi.fn());
const mockDbValues = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: "new-import-uuid" }])
);
const mockDbReturning = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({
  db: { insert: mockDbInsert, select: vi.fn(), update: vi.fn() },
}));
vi.mock("@/db/schema", () => ({
  imports: Symbol("imports"),
}));

const mockInngestSend = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockInngestSend },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers to build a FormData request
// ---------------------------------------------------------------------------

function zipBytes(magic = true): Uint8Array {
  const bytes = new Uint8Array(16);
  if (magic) {
    bytes[0] = 0x50;
    bytes[1] = 0x4b;
    bytes[2] = 0x03;
    bytes[3] = 0x04;
  }
  return bytes;
}

function makeFormRequest(
  bytes: Uint8Array,
  mimeType = "application/zip",
  filename = "export.zip"
): Request {
  const file = new File([bytes], filename, { type: mimeType });
  const formData = new FormData();
  formData.append("file", file);
  return new Request("http://localhost/api/imports/upload", {
    method: "POST",
    body: formData,
  });
}

// ---------------------------------------------------------------------------
// Import the route under test after all mocks are in place
// ---------------------------------------------------------------------------
import { POST } from "@/app/api/imports/upload/route";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/imports/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockR2Send.mockResolvedValue({});
    mockDbReturning.mockResolvedValue([{ id: "new-import-uuid" }]);
    mockDbValues.mockResolvedValue([{ id: "new-import-uuid" }]);
    mockDbInsert.mockReturnValue({
      values: mockDbValues.mockReturnValue({ returning: mockDbReturning }),
    });
    mockDetect.mockReturnValue("chatgpt");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const req = makeFormRequest(zipBytes());
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is attached", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-user-1" });
    const formData = new FormData();
    const req = new Request("http://localhost/api/imports/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 413 when file exceeds 100 MB", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-user-1" });
    // Fake a large file via a mock arrayBuffer
    const bigFile = new File(["x"], "big.zip", { type: "application/zip" });
    Object.defineProperty(bigFile, "size", { value: 101 * 1024 * 1024 });
    const formData = new FormData();
    formData.append("file", bigFile);
    const req = new Request("http://localhost/api/imports/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(413);
  });

  it("returns 415 when zip magic bytes are missing on a non-text file", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-user-1" });
    const fakeBytes = zipBytes(false); // no magic bytes
    const req = makeFormRequest(fakeBytes, "application/zip");
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(415);
  });

  it("accepts text/plain without magic-byte check", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-user-1" });
    const textBytes = new TextEncoder().encode("plain text data");
    const req = makeFormRequest(textBytes, "text/plain", "export.txt");
    const res = await POST(req as unknown as import("next/server").NextRequest);
    // Should not 415; may succeed or fail on DB mock shape, but not UnsupportedMediaType
    expect(res.status).not.toBe(415);
  });

  it("uploads to R2 via PutObjectCommand on success", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-user-1" });
    const req = makeFormRequest(zipBytes());
    await POST(req as unknown as import("next/server").NextRequest);
    expect(mockR2Send).toHaveBeenCalled();
  });

  it("inserts an imports row with status=pending and detected source", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-user-1" });
    mockDetect.mockReturnValue("chatgpt");
    const req = makeFormRequest(zipBytes());
    await POST(req as unknown as import("next/server").NextRequest);
    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockDbValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", source: "chatgpt" })
    );
  });

  it("enqueues mirror/import.process Inngest event", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-user-1" });
    const req = makeFormRequest(zipBytes());
    await POST(req as unknown as import("next/server").NextRequest);
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "mirror/import.process" })
    );
  });

  it("returns { importId } on success", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-user-1" });
    const req = makeFormRequest(zipBytes());
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { importId: string };
    expect(body.importId).toBeDefined();
  });
});
