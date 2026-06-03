/**
 * Unit tests for POST /api/imports/upload — RED phase per TDD.
 *
 * All external I/O (DB, R2, Inngest, Clerk auth) is mocked.
 * No DATABASE_URL or R2 credentials required.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — must appear before any import of the route under test.
// ---------------------------------------------------------------------------
const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));

const mockDbSelectFrom = vi.hoisted(() => vi.fn());
const mockDbSelectWhere = vi.hoisted(() => vi.fn());
const mockDbSelectLimit = vi.hoisted(() => vi.fn());
const mockDbInsertValues = vi.hoisted(() => vi.fn());
const mockDbInsertReturning = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(() => ({ from: mockDbSelectFrom })),
    insert: vi.fn(() => ({ values: mockDbInsertValues })),
  },
}));
vi.mock("@/db/schema", () => ({
  users: { id: Symbol("users.id"), clerkId: Symbol("users.clerkId") },
  imports: {
    id: Symbol("imports.id"),
    userId: Symbol("imports.userId"),
    source: Symbol("imports.source"),
    rawPath: Symbol("imports.rawPath"),
    status: Symbol("imports.status"),
  },
}));

const mockR2Send = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/lib/r2", () => ({ r2: { send: mockR2Send }, R2_BUCKET: "test-bucket" }));

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: class {
    constructor(public opts: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public opts: unknown) {}
  },
}));

const mockInngestSend = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: mockInngestSend } }));

const mockDetectSource = vi.hoisted(() => vi.fn().mockReturnValue("chatgpt"));
vi.mock("@/lib/parsers/index", () => ({ detectSourceFromBytes: mockDetectSource }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(96).fill(0x00)]);

function makeZipFile(size = 100): File {
  const bytes = new Uint8Array(size);
  bytes[0] = 0x50;
  bytes[1] = 0x4b;
  bytes[2] = 0x03;
  bytes[3] = 0x04;
  return new File([bytes], "export.zip", { type: "application/zip" });
}

function makeTextFile(content = "hello world"): File {
  return new File([content], "notes.txt", { type: "text/plain" });
}

function makeRequest(formData?: FormData): NextRequest {
  const req = { formData: vi.fn().mockResolvedValue(formData ?? new FormData()) } as unknown as NextRequest;
  return req;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/imports/upload", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: authenticated
    mockAuth.mockResolvedValue({ userId: "clerk_user_1" });

    // Default: user found
    mockDbSelectLimit.mockResolvedValue([{ id: "internal-user-1" }]);
    mockDbSelectWhere.mockReturnValue({ limit: mockDbSelectLimit });
    mockDbSelectFrom.mockReturnValue({ where: mockDbSelectWhere });

    // Default: insert returns new row
    mockDbInsertReturning.mockResolvedValue([{ id: "import-uuid-1" }]);
    mockDbInsertValues.mockReturnValue({ returning: mockDbInsertReturning });

    vi.resetModules();
    const mod = await import("@/app/api/imports/upload/route");
    POST = mod.POST;
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const fd = new FormData();
    fd.append("file", makeZipFile());
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("unauthorized");
  });

  it("returns 404 when user is not found in DB", async () => {
    mockDbSelectLimit.mockResolvedValue([]);
    const fd = new FormData();
    fd.append("file", makeZipFile());
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("user_not_found");
  });

  it("returns 400 when no file field is present", async () => {
    const res = await POST(makeRequest(new FormData()));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("missing_file");
  });

  it("returns 413 when file exceeds 100 MB", async () => {
    const bigFile = Object.defineProperty(
      new File([new Uint8Array(4)], "big.zip", { type: "application/zip" }),
      "size",
      { value: 100 * 1024 * 1024 + 1 }
    );
    const fd = new FormData();
    fd.append("file", bigFile);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(413);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("file_too_large");
  });

  it("returns 415 when non-text file lacks ZIP magic bytes", async () => {
    const badFile = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], "bad.zip", {
      type: "application/zip",
    });
    const fd = new FormData();
    fd.append("file", badFile);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(415);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("invalid_file_type");
  });

  it("accepts a plain-text file without magic-byte check", async () => {
    const fd = new FormData();
    fd.append("file", makeTextFile());
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
  });

  it("returns 200 with importId on successful ZIP upload", async () => {
    const fd = new FormData();
    fd.append("file", makeZipFile());
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const body = await res.json() as { importId: string };
    expect(body.importId).toBe("import-uuid-1");
  });

  it("calls R2 PutObjectCommand — no public URL pattern", async () => {
    const fd = new FormData();
    fd.append("file", makeZipFile());
    await POST(makeRequest(fd));

    expect(mockR2Send).toHaveBeenCalledOnce();
    // The command sent must be a PutObjectCommand (not a raw URL fetch)
    const sentCommand = mockR2Send.mock.calls[0]![0] as { opts: { Bucket: string; Key: string } };
    expect(sentCommand.opts.Bucket).toBe("test-bucket");
    expect(sentCommand.opts.Key).toMatch(/^imports\/internal-user-1\//);
  });

  it("uses detectSourceFromBytes — not filename heuristics — to set source", async () => {
    mockDetectSource.mockReturnValue("claude");
    const fd = new FormData();
    fd.append("file", makeZipFile());
    await POST(makeRequest(fd));

    expect(mockDetectSource).toHaveBeenCalledOnce();
    const [bytes] = mockDetectSource.mock.calls[0] as [Uint8Array];
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it("inserts import row with status pending", async () => {
    const { db } = await import("@/db/client");
    const fd = new FormData();
    fd.append("file", makeZipFile());
    await POST(makeRequest(fd));

    expect(db.insert).toHaveBeenCalledOnce();
    expect(mockDbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" })
    );
  });

  it("enqueues mirror/import.process Inngest event with importId", async () => {
    const fd = new FormData();
    fd.append("file", makeZipFile());
    await POST(makeRequest(fd));

    expect(mockInngestSend).toHaveBeenCalledOnce();
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "mirror/import.process",
        data: expect.objectContaining({ importId: "import-uuid-1" }),
      })
    );
  });
});
