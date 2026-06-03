import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));

// Mock DB
const mockInsertReturn = vi.fn();
const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: mockInsertReturn }) });
const mockSelectReturn = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: mockSelectReturn }) }) });
vi.mock("@/db/client", () => ({ db: { insert: mockInsert, select: mockSelect } }));
vi.mock("@/db/schema", () => ({
  imports: {},
  users: {},
}));

// Mock R2
const mockSend = vi.fn();
vi.mock("@/lib/r2", () => ({
  r2: { send: mockSend },
  R2_BUCKET: "test-bucket",
}));
vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: vi.fn((params: unknown) => ({ command: "PutObject", params })),
}));

// Mock Inngest
const mockSendEvent = vi.fn();
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: mockSendEvent } }));

// Mock detectSourceFromBytes
const mockDetect = vi.fn();
vi.mock("@/lib/parsers/index", () => ({
  detectSourceFromBytes: mockDetect,
}));

function makeFormData(name: string, content: Uint8Array, type: string) {
  const blob = new Blob([content], { type });
  const formData = new FormData();
  formData.append("file", new File([blob], name, { type }));
  return formData;
}

function makeRequest(formData: FormData) {
  return new Request("http://localhost/api/imports/upload", {
    method: "POST",
    body: formData,
  });
}

const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03, 0x04]);
const NOT_ZIP = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);

describe("POST /api/imports/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockAuth.mockResolvedValue({ userId: "clerk-user-1" });
    mockSelectReturn.mockResolvedValue([{ id: "internal-user-1" }]);
    mockInsertReturn.mockResolvedValue([{ id: "import-uuid-1" }]);
    mockSend.mockResolvedValue({});
    mockSendEvent.mockResolvedValue({});
    mockDetect.mockReturnValue("chatgpt");
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { POST } = await import("@/app/api/imports/upload/route");
    const res = await POST(makeRequest(makeFormData("test.zip", ZIP_MAGIC, "application/zip")));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is attached", async () => {
    const { POST } = await import("@/app/api/imports/upload/route");
    const formData = new FormData();
    const res = await POST(makeRequest(formData));
    expect(res.status).toBe(400);
  });

  it("returns 413 when file exceeds 100 MB", async () => {
    const { POST } = await import("@/app/api/imports/upload/route");
    const bigContent = new Uint8Array(101 * 1024 * 1024);
    bigContent.set([0x50, 0x4b, 0x03, 0x04]);
    const formData = makeFormData("big.zip", bigContent, "application/zip");
    const res = await POST(makeRequest(formData));
    expect(res.status).toBe(413);
  });

  it("returns 415 for zip upload missing magic bytes", async () => {
    const { POST } = await import("@/app/api/imports/upload/route");
    const formData = makeFormData("fake.zip", NOT_ZIP, "application/zip");
    const res = await POST(makeRequest(formData));
    expect(res.status).toBe(415);
  });

  it("returns 415 for octet-stream without zip magic bytes", async () => {
    const { POST } = await import("@/app/api/imports/upload/route");
    const formData = makeFormData("fake.bin", NOT_ZIP, "application/octet-stream");
    const res = await POST(makeRequest(formData));
    expect(res.status).toBe(415);
  });

  it("accepts valid zip with correct magic bytes", async () => {
    const { POST } = await import("@/app/api/imports/upload/route");
    const formData = makeFormData("export.zip", ZIP_MAGIC, "application/zip");
    const res = await POST(makeRequest(formData));
    expect(res.status).toBe(200);
  });

  it("accepts text/plain files without magic-byte check", async () => {
    const { POST } = await import("@/app/api/imports/upload/route");
    const textContent = new TextEncoder().encode("hello world");
    const formData = makeFormData("export.txt", textContent, "text/plain");
    const res = await POST(makeRequest(formData));
    expect(res.status).toBe(200);
  });

  it("uses PutObjectCommand for R2 upload (not public URL)", async () => {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { POST } = await import("@/app/api/imports/upload/route");
    const formData = makeFormData("export.zip", ZIP_MAGIC, "application/zip");
    await POST(makeRequest(formData));
    expect(PutObjectCommand).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ command: "PutObject" }));
  });

  it("calls detectSourceFromBytes to determine source (not filename)", async () => {
    const { POST } = await import("@/app/api/imports/upload/route");
    const formData = makeFormData("claude-backup.zip", ZIP_MAGIC, "application/zip");
    await POST(makeRequest(formData));
    expect(mockDetect).toHaveBeenCalledWith(expect.any(Uint8Array));
  });

  it("enqueues mirror/import.process Inngest event with importId", async () => {
    const { POST } = await import("@/app/api/imports/upload/route");
    const formData = makeFormData("export.zip", ZIP_MAGIC, "application/zip");
    await POST(makeRequest(formData));
    expect(mockSendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "mirror/import.process",
        data: expect.objectContaining({ importId: expect.any(String) }),
      })
    );
  });

  it("returns { importId } immediately", async () => {
    const { POST } = await import("@/app/api/imports/upload/route");
    const formData = makeFormData("export.zip", ZIP_MAGIC, "application/zip");
    const res = await POST(makeRequest(formData));
    const body = await res.json() as { importId: string };
    expect(body.importId).toBe("import-uuid-1");
  });

  it("inserts import row with status = 'pending'", async () => {
    const { POST } = await import("@/app/api/imports/upload/route");
    const formData = makeFormData("export.zip", ZIP_MAGIC, "application/zip");
    await POST(makeRequest(formData));
    const valuesMock = mockInsert.mock.results[0]?.value.values;
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" })
    );
  });
});
