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
    profileGeneration: { content: "You are a LinkedIn profile rewriter." },
  },
}));

vi.mock("@/lib/errors", () => ({
  MonthlyCapError: class MonthlyCapError extends Error {
    constructor(public resets_at: string) {
      super("monthly cap reached");
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

// Capture the messages array passed to the Anthropic stream call.
const capturedMessages: Array<{ role: string; content: string }[]> = [];

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        stream: vi.fn().mockImplementation(
          (params: { messages: Array<{ role: string; content: string }> }) => {
            capturedMessages.push(params.messages);
            return {
              finalMessage: vi.fn().mockResolvedValue({
                content: [{ type: "text", text: "Rewritten profile output" }],
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

    // The transcript must appear as an explicitly-labelled section.
    expect(userContent).toContain("Interview transcript:");
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
    const voiceSamplesMatch = userContent.match(/Voice samples:(.*)/s);
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
    expect(userContent).toContain("Profile:");
    expect(userContent).toContain("My LinkedIn profile");
  });
});
