import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — keep the unit test free of DB and network.
// ---------------------------------------------------------------------------

const checkMonthlyCap = vi.fn();
const recordLlmSpend = vi.fn();
const computeCostUsd = vi.fn(() => 0.01);

vi.mock("@/lib/llm/cost-guard", () => ({
  checkMonthlyCap: (...a: unknown[]) => checkMonthlyCap(...a),
  recordLlmSpend: (...a: unknown[]) => recordLlmSpend(...a),
  computeCostUsd: (...a: unknown[]) => computeCostUsd(...a),
}));

const findCachedGeneration = vi.fn();
const computePromptHash = vi.fn(() => "hash-123");
const recordGeneration = vi.fn();
const evictGeneration = vi.fn();

vi.mock("@/lib/llm/prompt-cache", () => ({
  findCachedGeneration: (...a: unknown[]) => findCachedGeneration(...a),
  computePromptHash: (...a: unknown[]) => computePromptHash(...a),
  recordGeneration: (...a: unknown[]) => recordGeneration(...a),
  evictGeneration: (...a: unknown[]) => evictGeneration(...a),
}));

const streamMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: (...a: unknown[]) => streamMock(...a) };
  },
}));

const VALID_CARD = {
  vocabulary: ["reliability", "observability"],
  hedgesAvoided: ["sort of"],
  sentenceLengthDistribution: { short: 0.4, medium: 0.4, long: 0.2 },
  emotionalRegister: "direct, technical",
  jargonHated: ["synergy"],
};

function mockStreamReturning(text: string, usage = { input_tokens: 100, output_tokens: 50 }) {
  streamMock.mockResolvedValue({
    finalMessage: async () => ({
      content: [{ type: "text", text }],
      usage,
    }),
  });
}

import { readFileSync } from "fs";
import { join } from "path";
import { extractVoiceCardLlm } from "@/lib/voice/extract";

// ---------------------------------------------------------------------------
// AGENTS.md line-length guard: extractVoiceCardLlm must be ≤ 40 lines.
// This test parses the source file to count lines inside the function body.
// It fails (red) before the refactor splits out streamAndRecord, turning
// green once the helper is extracted.
// ---------------------------------------------------------------------------
describe("extractVoiceCardLlm — AGENTS.md line-length constraint", () => {
  it("extractVoiceCardLlm body must not exceed 40 lines", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/voice/extract.ts"),
      "utf-8",
    );
    const lines = src.split("\n");

    const startIdx = lines.findIndex((l) =>
      l.includes("export async function extractVoiceCardLlm("),
    );
    expect(startIdx).toBeGreaterThan(-1);

    // Walk forward and find the closing brace at the same indent level.
    // We must first see at least one `{` (depth > 0) before we can detect
    // the matching `}` (depth back to 0), otherwise lines before the opening
    // brace would trigger a false-early exit.
    let depth = 0;
    let seenOpen = false;
    let endIdx = startIdx;
    for (let i = startIdx; i < lines.length; i++) {
      for (const ch of lines[i]!) {
        if (ch === "{") { depth++; seenOpen = true; }
        else if (ch === "}") depth--;
      }
      if (seenOpen && depth === 0) {
        endIdx = i;
        break;
      }
    }

    const bodyLineCount = endIdx - startIdx + 1;
    expect(bodyLineCount).toBeLessThanOrEqual(40);
  });
});

describe("extractVoiceCardLlm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkMonthlyCap.mockResolvedValue({ allowed: true });
    findCachedGeneration.mockResolvedValue(null);
    computeCostUsd.mockReturnValue(0.01);
    recordGeneration.mockResolvedValue(undefined);
    evictGeneration.mockResolvedValue(undefined);
  });

  it("throws MonthlyCapError when the spend cap is reached (no LLM call)", async () => {
    checkMonthlyCap.mockResolvedValue({ allowed: false, resets_at: "2026-07-01T00:00:00Z" });

    await expect(
      extractVoiceCardLlm("transcript", { userId: "u1" }),
    ).rejects.toMatchObject({ name: "MonthlyCapError" });

    expect(streamMock).not.toHaveBeenCalled();
    expect(recordLlmSpend).not.toHaveBeenCalled();
  });

  it("returns the cached VoiceCard without calling the LLM when a 24h cache hit exists", async () => {
    findCachedGeneration.mockResolvedValue({ id: "g1", output: VALID_CARD });

    const result = await extractVoiceCardLlm("transcript", { userId: "u1" });

    expect(result).toEqual(VALID_CARD);
    expect(streamMock).not.toHaveBeenCalled();
    expect(recordLlmSpend).not.toHaveBeenCalled();
    expect(checkMonthlyCap).not.toHaveBeenCalled();
  });

  it("logs a warning and falls through to the LLM when the cached output fails schema validation", async () => {
    // Cache returns a row whose output does not conform to VoiceCard schema
    findCachedGeneration.mockResolvedValue({ id: "g-bad", output: { invalid: true } });
    mockStreamReturning(JSON.stringify(VALID_CARD));

    const result = await extractVoiceCardLlm("transcript", { userId: "u1" });

    expect(result).toEqual(VALID_CARD);
    // The LLM must have been called because the cache row was invalid
    expect(streamMock).toHaveBeenCalledTimes(1);
    // The invalid cache row should be evicted so future calls skip re-validation
    expect(evictGeneration).toHaveBeenCalledWith("g-bad");
  });

  it("streams, parses, and records actual usage cost on a cache miss", async () => {
    mockStreamReturning(JSON.stringify(VALID_CARD), { input_tokens: 120, output_tokens: 60 });

    const result = await extractVoiceCardLlm("transcript", { userId: "u1" });

    expect(result).toEqual(VALID_CARD);
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(recordLlmSpend).toHaveBeenCalledTimes(1);
    const spendArg = recordLlmSpend.mock.calls[0]![0] as Record<string, unknown>;
    expect(spendArg["userId"]).toBe("u1");
    expect(spendArg["inputTokens"]).toBe(120);
    expect(spendArg["outputTokens"]).toBe(60);
    // The result must be written to the cache after a successful LLM call
    expect(recordGeneration).toHaveBeenCalledTimes(1);
    expect(computePromptHash).toHaveBeenCalledTimes(1);
  });

  it("throws when the model output fails the VoiceCard schema", async () => {
    mockStreamReturning("not json at all");

    await expect(
      extractVoiceCardLlm("transcript", { userId: "u1" }),
    ).rejects.toMatchObject({ name: "GenerationSchemaError" });
  });
});
