import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ParsedChatHistory } from "@/lib/parsers/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_VOICE_CARD = {
  vocabulary: ["precise", "direct", "iterative"],
  hedgesAvoided: ["kind of", "sort of"],
  sentenceLengthDistribution: { short: 0.5, medium: 0.3, long: 0.2 },
  emotionalRegister: "confident",
  jargonHated: ["synergy", "leverage"],
};

const VALID_VOICE_CARD_JSON = JSON.stringify(VALID_VOICE_CARD);

const FIXTURE_HISTORY: ParsedChatHistory = {
  source: "claude",
  messages: [
    { role: "user", content: "I want to build a distributed system." },
    { role: "assistant", content: "Great idea. Let's start with the data model." },
  ],
};

// ---------------------------------------------------------------------------
// DB mock (Drizzle builder chain)
// ---------------------------------------------------------------------------

const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

vi.mock("@/db/client", () => ({
  db: { select: mockSelect, insert: mockInsert },
}));

// ---------------------------------------------------------------------------
// Cost guard mock
// ---------------------------------------------------------------------------

const mockCheckMonthlyCap = vi.fn();
const mockComputeCostUsd = vi.fn().mockReturnValue(0.005);
const mockRecordLlmSpend = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/llm/cost-guard", () => ({
  checkMonthlyCap: mockCheckMonthlyCap,
  computeCostUsd: mockComputeCostUsd,
  recordLlmSpend: mockRecordLlmSpend,
}));

// ---------------------------------------------------------------------------
// Anthropic streaming mock
// ---------------------------------------------------------------------------

const mockStream = {
  on: vi.fn().mockReturnThis(),
  finalMessage: vi.fn(),
};
const mockMessagesStream = vi.fn().mockResolvedValue(mockStream);

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { stream: mockMessagesStream },
  })),
}));

// ---------------------------------------------------------------------------
// Logger mock (suppress output)
// ---------------------------------------------------------------------------

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set up mocks for a successful no-cache LLM call returning the given JSON. */
function setupSuccessfulApiCall(jsonText: string = VALID_VOICE_CARD_JSON) {
  mockLimit.mockResolvedValueOnce([]); // cache miss
  mockReturning.mockResolvedValueOnce([{ id: "gen-uuid-1" }]);
  mockStream.finalMessage.mockImplementation(async () => {
    // Simulate the streaming text event arriving before finalMessage resolves
    const textCalls = mockStream.on.mock.calls.filter(([event]) => event === "text");
    for (const [, cb] of textCalls) {
      (cb as (chunk: string) => void)(jsonText);
    }
    return { usage: { input_tokens: 200, output_tokens: 80 } };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VoiceCardSchema", () => {
  const REQUIRED_FIELDS = [
    "vocabulary",
    "hedgesAvoided",
    "sentenceLengthDistribution",
    "emotionalRegister",
    "jargonHated",
  ] as const;

  it("has all required fields", async () => {
    const { VoiceCardSchema } = await import("@/lib/voice-card");
    for (const field of REQUIRED_FIELDS) {
      expect(VoiceCardSchema.shape).toHaveProperty(field);
    }
  });

  it("rejects a value missing required fields", async () => {
    const { VoiceCardSchema } = await import("@/lib/voice-card");
    const result = VoiceCardSchema.safeParse({ vocabulary: ["ok"] });
    expect(result.success).toBe(false);
  });

  it("accepts a fully valid voice card", async () => {
    const { VoiceCardSchema } = await import("@/lib/voice-card");
    const result = VoiceCardSchema.safeParse(VALID_VOICE_CARD);
    expect(result.success).toBe(true);
  });
});

describe("extractVoiceCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default return values cleared by clearAllMocks
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockValues.mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
    mockMessagesStream.mockResolvedValue(mockStream);
    mockComputeCostUsd.mockReturnValue(0.005);
    mockRecordLlmSpend.mockResolvedValue(undefined);
    mockStream.on.mockReturnThis();
  });

  it("returns cap error when monthly cap is reached", async () => {
    const { extractVoiceCard } = await import("@/lib/voice-card");
    mockCheckMonthlyCap.mockResolvedValueOnce({
      allowed: false,
      resets_at: "2026-07-01T00:00:00.000Z",
    });

    const result = await extractVoiceCard(FIXTURE_HISTORY, "user-uuid-1");

    expect(result).toEqual({
      error: "monthly_cap_reached",
      resets_at: "2026-07-01T00:00:00.000Z",
    });
    expect(mockMessagesStream).not.toHaveBeenCalled();
  });

  it("returns cached voice card on cache hit without calling the API", async () => {
    const { extractVoiceCard } = await import("@/lib/voice-card");
    mockCheckMonthlyCap.mockResolvedValueOnce({ allowed: true });
    mockLimit.mockResolvedValueOnce([
      { id: "cached-gen-uuid", output: VALID_VOICE_CARD },
    ]);

    const result = await extractVoiceCard(FIXTURE_HISTORY, "user-uuid-1");

    expect(result).toEqual(VALID_VOICE_CARD);
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("calls the Anthropic API on cache miss and returns the parsed voice card", async () => {
    const { extractVoiceCard } = await import("@/lib/voice-card");
    mockCheckMonthlyCap.mockResolvedValueOnce({ allowed: true });
    setupSuccessfulApiCall();

    const result = await extractVoiceCard(FIXTURE_HISTORY, "user-uuid-1");

    expect(result).toEqual(VALID_VOICE_CARD);
    expect(mockMessagesStream).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();
  });

  it("records LLM spend after a successful API call", async () => {
    const { extractVoiceCard } = await import("@/lib/voice-card");
    mockCheckMonthlyCap.mockResolvedValueOnce({ allowed: true });
    setupSuccessfulApiCall();

    await extractVoiceCard(FIXTURE_HISTORY, "user-uuid-1");

    expect(mockRecordLlmSpend).toHaveBeenCalledOnce();
    const spendArgs = mockRecordLlmSpend.mock.calls[0]![0];
    expect(spendArgs.userId).toBe("user-uuid-1");
    expect(spendArgs.inputTokens).toBe(200);
    expect(spendArgs.outputTokens).toBe(80);
  });

  it("parses JSON wrapped in a fenced code block", async () => {
    const { extractVoiceCard } = await import("@/lib/voice-card");
    mockCheckMonthlyCap.mockResolvedValueOnce({ allowed: true });
    const fenced = "```json\n" + VALID_VOICE_CARD_JSON + "\n```";
    setupSuccessfulApiCall(fenced);

    const result = await extractVoiceCard(FIXTURE_HISTORY, "user-uuid-1");

    expect(result).toEqual(VALID_VOICE_CARD);
  });

  it("throws LlmParseError when the LLM returns non-JSON text", async () => {
    const { extractVoiceCard } = await import("@/lib/voice-card");
    const { LlmParseError } = await import("@/lib/errors");
    mockCheckMonthlyCap.mockResolvedValueOnce({ allowed: true });
    mockLimit.mockResolvedValueOnce([]);
    mockStream.finalMessage.mockImplementation(async () => {
      const textCalls = mockStream.on.mock.calls.filter(([event]) => event === "text");
      for (const [, cb] of textCalls) {
        (cb as (chunk: string) => void)("this is not valid json at all");
      }
      return { usage: { input_tokens: 50, output_tokens: 10 } };
    });

    await expect(extractVoiceCard(FIXTURE_HISTORY, "user-uuid-1")).rejects.toBeInstanceOf(
      LlmParseError
    );
  });

  it("throws LlmParseError when the LLM returns JSON that fails schema validation", async () => {
    const { extractVoiceCard } = await import("@/lib/voice-card");
    const { LlmParseError } = await import("@/lib/errors");
    mockCheckMonthlyCap.mockResolvedValueOnce({ allowed: true });
    mockLimit.mockResolvedValueOnce([]);
    const badSchema = JSON.stringify({ vocabulary: "not-an-array" }); // wrong shape
    mockStream.finalMessage.mockImplementation(async () => {
      const textCalls = mockStream.on.mock.calls.filter(([event]) => event === "text");
      for (const [, cb] of textCalls) {
        (cb as (chunk: string) => void)(badSchema);
      }
      return { usage: { input_tokens: 50, output_tokens: 10 } };
    });

    await expect(extractVoiceCard(FIXTURE_HISTORY, "user-uuid-1")).rejects.toBeInstanceOf(
      LlmParseError
    );
  });
});
