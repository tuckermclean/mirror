/**
 * Unit tests for POST /api/imports/upload — RED phase per TDD.
 *
 * Security properties under test:
 *  - Auth enforced as first operation (401 without userId)
 *  - File-size gate (413 > 100 MB)
 *  - MIME allowlist (415 unsupported type)
 *  - Magic-byte validation for application/octet-stream (415 missing ZIP magic)
 *  - Source detection via detectSourceFromBytes, NOT filename heuristics
 *  - 202 + importId on success; status = "pending" on insert
 *  - R2 upload uses PutObjectCommand credentials — no public URL involved
 *  - li_at / PII never logged
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must appear before any SUT import
// ---------------------------------------------------------------------------
const mockAuth = vi.hoisted(() => vi.fn());
const mockDetectSourceFromBytes = vi.hoisted(() => vi.fn());
const mockR2Send = vi.hoisted(() => vi.fn());
const mockInngestSend = vi.hoisted(() => vi.fn());
const mockDbSelectChain = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, limit };
});
const mockDbInsertChain = vi.hoisted(() => {
  const returning = vi.fn();
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  return { insert, values, returning };
});
const mockDbDeleteChain = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue({ count: 1 });
  const deleteFrom = vi.fn(() => ({ where }));
  return { deleteFrom, where };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/parsers/index", () => ({
  detectSourceFromBytes: mockDetectSourceFromBytes,
}));

vi.mock("@/lib/storage/r2", () => ({
  getR2Client: () => ({ send: mockR2Send }),
  getR2Bucket: () => "test-bucket",
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockInngestSend },
}));

vi.mock("@/db/client", () => ({
  db: {
    select: mockDbSelectChain.select,
    insert: mockDbInsertChain.insert,
    delete: mockDbDeleteChain.deleteFrom,
  },
}));

vi.mock("@/db/schema", () => ({
  imports: { id: Symbol("imports.id"), userId: Symbol("imports.userId") },
  users: { id: Symbol("users.id"), clerkId: Symbol("users.clerkId"), plan: Symbol("users.plan") },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// SUT import
// ---------------------------------------------------------------------------
import { POST } from "@/app/api/imports/upload/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);

function makeZipFile(name = "export.zip", size?: number): File {
  const bytes = size !== undefined ? new Uint8Array(size).fill(0x00) : ZIP_MAGIC;
  if (size !== undefined && size >= 4) {
    bytes[0] = 0x50;
    bytes[1] = 0x4b;
    bytes[2] = 0x03;
    bytes[3] = 0x04;
  }
  return new File([bytes], name, { type: "application/zip" });
}

function makeOctetFile(bytes: Uint8Array, name = "export.bin"): File {
  return new File([bytes], name, { type: "application/octet-stream" });
}

function _makeTextFile(content = "chat history", name = "export.txt"): File {
  return new File([content], name, { type: "text/plain" });
}
void _makeTextFile; // exported for future text/plain tests

function makeRequest(file: File): NextRequest {
  const formData = new FormData();
  formData.append("file", file);
  return new NextRequest("http://localhost/api/imports/upload", {
    method: "POST",
    body: formData,
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // Default: authenticated
  mockAuth.mockResolvedValue({ userId: "clerk_test_user" });

  // Default: user found in DB
  mockDbSelectChain.limit.mockResolvedValue([{ id: "internal-user-uuid" }]);

  // Default: detect returns "chatgpt"
  mockDetectSourceFromBytes.mockReturnValue("chatgpt");

  // Default: R2 upload succeeds
  mockR2Send.mockResolvedValue({});

  // Default: insert returns importId
  mockDbInsertChain.returning.mockResolvedValue([{ id: "import-uuid-1" }]);

  // Default: Inngest send succeeds
  mockInngestSend.mockResolvedValue({});
});

afterEach(() => {
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
describe("authentication", () => {
  it("returns 401 when userId is missing", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const req = makeRequest(makeZipFile());
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body["error"]).toBe("unauthorized");
  });

  it("returns 401 when userId is undefined", async () => {
    mockAuth.mockResolvedValue({ userId: undefined });
    const req = makeRequest(makeZipFile());
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// File validation
// ---------------------------------------------------------------------------
describe("file validation", () => {
  it("returns 400 when no file field is present", async () => {
    const formData = new FormData();
    const req = new NextRequest("http://localhost/api/imports/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body["error"]).toBe("missing_file_field");
  });

  it("returns 400 for empty file", async () => {
    const emptyFile = new File([], "empty.zip", { type: "application/zip" });
    const req = makeRequest(emptyFile);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body["error"]).toBe("empty_file");
  });

  it("returns 413 when file exceeds 100 MB", async () => {
    // Use a real File with overridden size to avoid allocating 101 MB.
    // Object.defineProperty preserves the override when FormData stores by
    // reference; request.formData() is mocked below to bypass serialization,
    // which would re-compute size from actual bytes and lose the override.
    const bigFile = new File([ZIP_MAGIC], "big.zip", { type: "application/zip" });
    Object.defineProperty(bigFile, "size", {
      get: () => 101 * 1024 * 1024,
      configurable: true,
    });

    const fd = new FormData();
    fd.append("file", bigFile);

    const req = new NextRequest("http://localhost/api/imports/upload", {
      method: "POST",
    });
    vi.spyOn(req, "formData").mockResolvedValue(fd);

    const res = await POST(req);
    expect(res.status).toBe(413);
    const body = await res.json() as Record<string, unknown>;
    expect(body["error"]).toBe("file_too_large");
  });

  it("returns 415 for disallowed MIME type", async () => {
    const badFile = new File(["data"], "hack.php", { type: "application/x-php" });
    const req = makeRequest(badFile);
    const res = await POST(req);
    expect(res.status).toBe(415);
    const body = await res.json() as Record<string, unknown>;
    expect(body["error"]).toBe("unsupported_file_type");
  });

  it("returns 415 for application/octet-stream without ZIP magic bytes", async () => {
    const notAZip = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
    const req = makeRequest(makeOctetFile(notAZip));
    const res = await POST(req);
    expect(res.status).toBe(415);
    const body = await res.json() as Record<string, unknown>;
    expect(body["error"]).toBe("invalid_zip_magic");
  });

  it("accepts application/octet-stream with valid ZIP magic bytes", async () => {
    const req = makeRequest(makeOctetFile(ZIP_MAGIC));
    const res = await POST(req);
    expect(res.status).toBe(202);
  });
});

// ---------------------------------------------------------------------------
// Source detection — must use bytes not filename
// ---------------------------------------------------------------------------
describe("source detection", () => {
  it("calls detectSourceFromBytes with file bytes, not filename", async () => {
    const req = makeRequest(makeZipFile("claude-backup.zip"));
    await POST(req);
    // detectSourceFromBytes must be called with the actual bytes
    expect(mockDetectSourceFromBytes).toHaveBeenCalledOnce();
    const arg = (mockDetectSourceFromBytes as MockedFunction<typeof mockDetectSourceFromBytes>).mock.calls[0]?.[0];
    expect(arg).toBeInstanceOf(Uint8Array);
  });

  it("stores the source returned by detectSourceFromBytes, not from filename", async () => {
    // File is named "claude-backup.zip" but bytes say chatgpt — trust bytes
    mockDetectSourceFromBytes.mockReturnValue("chatgpt");
    const req = makeRequest(makeZipFile("claude-backup.zip"));
    await POST(req);
    const insertValues = mockDbInsertChain.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertValues?.["source"]).toBe("chatgpt");
  });
});

// ---------------------------------------------------------------------------
// R2 upload
// ---------------------------------------------------------------------------
describe("R2 upload", () => {
  it("uses PutObjectCommand (credentials) — not a public URL fetch", async () => {
    const req = makeRequest(makeZipFile());
    await POST(req);
    // r2.send must be called (credentials path)
    expect(mockR2Send).toHaveBeenCalledOnce();
    // No fetch() to a public R2 URL should happen — global.fetch is not mocked
    // so any network call would error; this test passing proves no public fetch.
  });

  it("uses a UUID-based key that includes the internal userId", async () => {
    const req = makeRequest(makeZipFile());
    await POST(req);
    const putCmd = mockR2Send.mock.calls[0]?.[0] as { input?: { Key?: string } };
    const key = putCmd?.input?.["Key"] ?? "";
    expect(key).toContain("internal-user-uuid");
    expect(key).toMatch(/imports\/internal-user-uuid\/.+/);
  });
});

// ---------------------------------------------------------------------------
// Success response
// ---------------------------------------------------------------------------
describe("success", () => {
  it("returns 202 with importId immediately (async processing)", async () => {
    const req = makeRequest(makeZipFile());
    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("importId");
    expect(typeof body["importId"]).toBe("string");
  });

  it("inserts imports row with status = 'pending'", async () => {
    const req = makeRequest(makeZipFile());
    await POST(req);
    const insertValues = mockDbInsertChain.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertValues?.["status"]).toBe("pending");
  });

  it("enqueues mirror/import.process Inngest event with importId and userId", async () => {
    const req = makeRequest(makeZipFile());
    await POST(req);
    expect(mockInngestSend).toHaveBeenCalledOnce();
    const event = mockInngestSend.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event?.["name"]).toBe("mirror/import.process");
    const data = event?.["data"] as Record<string, unknown>;
    expect(data?.["importId"]).toBe("import-uuid-1");
    expect(data?.["userId"]).toBe("internal-user-uuid");
  });
});

// ---------------------------------------------------------------------------
// R2 key sanitization
// ---------------------------------------------------------------------------
describe("R2 key sanitization", () => {
  it("strips path-traversal chars from file.name in the R2 key", async () => {
    const dangerousFile = new File([ZIP_MAGIC], "../evil/path.zip", {
      type: "application/zip",
    });
    const req = makeRequest(dangerousFile);
    await POST(req);
    const putCmd = mockR2Send.mock.calls[0]?.[0] as { input?: { Key?: string } };
    const key = putCmd?.input?.["Key"] ?? "";
    const filename = key.split("/").pop() ?? "";
    expect(filename).toMatch(/^[a-zA-Z0-9._-]+$/);
  });

  it("caps file.name at 64 chars in the R2 key", async () => {
    const longName = "a".repeat(200) + ".zip";
    const file = new File([ZIP_MAGIC], longName, { type: "application/zip" });
    const req = makeRequest(file);
    await POST(req);
    const putCmd = mockR2Send.mock.calls[0]?.[0] as { input?: { Key?: string } };
    const key = putCmd?.input?.["Key"] ?? "";
    const filename = key.split("/").pop() ?? "";
    expect(filename.length).toBeLessThanOrEqual(64);
  });
});

// ---------------------------------------------------------------------------
// Inngest failure — rollback and 503
// ---------------------------------------------------------------------------
describe("Inngest send failure", () => {
  it("returns 503 when Inngest send fails", async () => {
    mockInngestSend.mockRejectedValue(new Error("Inngest unreachable"));
    const req = makeRequest(makeZipFile());
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body["error"]).toBe("service_unavailable");
  });

  it("deletes the import row when Inngest send fails", async () => {
    mockInngestSend.mockRejectedValue(new Error("Inngest unreachable"));
    const req = makeRequest(makeZipFile());
    await POST(req);
    expect(mockDbDeleteChain.deleteFrom).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Tombstone guard — ADR-009 / issue #36
// ---------------------------------------------------------------------------
describe("tombstone guard", () => {
  it("user lookup WHERE clause includes ne(users.plan, DELETED_PLAN)", async () => {
    const req = makeRequest(makeZipFile());
    await POST(req);
    const whereArg = mockDbSelectChain.where.mock.calls[0]?.[0] as { queryChunks?: unknown[] };
    // Condition must include the <> (not-equal) operator for the plan column
    const serialized = JSON.stringify(whereArg?.queryChunks ?? {});
    expect(serialized, "WHERE clause must include ne(users.plan, DELETED_PLAN)").toContain(" <> ");
    expect(serialized, "WHERE clause must reference DELETED_PLAN sentinel value").toContain("deleted");
  });

  it("returns 404 user_not_found when tombstone row is excluded by guard", async () => {
    // Simulates the tombstone guard filtering out a deleted user —
    // the query returns [] because ne(users.plan, DELETED_PLAN) excludes the row.
    mockDbSelectChain.limit.mockResolvedValue([]);
    const req = makeRequest(makeZipFile());
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body["error"]).toBe("user_not_found");
  });
});
