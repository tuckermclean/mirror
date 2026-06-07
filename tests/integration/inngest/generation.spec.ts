/**
 * Integration-style tests for the generation/start Inngest function.
 *
 * NOTE ON DB MODE: This worktree has no DATABASE_URL and two upstream
 * dependencies are still in flight (a teammate is adding
 * `readLinkedinSnapshot` to src/lib/db/pii-read.ts and `computePromptHash`
 * to src/lib/llm/prompt-cache.ts). To run hermetically in CI without a live
 * Postgres or those modules, this test mocks:
 *   - `@anthropic-ai/sdk` (streaming client)
 *   - `@/db/client` (the Drizzle db singleton — chainable query builder)
 *   - the PII readers + prompt-cache + cost-guard collaborators
 *   - the inngest client's `send`
 * It still exercises the real `runGeneration` handler end-to-end, asserting
 * the full state machine: snapshot read → transcript read → top-k voice
 * embeddings → cap check → streaming call → ledger write → generations update
 * → completion event. When the live-DB integration harness lands, this can be
 * upgraded to seed/read real rows (mirroring process-import.spec.ts).
 *
 * Invocation mirrors process-import.spec.ts: Inngest v4 stores the raw
 * callback on `.fn`; we call it directly with a mock `step` that runs each
 * step.run() callback synchronously.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const USER_ID = "00000000-0000-0000-0000-0000000000a1";
const SNAPSHOT_ID = "00000000-0000-0000-0000-0000000000b2";
const GENERATION_ID = "00000000-0000-0000-0000-0000000000c3";
const INTERVIEW_ID = "00000000-0000-0000-0000-0000000000d4";
const ACTIVE_IMPORT_ID = "00000000-0000-0000-0000-0000000000e5";

const MODEL = "claude-sonnet-4-6";
const GENERATED_OUTPUT = '{"headline":"Engineer who ships","about":"I build things."}';

// ---------------------------------------------------------------------------
// Anthropic SDK mock — streaming client
// ---------------------------------------------------------------------------
const finalMessageMock = vi.fn().mockResolvedValue({
  content: [{ type: "text", text: GENERATED_OUTPUT }],
  usage: { input_tokens: 1200, output_tokens: 340 },
});
const streamOn = vi.fn();
const messagesStream = vi.fn().mockResolvedValue({
  on: streamOn,
  finalMessage: finalMessageMock,
  // some call sites read text via finalMessage; expose content too
  finalText: vi.fn().mockResolvedValue(GENERATED_OUTPUT),
});

vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = { stream: messagesStream };
  }
  return { default: Anthropic };
});

// ---------------------------------------------------------------------------
// PII readers + prompt-cache + cost-guard mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/db/pii-read", () => ({
  readLinkedinSnapshot: vi.fn().mockResolvedValue({
    rawHtml: "<html>Jane Smith — Senior Engineer at Acme</html>",
    parsed: { name: "Jane Smith", headline: "Senior Engineer at Acme" },
  }),
  readInterviewTranscript: vi.fn().mockResolvedValue({
    transcript: [{ role: "user", content: "I care about shipping real things." }],
  }),
}));

vi.mock("@/lib/llm/prompt-cache", () => ({
  computePromptHash: vi.fn().mockReturnValue("deadbeefhash"),
}));

const checkMonthlyCap = vi.fn().mockResolvedValue({ allowed: true });
const computeCostUsd = vi.fn().mockReturnValue(0.0087);
const recordLlmSpend = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/llm/cost-guard", () => ({
  checkMonthlyCap: (...a: unknown[]) => checkMonthlyCap(...a),
  computeCostUsd: (...a: unknown[]) => computeCostUsd(...a),
  recordLlmSpend: (...a: unknown[]) => recordLlmSpend(...a),
}));

// ---------------------------------------------------------------------------
// Inngest client mock — capture send() + provide createFunction passthrough
// ---------------------------------------------------------------------------
const inngestSend = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: (...a: unknown[]) => inngestSend(...a),
    createFunction: (_config: unknown, handler: unknown) => ({ fn: handler }),
  },
}));

// ---------------------------------------------------------------------------
// DB mock — a minimal chainable Drizzle query builder.
// select(): returns interview row (interviews) then voice embeddings (imports)
//   then the active voice profile vector (imports). We drive results by call.
// update(): records the generations update payload.
// ---------------------------------------------------------------------------
const updateSetSpy = vi.fn();

vi.mock("@/db/client", () => {
  // Sequence of resolved values for successive terminal awaits on select chains.
  // Order matters and matches the handler's read order:
  //   1. interviews lookup        -> [{ id: INTERVIEW_ID }]
  //   2. active voice vector       -> [{ voiceEmbedding: [...] }]  (users join / imports)
  //   3. top-k voice embeddings    -> [{ voiceEmbedding: [...] }, ...]
  // The handler may merge steps 2+3; we make the mock tolerant by returning
  // a row that satisfies both shapes.
  const voiceRow = { voiceEmbedding: new Array(1024).fill(0.02), id: ACTIVE_IMPORT_ID };

  function makeSelectChain(rows: unknown[]) {
    const chain: Record<string, unknown> = {};
    const ret = () => chain;
    chain["from"] = ret;
    chain["where"] = ret;
    chain["innerJoin"] = ret;
    chain["leftJoin"] = ret;
    chain["orderBy"] = ret;
    chain["limit"] = () => Promise.resolve(rows);
    // allow direct await without .limit() (top-k may not call limit if it uses orderBy+limit)
    chain["then"] = (resolve: (v: unknown) => unknown) => resolve(rows);
    return chain;
  }

  let selectCall = 0;
  const db = {
    select: vi.fn(() => {
      selectCall += 1;
      if (selectCall === 1) {
        // interviews lookup
        return makeSelectChain([{ id: INTERVIEW_ID, userId: USER_ID }]);
      }
      // every subsequent select returns voice embedding rows
      return makeSelectChain([voiceRow, voiceRow, voiceRow, voiceRow, voiceRow]);
    }),
    update: vi.fn(() => ({
      set: (payload: unknown) => {
        updateSetSpy(payload);
        return { where: () => Promise.resolve(undefined) };
      },
    })),
  };
  return { db };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function invoke() {
  const mod = await import("@/inngest/generation");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (mod.runGeneration ?? (mod as any).generation) as any;
  if (!fn || typeof fn.fn !== "function") {
    throw new Error("runGeneration not exported as an Inngest function with .fn");
  }
  const mockStep = { run: async (_id: string, cb: () => Promise<unknown>) => cb() };
  return fn.fn({
    event: { name: "generation/start", data: { userId: USER_ID, snapshotId: SNAPSHOT_ID, generationId: GENERATION_ID } },
    step: mockStep,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("runGeneration — generation/start (DB-mocked integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkMonthlyCap.mockResolvedValue({ allowed: true });
    finalMessageMock.mockResolvedValue({
      content: [{ type: "text", text: GENERATED_OUTPUT }],
      usage: { input_tokens: 1200, output_tokens: 340 },
    });
    messagesStream.mockResolvedValue({
      on: streamOn,
      finalMessage: finalMessageMock,
      finalText: vi.fn().mockResolvedValue(GENERATED_OUTPUT),
    });
  });

  it("calls the Anthropic STREAMING API (not a blocking create)", async () => {
    await invoke();
    expect(messagesStream).toHaveBeenCalledTimes(1);
    const arg = messagesStream.mock.calls[0]?.[0] as { model: string; system: string };
    expect(arg.model).toBe(MODEL);
    expect(typeof arg.system).toBe("string");
    expect(arg.system.length).toBeGreaterThan(0);
  });

  it("checks the monthly cap BEFORE the Anthropic call", async () => {
    const order: string[] = [];
    checkMonthlyCap.mockImplementationOnce(async () => {
      order.push("cap");
      return { allowed: true };
    });
    messagesStream.mockImplementationOnce(async () => {
      order.push("stream");
      return { on: streamOn, finalMessage: finalMessageMock };
    });
    await invoke();
    expect(order).toEqual(["cap", "stream"]);
  });

  it("throws MonthlyCapError and skips the Anthropic call when the cap is reached", async () => {
    checkMonthlyCap.mockResolvedValueOnce({ allowed: false, resets_at: "2026-07-01T00:00:00.000Z" });
    const { MonthlyCapError } = await import("@/lib/errors");
    await expect(invoke()).rejects.toBeInstanceOf(MonthlyCapError);
    expect(messagesStream).not.toHaveBeenCalled();
  });

  it("writes actual token usage to the spend ledger (never estimated)", async () => {
    await invoke();
    expect(computeCostUsd).toHaveBeenCalledWith(MODEL, 1200, 340);
    expect(recordLlmSpend).toHaveBeenCalledTimes(1);
    const arg = recordLlmSpend.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      userId: USER_ID,
      generationId: GENERATION_ID,
      model: MODEL,
      inputTokens: 1200,
      outputTokens: 340,
    });
  });

  it("updates the generations row with output, model, and promptHash", async () => {
    await invoke();
    expect(updateSetSpy).toHaveBeenCalled();
    const payloads = updateSetSpy.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const genUpdate = payloads.find((p) => "output" in p);
    expect(genUpdate).toBeDefined();
    expect(genUpdate?.["model"]).toBe(MODEL);
    expect(genUpdate?.["promptHash"]).toBe("deadbeefhash");
    expect(genUpdate?.["output"]).toBeTruthy();
  });

  it("emits a generation/complete event with the generationId and userId", async () => {
    await invoke();
    expect(inngestSend).toHaveBeenCalledWith({
      name: "generation/complete",
      data: { generationId: GENERATION_ID, userId: USER_ID },
    });
  });
});
