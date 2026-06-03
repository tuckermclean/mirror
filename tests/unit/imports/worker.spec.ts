/**
 * Unit tests for src/inngest/import-process.ts
 *
 * Security properties under test:
 *  - status = "processing" set as first DB write
 *  - rawPath read exclusively via readImportRawPath (PII audit wrapper)
 *  - R2 download uses GetObjectCommand (private credentials — no R2_PUBLIC_URL)
 *  - status = "done" on success; status = "failed" on any error; error re-thrown
 *  - No file bytes or PII values written to structured logs
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { ValidationError, StorageError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Hoisted mocks — must appear before any SUT import
// ---------------------------------------------------------------------------
const mockReadImportRawPath = vi.hoisted(() => vi.fn());
const mockParseAiHistory = vi.hoisted(() => vi.fn());
const mockR2Send = vi.hoisted(() => vi.fn());
const mockGetObjectCommand = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());

// Drizzle update builder: db.update(table).set(values).where(cond)
const mockDbUpdateChain = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { update, set, where };
});

// Drizzle select builder: db.select(cols).from(table).where(cond).limit(n)
const mockDbSelectChain = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, limit };
});

// Inngest createFunction capture — records (config, trigger, handler) for inspection
const mockCreateFunction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/pii-read", () => ({
  readImportRawPath: mockReadImportRawPath,
}));

vi.mock("@/lib/parsers/index", () => ({
  parseAiHistory: mockParseAiHistory,
}));

vi.mock("@/lib/r2", () => ({
  r2: { send: mockR2Send },
  R2_BUCKET: "test-bucket",
}));

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: mockGetObjectCommand,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

vi.mock("@/db/client", () => ({
  db: {
    update: mockDbUpdateChain.update,
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

vi.mock("@/lib/inngest/client", () => ({
  inngest: { createFunction: mockCreateFunction },
}));

// ---------------------------------------------------------------------------
// SUT import — after mocks so vi.mock() hoisting takes effect
// ---------------------------------------------------------------------------
import { processImport } from "@/inngest/import-process";

// ---------------------------------------------------------------------------
// Constants and helpers
// ---------------------------------------------------------------------------
const IMPORT_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_ID   = "bbbbbbbb-0000-0000-0000-000000000002";
const RAW_PATH  = "imports/bbbbbbbb-0000/cccccccc-1111/export.zip";

const PARSED_RESULT = {
  source: "chatgpt" as const,
  messages: [],
  totalConversations: 0,
};

function makeBody(bytes: Uint8Array = new Uint8Array([0x50, 0x4b, 0x03, 0x04])) {
  return { transformToByteArray: vi.fn().mockResolvedValue(bytes) };
}

// ---------------------------------------------------------------------------
// Setup: reset mock state before each test.
// vi.resetModules() is intentionally placed here rather than inside a helper
// function — the salvage branch had it inside runWorker() which was fragile
// (module caches were cleared mid-test, causing intermittent failures).
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // Fluent update chain resolves by default
  mockDbUpdateChain.where.mockResolvedValue(undefined);
  mockDbUpdateChain.set.mockReturnValue({ where: mockDbUpdateChain.where });
  mockDbUpdateChain.update.mockReturnValue({ set: mockDbUpdateChain.set });

  // Fluent select chain returns userId row by default
  mockDbSelectChain.limit.mockResolvedValue([{ userId: USER_ID }]);
  mockDbSelectChain.where.mockReturnValue({ limit: mockDbSelectChain.limit });
  mockDbSelectChain.from.mockReturnValue({ where: mockDbSelectChain.where });
  mockDbSelectChain.select.mockReturnValue({ from: mockDbSelectChain.from });

  // Default happy-path dependencies
  mockReadImportRawPath.mockResolvedValue({ rawPath: RAW_PATH });
  mockR2Send.mockResolvedValue({ Body: makeBody() });
  mockParseAiHistory.mockResolvedValue(PARSED_RESULT);
});

afterEach(() => {
  delete process.env["R2_PUBLIC_URL"];
});

// ---------------------------------------------------------------------------
// Inngest function registration
// ---------------------------------------------------------------------------
describe("importProcess (Inngest registration)", () => {
  // beforeAll runs once before any test in this describe, and crucially BEFORE
  // the outer beforeEach (which calls vi.clearAllMocks()). This lets us snapshot
  // the createFunction call recorded at module-load time.
  //
  // Inngest v4 API: createFunction(options, handler) — triggers live inside options.
  let regConfig:
    | {
        id: string;
        triggers?: Array<{ event: string; name?: string }>;
        concurrency?: { key: string; limit: number };
      }
    | undefined;
  let regHandler:
    | ((ctx: { event: { data: { importId: string } } }) => Promise<void>)
    | undefined;

  beforeAll(() => {
    const args = mockCreateFunction.mock.calls[0] as
      | [
          { id: string; triggers?: Array<{ event: string }> },
          (ctx: { event: { data: { importId: string } } }) => Promise<void>,
        ]
      | undefined;
    regConfig = args?.[0];
    regHandler = args?.[1];
  });

  it("calls inngest.createFunction once at module load", () => {
    expect(regConfig).toBeDefined();
  });

  it("registers with id 'import-process'", () => {
    expect(regConfig?.id).toBe("import-process");
  });

  it("registers on 'mirror/import.process' event trigger", () => {
    // Inngest v4 places triggers inside the options object (not as a separate arg)
    const eventTrigger = regConfig?.triggers?.find((t) => t.event !== undefined);
    expect(eventTrigger?.event).toBe("mirror/import.process");
  });

  it("handler invokes processImport with importId from event.data", async () => {
    expect(regHandler).toBeDefined();
    await regHandler!({ event: { data: { importId: IMPORT_ID } } });
    // processImport ran: DB update with "processing" was called
    expect(mockDbUpdateChain.update).toHaveBeenCalled();
  });

  it("configures concurrency limit keyed on importId to prevent duplicate processing (S3)", () => {
    expect(regConfig?.concurrency).toMatchObject({
      key: "event.data.importId",
      limit: 1,
    });
  });

  it("registers trigger as typed EventType (has .name property — not a plain string trigger) (S4)", () => {
    // An Inngest v4 EventType object carries both .event and .name on the instance.
    // A plain { event: "..." } trigger object only has .event, not .name.
    const trigger = regConfig?.triggers?.[0];
    expect(trigger).toHaveProperty("name", "mirror/import.process");
  });
});

// ---------------------------------------------------------------------------
// processImport — status transitions
// ---------------------------------------------------------------------------
describe("processImport — status transitions", () => {
  it("sets status = 'processing' before any other async work", async () => {
    let processingSetBeforePiiRead = false;
    mockReadImportRawPath.mockImplementation(() => {
      processingSetBeforePiiRead = (
        mockDbUpdateChain.set.mock.calls as Array<[Record<string, string>]>
      ).some((call) => call[0]?.status === "processing");
      return Promise.resolve({ rawPath: RAW_PATH });
    });

    await processImport(IMPORT_ID);
    expect(processingSetBeforePiiRead).toBe(true);
  });

  it("sets status = 'done' with parsed data on the success path", async () => {
    await processImport(IMPORT_ID);

    const setCalls = mockDbUpdateChain.set.mock.calls as Array<[Record<string, unknown>]>;
    const doneCall = setCalls.find((c) => c[0]?.status === "done");
    expect(doneCall).toBeDefined();
    expect(doneCall![0].parsed).toEqual(PARSED_RESULT);
  });

  it("never sets status = 'done' when readImportRawPath throws", async () => {
    mockReadImportRawPath.mockRejectedValue(new Error("pii-read failure"));
    await expect(processImport(IMPORT_ID)).rejects.toThrow("pii-read failure");

    const setCalls = mockDbUpdateChain.set.mock.calls as Array<[Record<string, unknown>]>;
    expect(setCalls.some((c) => c[0]?.status === "done")).toBe(false);
  });

  it("sets status = 'failed' when readImportRawPath throws", async () => {
    mockReadImportRawPath.mockRejectedValue(new Error("pii-read failure"));
    await expect(processImport(IMPORT_ID)).rejects.toThrow("pii-read failure");

    const setCalls = mockDbUpdateChain.set.mock.calls as Array<[Record<string, unknown>]>;
    expect(setCalls.some((c) => c[0]?.status === "failed")).toBe(true);
  });

  it("sets status = 'failed' when R2 download throws", async () => {
    mockR2Send.mockRejectedValue(new Error("R2 connection error"));
    await expect(processImport(IMPORT_ID)).rejects.toThrow("R2 connection error");

    const setCalls = mockDbUpdateChain.set.mock.calls as Array<[Record<string, unknown>]>;
    expect(setCalls.some((c) => c[0]?.status === "failed")).toBe(true);
  });

  it("sets status = 'failed' when parseAiHistory throws", async () => {
    mockParseAiHistory.mockRejectedValue(new Error("parse failed"));
    await expect(processImport(IMPORT_ID)).rejects.toThrow("parse failed");

    const setCalls = mockDbUpdateChain.set.mock.calls as Array<[Record<string, unknown>]>;
    expect(setCalls.some((c) => c[0]?.status === "failed")).toBe(true);
  });

  it("re-throws the original error so Inngest can observe the failure", async () => {
    const original = new Error("original-error-12345");
    mockParseAiHistory.mockRejectedValue(original);
    await expect(processImport(IMPORT_ID)).rejects.toBe(original);
  });

  it("re-throws the root-cause error even when the status=failed DB update in the catch block also throws", async () => {
    const originalError = new Error("root-cause-parse-failure");
    mockParseAiHistory.mockRejectedValue(originalError);
    // status=processing succeeds; status=failed in catch block throws a secondary error
    mockDbUpdateChain.where
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("db-connection-lost"));
    await expect(processImport(IMPORT_ID)).rejects.toBe(originalError);
  });

  it("sets status = 'failed' when the import row is not found", async () => {
    mockDbSelectChain.limit.mockResolvedValue([]);
    await expect(processImport(IMPORT_ID)).rejects.toThrow();

    const setCalls = mockDbUpdateChain.set.mock.calls as Array<[Record<string, unknown>]>;
    expect(setCalls.some((c) => c[0]?.status === "failed")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// processImport — typed error classes (AGENTS.md: never throw naked Error)
// ---------------------------------------------------------------------------
describe("processImport — typed error classes", () => {
  it("throws ValidationError (not naked Error) when the import row is not found", async () => {
    mockDbSelectChain.limit.mockResolvedValue([]);
    await expect(processImport(IMPORT_ID)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError (not naked Error) when rawPath is null", async () => {
    mockReadImportRawPath.mockResolvedValue({ rawPath: null });
    await expect(processImport(IMPORT_ID)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError (not naked Error) when rawPath is undefined", async () => {
    mockReadImportRawPath.mockResolvedValue(undefined);
    await expect(processImport(IMPORT_ID)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws StorageError (not naked Error) when R2 Body is undefined", async () => {
    mockR2Send.mockResolvedValue({ Body: undefined });
    await expect(processImport(IMPORT_ID)).rejects.toBeInstanceOf(StorageError);
  });

  it("throws StorageError (not naked Error) when R2 Body is null", async () => {
    mockR2Send.mockResolvedValue({ Body: null });
    await expect(processImport(IMPORT_ID)).rejects.toBeInstanceOf(StorageError);
  });
});

// ---------------------------------------------------------------------------
// processImport — PII-safe rawPath access
// ---------------------------------------------------------------------------
describe("processImport — PII-safe rawPath access", () => {
  it("calls readImportRawPath (not a direct db.select on raw_path)", async () => {
    await processImport(IMPORT_ID);
    expect(mockReadImportRawPath).toHaveBeenCalledOnce();
  });

  it("passes importId as first argument to readImportRawPath", async () => {
    await processImport(IMPORT_ID);
    const [firstArg] = mockReadImportRawPath.mock.calls[0] as [string];
    expect(firstArg).toBe(IMPORT_ID);
  });

  it("uses the import's own userId (fetched from DB) as the PII accessorId", async () => {
    await processImport(IMPORT_ID);
    const [, accessorId] = mockReadImportRawPath.mock.calls[0] as [string, string];
    expect(accessorId).toBe(USER_ID);
  });

  it("passes a non-empty reason string", async () => {
    await processImport(IMPORT_ID);
    const [, , reason] = mockReadImportRawPath.mock.calls[0] as [string, string, string];
    expect(typeof reason).toBe("string");
    expect(reason.trim().length).toBeGreaterThan(0);
  });

  it("throws (and sets failed) when rawPath is null", async () => {
    mockReadImportRawPath.mockResolvedValue({ rawPath: null });
    await expect(processImport(IMPORT_ID)).rejects.toThrow();

    const setCalls = mockDbUpdateChain.set.mock.calls as Array<[Record<string, unknown>]>;
    expect(setCalls.some((c) => c[0]?.status === "failed")).toBe(true);
  });

  it("throws (and sets failed) when readImportRawPath returns undefined", async () => {
    mockReadImportRawPath.mockResolvedValue(undefined);
    await expect(processImport(IMPORT_ID)).rejects.toThrow();

    const setCalls = mockDbUpdateChain.set.mock.calls as Array<[Record<string, unknown>]>;
    expect(setCalls.some((c) => c[0]?.status === "failed")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// processImport — R2 download (no public URL)
// ---------------------------------------------------------------------------
describe("processImport — R2 download", () => {
  it("uses GetObjectCommand to download — not a public URL fetch", async () => {
    await processImport(IMPORT_ID);
    expect(mockGetObjectCommand).toHaveBeenCalledOnce();
    expect(mockR2Send).toHaveBeenCalledOnce();
  });

  it("passes R2_BUCKET as the Bucket parameter", async () => {
    await processImport(IMPORT_ID);
    const [input] = mockGetObjectCommand.mock.calls[0] as [{ Bucket: string; Key: string }];
    expect(input.Bucket).toBe("test-bucket");
  });

  it("passes the rawPath from the PII helper as the Key parameter", async () => {
    await processImport(IMPORT_ID);
    const [input] = mockGetObjectCommand.mock.calls[0] as [{ Bucket: string; Key: string }];
    expect(input.Key).toBe(RAW_PATH);
  });

  it("does NOT read R2_PUBLIC_URL — only private SDK credentials are used", async () => {
    // Any attempt to fetch a public URL would call global fetch, which is not mocked
    // and would throw, causing this test to fail. Passing confirms private-only path.
    process.env["R2_PUBLIC_URL"] = "https://pub.r2.example.com";
    await expect(processImport(IMPORT_ID)).resolves.toBeUndefined();
  });

  it("calls transformToByteArray() on the R2 Body stream", async () => {
    const body = makeBody();
    mockR2Send.mockResolvedValue({ Body: body });
    await processImport(IMPORT_ID);
    expect(body.transformToByteArray).toHaveBeenCalledOnce();
  });

  it("throws (and sets failed) when Body is undefined", async () => {
    mockR2Send.mockResolvedValue({ Body: undefined });
    await expect(processImport(IMPORT_ID)).rejects.toThrow();

    const setCalls = mockDbUpdateChain.set.mock.calls as Array<[Record<string, unknown>]>;
    expect(setCalls.some((c) => c[0]?.status === "failed")).toBe(true);
  });

  it("throws (and sets failed) when Body is null", async () => {
    mockR2Send.mockResolvedValue({ Body: null });
    await expect(processImport(IMPORT_ID)).rejects.toThrow();

    const setCalls = mockDbUpdateChain.set.mock.calls as Array<[Record<string, unknown>]>;
    expect(setCalls.some((c) => c[0]?.status === "failed")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// processImport — parsing
// ---------------------------------------------------------------------------
describe("processImport — parsing", () => {
  it("calls parseAiHistory with a Uint8Array of the downloaded bytes", async () => {
    await processImport(IMPORT_ID);
    expect(mockParseAiHistory).toHaveBeenCalledOnce();
    const [arg] = mockParseAiHistory.mock.calls[0] as [unknown];
    expect(arg).toBeInstanceOf(Uint8Array);
  });

  it("passes the exact bytes returned by transformToByteArray to parseAiHistory", async () => {
    const specificBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    mockR2Send.mockResolvedValue({ Body: makeBody(specificBytes) });
    await processImport(IMPORT_ID);
    const [arg] = mockParseAiHistory.mock.calls[0] as [Uint8Array];
    expect(arg).toEqual(specificBytes);
  });

  it("persists exactly the ParsedChatHistory returned by parseAiHistory", async () => {
    await processImport(IMPORT_ID);
    const setCalls = mockDbUpdateChain.set.mock.calls as Array<[Record<string, unknown>]>;
    const doneCall = setCalls.find((c) => c[0]?.status === "done");
    expect(doneCall![0].parsed).toBe(PARSED_RESULT);
  });
});

// ---------------------------------------------------------------------------
// processImport — structured logging
// ---------------------------------------------------------------------------
describe("processImport — structured logging", () => {
  it("logs 'import.process.done' with importId on success", async () => {
    await processImport(IMPORT_ID);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "import.process.done",
      expect.objectContaining({ importId: IMPORT_ID }),
    );
  });

  it("logs 'import.process.failed' with importId on error", async () => {
    mockParseAiHistory.mockRejectedValue(new Error("boom"));
    await expect(processImport(IMPORT_ID)).rejects.toThrow();
    expect(mockLoggerError).toHaveBeenCalledWith(
      "import.process.failed",
      expect.objectContaining({ importId: IMPORT_ID }),
    );
  });

  it("does not log raw bytes or file contents", async () => {
    await processImport(IMPORT_ID);
    const allCalls = [
      ...mockLoggerInfo.mock.calls,
      ...mockLoggerWarn.mock.calls,
      ...mockLoggerError.mock.calls,
    ];
    for (const [, meta] of allCalls as Array<[string, unknown]>) {
      if (meta && typeof meta === "object") {
        const serialised = JSON.stringify(meta);
        // Must not contain byte-array markers or blob content
        expect(serialised).not.toMatch(/Uint8Array|bytes|transformToByteArray/i);
      }
    }
  });
});
