import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEmbed = vi.hoisted(() => vi.fn());

vi.mock("voyageai", () => ({
  VoyageAIClient: vi.fn().mockImplementation(() => ({
    embed: mockEmbed,
  })),
}));

const baseHistory = {
  source: "linkedin_pdf" as const,
  messages: [
    { role: "user" as const, content: "I build distributed systems." },
    { role: "user" as const, content: "Senior Engineer at Acme." },
  ],
};

const baseVoiceCard = {
  vocabulary: ["systems", "engineer"],
  hedgesAvoided: ["I think", "maybe"],
  sentenceLengthDistribution: { short: 40, medium: 45, long: 15 },
  emotionalRegister: "direct, technical",
  jargonHated: ["synergy", "leverage"],
};

describe("embedVoiceProfile", () => {
  beforeEach(() => {
    vi.resetModules();
    mockEmbed.mockClear();
    process.env["VOYAGE_API_KEY"] = "test-voyage-key";
    mockEmbed.mockResolvedValue({
      data: [{ embedding: new Array(1024).fill(0.1) }],
    });
  });

  it("returns a 1024-dimensional embedding vector", async () => {
    const { embedVoiceProfile } = await import("@/lib/embeddings");
    const result = await embedVoiceProfile(baseHistory, baseVoiceCard);
    expect(result).toHaveLength(1024);
    expect(result.every((v) => typeof v === "number")).toBe(true);
  });

  it("calls Voyage AI embed once with the document input type", async () => {
    const { embedVoiceProfile } = await import("@/lib/embeddings");
    await embedVoiceProfile(baseHistory, baseVoiceCard);
    expect(mockEmbed).toHaveBeenCalledOnce();
    expect(mockEmbed).toHaveBeenCalledWith(
      expect.objectContaining({ inputType: "document" })
    );
  });

  it("throws ParseError when Voyage AI returns no embedding", async () => {
    mockEmbed.mockResolvedValueOnce({ data: [] });
    const { embedVoiceProfile } = await import("@/lib/embeddings");
    const { ParseError } = await import("@/lib/errors");
    await expect(embedVoiceProfile(baseHistory, baseVoiceCard)).rejects.toThrow(ParseError);
  });

  it("throws ParseError when embedding dimension is wrong", async () => {
    mockEmbed.mockResolvedValueOnce({ data: [{ embedding: [0.1, 0.2] }] });
    const { embedVoiceProfile } = await import("@/lib/embeddings");
    const { ParseError } = await import("@/lib/errors");
    await expect(embedVoiceProfile(baseHistory, baseVoiceCard)).rejects.toThrow(ParseError);
  });

  it("throws ConfigurationError when VOYAGE_API_KEY is missing", async () => {
    delete process.env["VOYAGE_API_KEY"];
    vi.resetModules();
    const { embedVoiceProfile } = await import("@/lib/embeddings");
    const { ConfigurationError } = await import("@/lib/errors");
    await expect(embedVoiceProfile(baseHistory, baseVoiceCard)).rejects.toThrow(ConfigurationError);
  });

  it("includes sentence rhythm (sentenceLengthDistribution) in the embed input", async () => {
    const { embedVoiceProfile } = await import("@/lib/embeddings");
    await embedVoiceProfile(baseHistory, baseVoiceCard);
    const embedCall = mockEmbed.mock.calls[0][0] as { input: string[] };
    const inputText = embedCall.input[0];
    // The signal text must contain sentence rhythm percentages derived from
    // sentenceLengthDistribution: { short: 40, medium: 45, long: 15 }
    expect(inputText).toMatch(/40%.*short|short.*40%/i);
    expect(inputText).toMatch(/45%.*medium|medium.*45%/i);
    expect(inputText).toMatch(/15%.*long|long.*15%/i);
  });
});
