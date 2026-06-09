/**
 * Unit tests for src/inngest/generation.ts
 *
 * Verifies that buildUserMessage (exposed via the Anthropic stream call) includes
 * transcript as a first-class, clearly-labelled section — not smuggled inside
 * voiceSamples — and that voiceSamples no longer contains the transcript text.
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

vi.mock("@/db/schema", () => ({
  generations: {},
  imports: {},
  interviews: {},
  users: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  isNotNull: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
}));

const mockReadLinkedinSnapshot = vi.hoisted(() => vi.fn());
const mockReadInterviewTranscript = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/pii-read", () => ({
  readLinkedinSnapshot: mockReadLinkedinSnapshot,
  readInterviewTranscript: mockReadInterviewTranscript,
}));

const mockCheckMonthlyCap = vi.hoisted(() => vi.fn());
const mockRecordLlmSpend = vi.hoisted(() => vi.fn());
const mockComputeCostUsd = vi.hoisted(() => vi.fn());

vi.mock("@/lib/llm/cost-guard", () => ({
  checkMonthlyCap: mockCheckMonthlyCap,
  recordLlmSpend: mockRecordLlmSpend,
  computeCostUsd: mockComputeCostUsd,
}));

vi.mock("@/lib/prompts", () => ({
  prompts: {
    profileGeneration: { content: "GENERATION_SYSTEM: You are a LinkedIn profile rewriter." },
    rationale: { content: "RATIONALE_SYSTEM: explain why." },
    recruiterEye: { content: "RECRUITER_EYE_SYSTEM: 7-second skim." },
  },
}));

// RAG retrieval — default to an empty corpus (Wk4 populates benchmark_profiles).
const mockRetrieveSimilarProfiles = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rag/retrieval", () => ({
  retrieveSimilarProfiles: mockRetrieveSimilarProfiles,
}));

vi.mock("@/lib/errors", () => ({
  MonthlyCapError: class MonthlyCapError extends Error {
    constructor(public resets_at: string) {
      super("monthly cap reached");
    }
  },
  GenerationSchemaError: class GenerationSchemaError extends Error {
    constructor(message: string) {
      super(`generation output failed schema validation: ${message}`);
      this.name = "GenerationSchemaError";
    }
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockInngestSend = vi.hoisted(() => vi.fn());
const mockCreateFunction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: mockCreateFunction,
    send: mockInngestSend,
  },
}));

// Mock NonRetriableError from 'inngest' so we can assert on it without a
// real Inngest runtime. We make it a distinct named class so instanceof checks
// and name checks work reliably.
class MockNonRetriableError extends Error {
  cause: unknown;
  constructor(message: string, opts?: { cause?: unknown }) {
    super(message);
    this.name = "NonRetriableError";
    this.cause = opts?.cause;
  }
}

vi.mock("inngest", () => ({
  NonRetriableError: MockNonRetriableError,
}));

// Capture the messages and system prompts passed to each Anthropic stream call.
const capturedMessages: Array<{ role: string; content: string }[]> = [];
const capturedSystems: string[] = [];

// Valid canonical payloads so the new schema-validation step passes.
const VALID_PROFILE = JSON.stringify({
  headline: "Platform Engineer · Making infra invisible",
  about: "I keep the lights on so product teams never think about infra.",
  experience: [
    { company: "Acme Corp", title: "Senior SRE", bullets: ["Cut MTTR 40%"] },
  ],
  education: [{ school: "State University", degree: "BS Computer Science" }],
  skills: ["Kubernetes", "Observability"],
});

const VALID_RATIONALE = JSON.stringify({
  headline: "Leads with a concrete outcome a recruiter scans for first.",
  about: "Opens with a concrete value statement in the person's voice.",
  experience: ["Quantifies impact instead of listing responsibilities."],
  skills: "Front-loads the in-demand platform skills recruiters filter on.",
  recruiterEye: [
    { rank: 1, observation: "'Cut MTTR 40%' is the first number that lands.", section: "experience" },
  ],
  confidence: { headline: 90, about: 80, experience: 75, skills: 60 },
});

// Per-test override of the generation-call output (e.g. to force a schema error).
let generationOutputOverride: string | null = null;

function textFor(system: string): string {
  if (system.includes("RATIONALE_SYSTEM") || system.includes("RECRUITER_EYE_SYSTEM")) {
    return VALID_RATIONALE;
  }
  return generationOutputOverride ?? VALID_PROFILE;
}

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        stream: vi.fn().mockImplementation(
          (params: { system: string; messages: Array<{ role: string; content: string }> }) => {
            capturedMessages.push(params.messages);
            capturedSystems.push(params.system);
            return {
              finalMessage: vi.fn().mockResolvedValue({
                content: [{ type: "text", text: textFor(params.system) }],
                usage: { input_tokens: 100, output_tokens: 50 },
              }),
            };
          }
        ),
      };
    },
  };
});

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

describe("generation — buildUserMessage", () => {
  beforeEach(() => {
    vi.resetModules();
    capturedMessages.length = 0;
    capturedSystems.length = 0;
    generationOutputOverride = null;

    // Default: empty benchmark corpus (Wk4 populates it).
    mockRetrieveSimilarProfiles.mockResolvedValue([]);

    // Default: snapshot row
    mockReadLinkedinSnapshot.mockResolvedValue({
      rawHtml: "<html>My LinkedIn profile</html>",
      parsed: null,
    });

    // Default: interview transcript
    mockReadInterviewTranscript.mockResolvedValue({
      transcript: [{ role: "user", content: "I worked at Acme Corp for 5 years." }],
    });

    // Default: DB select for interview id + voice embeddings
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "interview-1" }]),
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    // Default: DB update
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    // Default: cap allowed
    mockCheckMonthlyCap.mockResolvedValue({ allowed: true });

    // Default: record spend no-op
    mockRecordLlmSpend.mockResolvedValue(undefined);
    mockComputeCostUsd.mockReturnValue(0.001);

    // Default: inngest.send no-op
    mockInngestSend.mockResolvedValue(undefined);

    // Capture the Inngest function registered by createFunction
    mockCreateFunction.mockImplementation(
      (_config: unknown, fn: (...args: unknown[]) => Promise<unknown>) => ({
        fn,
        // Expose the raw handler for direct invocation in tests
        __rawFn: fn,
      })
    );
  });

  it("includes transcript text as a clearly-labelled section in the user message", async () => {
    const mod = await import("@/inngest/generation");

    // Access the raw Inngest handler via the fn that createFunction received.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (mod.runGeneration as any).__rawFn as (ctx: {
      event: { data: { userId: string; snapshotId: string; generationId: string } };
      step: ReturnType<typeof makeMockStep>;
    }) => Promise<unknown>;

    const mockStep = makeMockStep();
    await fn({
      event: { data: { userId: "user-1", snapshotId: "snap-1", generationId: "gen-1" } },
      step: mockStep,
    });

    expect(capturedMessages.length).toBeGreaterThan(0);
    const userContent = capturedMessages[0]?.[0]?.content ?? "";

    // The transcript must appear as an explicitly-labelled, fenced section.
    expect(userContent).toContain("=== INTERVIEW TRANSCRIPT ===");
    expect(userContent).toContain("Acme Corp");
  });

  it("does NOT embed the transcript inside the voice-samples section", async () => {
    const mod = await import("@/inngest/generation");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (mod.runGeneration as any).__rawFn as (ctx: {
      event: { data: { userId: string; snapshotId: string; generationId: string } };
      step: ReturnType<typeof makeMockStep>;
    }) => Promise<unknown>;

    const mockStep = makeMockStep();
    await fn({
      event: { data: { userId: "user-1", snapshotId: "snap-1", generationId: "gen-1" } },
      step: mockStep,
    });

    const userContent = capturedMessages[0]?.[0]?.content ?? "";

    // Voice samples section must only contain the vector count metadata,
    // not the raw transcript text.
    const voiceSamplesMatch = userContent.match(/=== VOICE SAMPLES ===(.*)/s);
    expect(voiceSamplesMatch).not.toBeNull();
    const voiceSamplesSection = voiceSamplesMatch![1] ?? "";
    expect(voiceSamplesSection).not.toContain("Acme Corp");
  });

  it("includes the snapshot content in the user message", async () => {
    const mod = await import("@/inngest/generation");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (mod.runGeneration as any).__rawFn as (ctx: {
      event: { data: { userId: string; snapshotId: string; generationId: string } };
      step: ReturnType<typeof makeMockStep>;
    }) => Promise<unknown>;

    const mockStep = makeMockStep();
    await fn({
      event: { data: { userId: "user-1", snapshotId: "snap-1", generationId: "gen-1" } },
      step: mockStep,
    });

    const userContent = capturedMessages[0]?.[0]?.content ?? "";
    expect(userContent).toContain("=== PROFILE ===");
    expect(userContent).toContain("My LinkedIn profile");
  });

  it("separates sections with an unambiguous delimiter line", async () => {
    const mod = await import("@/inngest/generation");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (mod.runGeneration as any).__rawFn as (ctx: {
      event: { data: { userId: string; snapshotId: string; generationId: string } };
      step: ReturnType<typeof makeMockStep>;
    }) => Promise<unknown>;

    const mockStep = makeMockStep();
    await fn({
      event: { data: { userId: "user-1", snapshotId: "snap-1", generationId: "gen-1" } },
      step: mockStep,
    });

    const userContent = capturedMessages[0]?.[0]?.content ?? "";
    // A blank line is ambiguous (content can contain blank lines). Each section
    // boundary must be a fenced delimiter the model cannot confuse with data.
    const delimiter = "=== ";
    // One delimiter per section header: Profile, Interview transcript,
    // Voice samples, Benchmark exemplars.
    const count = userContent.split(delimiter).length - 1;
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it("throws NonRetriableError (not plain MonthlyCapError) when monthly cap is exhausted", async () => {
    // Arrange: cap is exhausted
    mockCheckMonthlyCap.mockResolvedValue({
      allowed: false,
      resets_at: "2026-07-01T00:00:00.000Z",
    });

    const mod = await import("@/inngest/generation");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (mod.runGeneration as any).__rawFn as (ctx: {
      event: { data: { userId: string; snapshotId: string; generationId: string } };
      step: ReturnType<typeof makeMockStep>;
    }) => Promise<unknown>;

    const mockStep = makeMockStep();

    // Act + Assert: must throw NonRetriableError so Inngest stops retrying
    await expect(
      fn({
        event: { data: { userId: "user-1", snapshotId: "snap-1", generationId: "gen-1" } },
        step: mockStep,
      })
    ).rejects.toMatchObject({
      name: "NonRetriableError",
      message: expect.stringContaining("2026-07-01"),
    });
  });

  it("wraps the MonthlyCapError as the cause of the NonRetriableError", async () => {
    mockCheckMonthlyCap.mockResolvedValue({
      allowed: false,
      resets_at: "2026-07-01T00:00:00.000Z",
    });

    const mod = await import("@/inngest/generation");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (mod.runGeneration as any).__rawFn as (ctx: {
      event: { data: { userId: string; snapshotId: string; generationId: string } };
      step: ReturnType<typeof makeMockStep>;
    }) => Promise<unknown>;

    const mockStep = makeMockStep();

    const err = await fn({
      event: { data: { userId: "user-1", snapshotId: "snap-1", generationId: "gen-1" } },
      step: mockStep,
    }).catch((e: unknown) => e);

    expect(err).toMatchObject({ name: "NonRetriableError" });
    // The original MonthlyCapError must be attached as the cause
    expect((err as { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((err as { cause?: Error }).cause as Error).message).toContain("monthly cap");
  });
});

// ---------------------------------------------------------------------------
// Output validation + rationale bundle + spend
// ---------------------------------------------------------------------------

type RawFn = (ctx: {
  event: { data: { userId: string; snapshotId: string; generationId: string } };
  step: ReturnType<typeof makeMockStep>;
}) => Promise<unknown>;

async function loadRawFn(): Promise<RawFn> {
  const mod = await import("@/inngest/generation");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod.runGeneration as any).__rawFn as RawFn;
}

function defaultEvent() {
  return { data: { userId: "user-1", snapshotId: "snap-1", generationId: "gen-1" } };
}

describe("generation — output validation, rationale bundle, spend", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    capturedMessages.length = 0;
    capturedSystems.length = 0;
    generationOutputOverride = null;

    mockRetrieveSimilarProfiles.mockResolvedValue([]);
    mockReadLinkedinSnapshot.mockResolvedValue({
      rawHtml: "<html>My LinkedIn profile</html>",
      parsed: null,
    });
    mockReadInterviewTranscript.mockResolvedValue({
      transcript: [{ role: "user", content: "I worked at Acme Corp." }],
    });
    // Provide an active voice vector so the RAG query path runs.
    const activeVec = new Array(1024).fill(0.1) as number[];
    // A flexible chainable that resolves to `rows` at any terminal method.
    const chain = (rows: unknown[]): Record<string, unknown> => {
      const node: Record<string, unknown> = {};
      const ret = () => node;
      node["where"] = vi.fn(ret);
      node["innerJoin"] = vi.fn(ret);
      node["orderBy"] = vi.fn(ret);
      node["limit"] = vi.fn().mockResolvedValue(rows);
      return node;
    };
    // interview-id lookup resolves first; voice/active-vector lookups return the vec.
    mockDbSelect
      .mockReturnValueOnce({ from: vi.fn(() => chain([{ id: "interview-1" }])) })
      .mockReturnValue({ from: vi.fn(() => chain([{ voiceEmbedding: activeVec }])) });

    // DB update — capture the .set() payload so we can assert on output/rationale.
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });

    mockCheckMonthlyCap.mockResolvedValue({ allowed: true });
    mockRecordLlmSpend.mockResolvedValue(undefined);
    mockComputeCostUsd.mockReturnValue(0.001);
    mockInngestSend.mockResolvedValue(undefined);
    mockCreateFunction.mockImplementation(
      (_config: unknown, fn: (...args: unknown[]) => Promise<unknown>) => ({
        fn,
        __rawFn: fn,
      })
    );
  });

  it("throws NonRetriableError when the LLM output fails schema validation", async () => {
    generationOutputOverride = JSON.stringify({ headline: "only this key" });
    const fn = await loadRawFn();
    await expect(fn({ event: defaultEvent(), step: makeMockStep() })).rejects.toMatchObject(
      { name: "NonRetriableError" }
    );
  });

  it("throws NonRetriableError when the LLM output is not valid JSON", async () => {
    generationOutputOverride = "this is not json";
    const fn = await loadRawFn();
    await expect(fn({ event: defaultEvent(), step: makeMockStep() })).rejects.toMatchObject(
      { name: "NonRetriableError" }
    );
  });

  it("attaches a GenerationSchemaError as the cause of the schema NonRetriableError", async () => {
    generationOutputOverride = "not json";
    const fn = await loadRawFn();
    const err = await fn({ event: defaultEvent(), step: makeMockStep() }).catch(
      (e: unknown) => e
    );
    expect((err as { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((err as { cause?: Error }).cause as Error).name).toBe("GenerationSchemaError");
  });

  it("persists the validated profile and the rationale bundle to the generations row", async () => {
    const setSpy = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockDbUpdate.mockReturnValue({ set: setSpy });

    const fn = await loadRawFn();
    await fn({ event: defaultEvent(), step: makeMockStep() });

    expect(setSpy).toHaveBeenCalled();
    const payload = setSpy.mock.calls[0]?.[0] as {
      output: { headline: string };
      rationale: { recruiterEye: unknown[]; confidence: Record<string, number> };
    };
    // Output is the parsed canonical profile object (not a raw string).
    expect(payload.output.headline).toContain("Platform Engineer");
    // Rationale bundle is present with recruiter-eye list + confidence.
    expect(Array.isArray(payload.rationale.recruiterEye)).toBe(true);
    expect(payload.rationale.confidence.headline).toBeGreaterThanOrEqual(0);
  });

  it("makes two Anthropic calls (generation + rationale) and records spend for each", async () => {
    const fn = await loadRawFn();
    await fn({ event: defaultEvent(), step: makeMockStep() });

    expect(capturedSystems.length).toBe(2);
    // recordLlmSpend called once per Anthropic call.
    expect(mockRecordLlmSpend).toHaveBeenCalledTimes(2);
  });

  it("checks the monthly cap before every Anthropic call", async () => {
    const fn = await loadRawFn();
    await fn({ event: defaultEvent(), step: makeMockStep() });
    // Cap checked at least once per LLM call (2 calls).
    expect(mockCheckMonthlyCap.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("retrieves benchmark exemplars via RAG before generating", async () => {
    const fn = await loadRawFn();
    await fn({ event: defaultEvent(), step: makeMockStep() });
    expect(mockRetrieveSimilarProfiles).toHaveBeenCalled();
  });
});
