import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Drizzle builder chain mocks
// ---------------------------------------------------------------------------
const mockWhere = vi.fn();
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

const mockValues = vi.fn().mockResolvedValue(undefined);
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

vi.mock("@/db/client", () => ({
  db: { select: mockSelect, insert: mockInsert },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkMonthlyCap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Re-wire chain after clearAllMocks
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it("returns allowed=true when MTD spend is below cap", async () => {
    // MTD spend = $5, cap = $20 (default)
    mockWhere.mockResolvedValueOnce([{ total: "5.000000" }]);
    const { checkMonthlyCap } = await import("@/lib/llm/cost-guard");
    const result = await checkMonthlyCap("user-uuid-1");
    expect(result.allowed).toBe(true);
    expect(result.resets_at).toBeUndefined();
  });

  it("returns allowed=false when MTD spend equals the cap", async () => {
    process.env["LLM_MONTHLY_CAP_USD"] = "20";
    mockWhere.mockResolvedValueOnce([{ total: "20.000000" }]);
    const { checkMonthlyCap } = await import("@/lib/llm/cost-guard");
    const result = await checkMonthlyCap("user-uuid-2");
    expect(result.allowed).toBe(false);
    expect(result.resets_at).toBeDefined();
  });

  it("returns allowed=false when MTD spend exceeds the cap", async () => {
    process.env["LLM_MONTHLY_CAP_USD"] = "20";
    mockWhere.mockResolvedValueOnce([{ total: "25.123456" }]);
    const { checkMonthlyCap } = await import("@/lib/llm/cost-guard");
    const result = await checkMonthlyCap("user-uuid-3");
    expect(result.allowed).toBe(false);
  });

  it("returns allowed=true when ledger is empty (no spend rows)", async () => {
    mockWhere.mockResolvedValueOnce([{ total: null }]);
    const { checkMonthlyCap } = await import("@/lib/llm/cost-guard");
    const result = await checkMonthlyCap("user-uuid-4");
    expect(result.allowed).toBe(true);
  });

  it("resets_at is the ISO 8601 first day of the next calendar month", async () => {
    process.env["LLM_MONTHLY_CAP_USD"] = "20";
    mockWhere.mockResolvedValueOnce([{ total: "999.000000" }]);
    const { checkMonthlyCap } = await import("@/lib/llm/cost-guard");
    const result = await checkMonthlyCap("user-uuid-5");
    expect(result.allowed).toBe(false);
    expect(result.resets_at).toBeDefined();

    // Must be a valid ISO 8601 date string
    const parsed = new Date(result.resets_at!);
    expect(Number.isNaN(parsed.getTime())).toBe(false);

    // Must be the 1st of the month
    expect(parsed.getUTCDate()).toBe(1);

    // Must be in the future (next month or later)
    const now = new Date();
    expect(parsed.getTime()).toBeGreaterThan(now.getTime());
  });

  afterEach(() => {
    delete process.env["LLM_MONTHLY_CAP_USD"];
  });
});

describe("recordLlmSpend", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it("inserts a row with the provided costUsd", async () => {
    const { recordLlmSpend } = await import("@/lib/llm/cost-guard");
    await recordLlmSpend({
      userId: "user-uuid-1",
      model: "claude-sonnet-4-6",
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.01,
    });
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledOnce();
    const insertedRow = mockValues.mock.calls[0]![0];
    expect(insertedRow.userId).toBe("user-uuid-1");
    expect(insertedRow.model).toBe("claude-sonnet-4-6");
    expect(insertedRow.inputTokens).toBe(1000);
    expect(insertedRow.outputTokens).toBe(500);
    expect(insertedRow.costUsd).toBe("0.01");
  });

  it("inserts generationId when provided", async () => {
    const { recordLlmSpend } = await import("@/lib/llm/cost-guard");
    await recordLlmSpend({
      userId: "user-uuid-1",
      generationId: "gen-uuid-99",
      model: "claude-sonnet-4-6",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
    });
    const insertedRow = mockValues.mock.calls[0]![0];
    expect(insertedRow.generationId).toBe("gen-uuid-99");
  });

  it("sets generationId to null when not provided", async () => {
    const { recordLlmSpend } = await import("@/lib/llm/cost-guard");
    await recordLlmSpend({
      userId: "user-uuid-1",
      model: "claude-sonnet-4-6",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
    });
    const insertedRow = mockValues.mock.calls[0]![0];
    expect(insertedRow.generationId).toBeNull();
  });
});

describe("computeCostUsd", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("computes cost correctly for claude-sonnet-4-6 ($3/$15 per MTok)", async () => {
    const { computeCostUsd } = await import("@/lib/llm/cost-guard");
    // 1M input tokens → $3, 1M output tokens → $15
    const cost = computeCostUsd("claude-sonnet-4-6", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(18, 6);
  });

  it("computes cost correctly for claude-opus-4-7 ($15/$75 per MTok)", async () => {
    const { computeCostUsd } = await import("@/lib/llm/cost-guard");
    const cost = computeCostUsd("claude-opus-4-7", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(90, 6);
  });

  it("returns 0 for 0 tokens", async () => {
    const { computeCostUsd } = await import("@/lib/llm/cost-guard");
    expect(computeCostUsd("claude-sonnet-4-6", 0, 0)).toBe(0);
  });

  it("throws for unknown model", async () => {
    const { computeCostUsd } = await import("@/lib/llm/cost-guard");
    expect(() => computeCostUsd("gpt-4", 100, 100)).toThrow(/unknown model/i);
  });

  it("throws an UnknownModelError instance for unknown model", async () => {
    const { computeCostUsd } = await import("@/lib/llm/cost-guard");
    const { UnknownModelError } = await import("@/lib/errors");
    expect(() => computeCostUsd("gpt-4", 100, 100)).toThrow(UnknownModelError);
  });
});
