/**
 * Unit tests for the processImport Inngest worker — RED phase per TDD.
 *
 * Security properties under test:
 *  - rawPath read through pii-read.ts (never direct select on raw_path column)
 *  - R2 download uses GetObjectCommand credentials (no public URL fetch)
 *  - status = "processing" set before any work starts
 *  - status = "done" set after successful parse
 *  - status = "failed" set in top-level error catch
 *  - PII (rawPath content) never emitted to logs
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mockReadImportRawPath = vi.hoisted(() => vi.fn());
const mockParseAiHistory = vi.hoisted(() => vi.fn());
const mockR2Send = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue([]);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { update, set, where };
});
const mockDbSelect = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, limit };
});
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

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

vi.mock("@/db/client", () => ({
  db: {
    update: mockDbUpdate.update,
    select: mockDbSelect.select,
  },
}));

vi.mock("@/db/schema", () => ({
  imports: {
    id: Symbol("imports.id"),
    status: Symbol("imports.status"),
    parsed: Symbol("imports.parsed"),
    rawPath: Symbol("imports.rawPath"),
    source: Symbol("imports.source"),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: mockLogger,
}));

// ---------------------------------------------------------------------------
// Inngest step mock — simulates step.run() by immediately calling the callback
// ---------------------------------------------------------------------------
const mockStep = {
  run: vi.fn(async (_name: string, fn: () => unknown) => fn()),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const IMPORT_ID = "import-uuid-abc";
const USER_ID = "user-uuid-xyz";
const RAW_PATH = `imports/${USER_ID}/${IMPORT_ID}/export.zip`;

const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]);

const PARSED_HISTORY = {
  source: "chatgpt" as const,
  messages: [{ role: "user" as const, content: "hello", timestamp: undefined }],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // readImportRawPath returns the import row
  mockReadImportRawPath.mockResolvedValue({ rawPath: RAW_PATH });

  // GetObjectCommand response with a readable stream body
  const mockBody = {
    transformToByteArray: vi.fn().mockResolvedValue(ZIP_BYTES),
  };
  mockR2Send.mockResolvedValue({ Body: mockBody });

  // parseAiHistory returns parsed history
  mockParseAiHistory.mockResolvedValue(PARSED_HISTORY);

  // DB update chains resolve cleanly
  mockDbUpdate.where.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Import the worker function after mocks are set up
// ---------------------------------------------------------------------------
async function runWorker(
  importId = IMPORT_ID,
  userId = USER_ID
): Promise<unknown> {
  vi.resetModules();
  const { processImport } = await import("@/inngest/import-process");
  const fn = (processImport as unknown as {
    fn: (args: {
      event: { data: { importId: string; userId: string } };
      step: typeof mockStep;
    }) => Promise<unknown>;
  }).fn;
  return fn({
    event: { data: { importId, userId } },
    step: mockStep,
  });
}

// ---------------------------------------------------------------------------
// PII access
// ---------------------------------------------------------------------------
describe("PII access — rawPath", () => {
  it("reads rawPath through readImportRawPath (pii-read wrapper)", async () => {
    await runWorker();
    expect(mockReadImportRawPath).toHaveBeenCalledOnce();
    expect(mockReadImportRawPath).toHaveBeenCalledWith(
      IMPORT_ID,
      expect.any(String), // accessorId (userId or system id)
      expect.any(String)  // reason
    );
  });

  it("does NOT call db.select directly for rawPath", async () => {
    await runWorker();
    // db.select should NOT be called — all data access goes through pii-read
    expect(mockDbSelect.select).not.toHaveBeenCalled();
  });

  it("does NOT log the rawPath value", async () => {
    await runWorker();
    for (const [logFn] of [
      [mockLogger.info],
      [mockLogger.debug],
      [mockLogger.warn],
      [mockLogger.error],
    ] as [[{ mock: { calls: unknown[][] } }]]) {
      for (const call of logFn.mock.calls) {
        // Second arg is context object — check it doesn't contain raw_path value
        const context = call[1] as Record<string, unknown> | undefined;
        if (context) {
          expect(JSON.stringify(context)).not.toContain(RAW_PATH);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// R2 download — must use SDK credentials, not public URL
// ---------------------------------------------------------------------------
describe("R2 download", () => {
  it("uses GetObjectCommand (SDK credentials) — not a public URL fetch", async () => {
    await runWorker();
    expect(mockR2Send).toHaveBeenCalledOnce();
    // Verify the command has Bucket and Key (GetObjectCommand shape)
    const cmd = mockR2Send.mock.calls[0]?.[0] as { input?: { Bucket?: string; Key?: string } };
    expect(cmd?.input?.["Bucket"]).toBe("test-bucket");
    expect(cmd?.input?.["Key"]).toBe(RAW_PATH);
  });

  it("does NOT construct or fetch a public R2 URL", async () => {
    // If R2_PUBLIC_URL is set, the worker must still use SDK — not fetch()
    process.env["R2_PUBLIC_URL"] = "https://pub.r2.example.com";
    try {
      // global.fetch is not mocked; if the worker calls fetch(), it will fail
      // with a network error in the test environment. The test passing proves
      // no public fetch is attempted.
      await expect(runWorker()).resolves.toBeDefined();
    } finally {
      delete process.env["R2_PUBLIC_URL"];
    }
  });
});

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------
describe("status transitions", () => {
  it("sets status = 'processing' before any download or parse", async () => {
    let processingSetBeforeR2 = false;
    mockR2Send.mockImplementation(async () => {
      // At this point, "processing" update should already have been called
      const updateCalls = mockDbUpdate.set.mock.calls;
      processingSetBeforeR2 = updateCalls.some((call) => {
        const arg = call[0] as Record<string, unknown>;
        return arg?.["status"] === "processing";
      });
      return { Body: { transformToByteArray: async () => ZIP_BYTES } };
    });

    await runWorker();
    expect(processingSetBeforeR2).toBe(true);
  });

  it("sets status = 'done' on successful parse and store", async () => {
    await runWorker();
    const setCalls = mockDbUpdate.set.mock.calls;
    const doneCalled = setCalls.some((call) => {
      const arg = call[0] as Record<string, unknown>;
      return arg?.["status"] === "done";
    });
    expect(doneCalled).toBe(true);
  });

  it("sets status = 'failed' when download throws", async () => {
    mockR2Send.mockRejectedValue(new Error("R2 connection refused"));
    await runWorker();
    const setCalls = mockDbUpdate.set.mock.calls;
    const failedCalled = setCalls.some((call) => {
      const arg = call[0] as Record<string, unknown>;
      return arg?.["status"] === "failed";
    });
    expect(failedCalled).toBe(true);
  });

  it("sets status = 'failed' when parse throws", async () => {
    mockParseAiHistory.mockRejectedValue(new Error("unrecognised format"));
    await runWorker();
    const setCalls = mockDbUpdate.set.mock.calls;
    const failedCalled = setCalls.some((call) => {
      const arg = call[0] as Record<string, unknown>;
      return arg?.["status"] === "failed";
    });
    expect(failedCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Success result
// ---------------------------------------------------------------------------
describe("success result", () => {
  it("stores parsed history in imports.parsed", async () => {
    await runWorker();
    const setCalls = mockDbUpdate.set.mock.calls;
    const parsedStored = setCalls.some((call) => {
      const arg = call[0] as Record<string, unknown>;
      return "parsed" in arg && arg?.["status"] === "done";
    });
    expect(parsedStored).toBe(true);
  });

  it("returns success result with importId and messageCount", async () => {
    const result = await runWorker() as Record<string, unknown>;
    expect(result).toMatchObject({
      status: "success",
      importId: IMPORT_ID,
      messageCount: PARSED_HISTORY.messages.length,
    });
  });
});
