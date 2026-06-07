import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock factories — must be before vi.mock() calls
// ---------------------------------------------------------------------------

const mockLimit = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

const mockReturning = vi.hoisted(() => vi.fn());
const mockValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({
  db: { select: mockSelect, insert: mockInsert },
}));

const mockMessagesCreate = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}));

const mockCheckMonthlyCap = vi.hoisted(() => vi.fn());
const mockComputeCostUsd = vi.hoisted(() => vi.fn());
const mockRecordLlmSpend = vi.hoisted(() => vi.fn());
vi.mock("@/lib/llm/cost-guard", () => ({
  checkMonthlyCap: mockCheckMonthlyCap,
  computeCostUsd: mockComputeCostUsd,
  recordLlmSpend: mockRecordLlmSpend,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_VOICE_CARD = {
  vocabulary: ["systems", "distributed"],
  hedgesAvoided: ["kind of"],
  sentenceLengthDistribution: { short: 50, medium: 30, long: 20 },
  emotionalRegister: "technical and direct",
  jargonHated: [],
};

const FIXTURE_HISTORY = {
  source: "chatgpt_zip" as const,
  messages: [{ role: "user" as const, content: "I build distributed systems at scale." }],
};

const MOCK_API_RESPONSE = {
  content: [{ type: "text", text: JSON.stringify(VALID_VOICE_CARD) }],
  usage: { input_tokens: 200, output_tokens: 80 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractVoiceCard — prompt cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Restore builder chain
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });

    // Default: cache miss, API succeeds, insert returns a generation id
    mockLimit.mockResolvedValue([]);
    mockReturning.mockResolvedValue([{ id: "gen-uuid-1" }]);
    mockCheckMonthlyCap.mockResolvedValue({ allowed: true });
    mockComputeCostUsd.mockReturnValue(0.001);
    mockRecordLlmSpend.mockResolvedValue(undefined);
    mockMessagesCreate.mockResolvedValue(MOCK_API_RESPONSE);
  });

  it("returns cached VoiceCard without calling the API when a generation exists within 24h", async () => {
    mockLimit.mockResolvedValueOnce([{ id: "gen-uuid-0", output: VALID_VOICE_CARD }]);

    const { extractVoiceCard } = await import("@/lib/voice-card");
    const result = await extractVoiceCard(FIXTURE_HISTORY, "user-uuid-1");

    expect(result).toEqual(VALID_VOICE_CARD);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it("calls the API and inserts a new generation row on cache miss", async () => {
    // mockLimit already returns [] by default (cache miss)
    const { extractVoiceCard } = await import("@/lib/voice-card");
    await extractVoiceCard(FIXTURE_HISTORY, "user-uuid-1");

    expect(mockMessagesCreate).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockReturning).toHaveBeenCalled();
  });

  it("records LLM spend with the new generationId after a cache miss", async () => {
    mockReturning.mockResolvedValueOnce([{ id: "gen-uuid-999" }]);

    const { extractVoiceCard } = await import("@/lib/voice-card");
    await extractVoiceCard(FIXTURE_HISTORY, "user-uuid-1");

    expect(mockRecordLlmSpend).toHaveBeenCalledWith(
      expect.objectContaining({ generationId: "gen-uuid-999" })
    );
  });
});
