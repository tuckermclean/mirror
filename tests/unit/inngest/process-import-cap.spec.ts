/**
 * Unit tests for processImport error handling.
 *
 * Verifies that permanent errors (MonthlyCapError, ConfigurationError) return
 * a structured { error } result instead of propagating — propagation would
 * trigger Inngest's retry backoff for conditions that will never resolve.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted before any imports
// ---------------------------------------------------------------------------

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock("@/lib/db/pii-read", () => ({
  readImportRawPath: vi.fn().mockResolvedValue({ rawPath: "test-path/profile.pdf" }),
  writePii: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
}));

vi.mock("@/lib/storage/r2", () => ({
  fetchFromR2: vi.fn(),
}));

vi.mock("@/lib/voice/extract", () => ({
  extractVoiceCard: vi.fn().mockReturnValue({
    vocabulary: [],
    topics: [],
    writingStyle: "",
    communicationPatterns: [],
  }),
}));

vi.mock("@/lib/embeddings", () => ({
  embedVoiceProfile: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStep() {
  return {
    run: vi.fn().mockImplementation(
      async (_id: string, fn: () => Promise<unknown>) => fn()
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processImport — permanent error handling", () => {
  beforeEach(() => {
    vi.resetModules();

    // Default: DB select returns a valid import row on first call
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: "import-1", userId: "user-1", source: "linkedin_pdf" },
          ]),
        }),
      }),
    });

    // DB update: no-op for all steps
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  it("returns { error: permanent_failure } instead of throwing when MonthlyCapError is raised in fetch-and-parse", async () => {
    const { fetchFromR2 } = await import("@/lib/storage/r2");
    const { MonthlyCapError } = await import("@/lib/errors");
    const { processImport } = await import("@/inngest/functions/process-import");

    vi.mocked(fetchFromR2).mockRejectedValue(
      new MonthlyCapError("2026-07-01T00:00:00.000Z")
    );

    // Access the raw function via Inngest v4's internal .fn property
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processImport as any).fn as (ctx: {
      event: { data: { importId: string } };
      step: ReturnType<typeof makeMockStep>;
    }) => Promise<unknown>;

    const mockStep = makeMockStep();
    const result = await fn({
      event: { data: { importId: "import-1" } },
      step: mockStep,
    });

    expect(result).toMatchObject({ error: "permanent_failure" });
  });

  it("returns { error: permanent_failure } instead of throwing when ConfigurationError is raised in fetch-and-parse", async () => {
    const { fetchFromR2 } = await import("@/lib/storage/r2");
    const { ConfigurationError } = await import("@/lib/errors");
    const { processImport } = await import("@/inngest/functions/process-import");

    vi.mocked(fetchFromR2).mockRejectedValue(
      new ConfigurationError("R2 not configured")
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processImport as any).fn as (ctx: {
      event: { data: { importId: string } };
      step: ReturnType<typeof makeMockStep>;
    }) => Promise<unknown>;

    const mockStep = makeMockStep();
    const result = await fn({
      event: { data: { importId: "import-1" } },
      step: mockStep,
    });

    expect(result).toMatchObject({ error: "permanent_failure" });
  });
});
