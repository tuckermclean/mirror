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
  topics: ["engineering", "distributed systems"],
  writingStyle: "direct and technical",
  communicationPatterns: [],
};

describe("embedVoiceProfile", () => {
  beforeEach(() => {
    vi.resetModules();
    mockEmbed.mockClear();
    process.env["VOYAGE_API_KEY"] = "test-voyage-key";
    mockEmbed.mockResolvedValue({
      data: [{ embedding: new Array(3072).fill(0.1) }],
    });
  });

  it("returns a 3072-dimensional embedding vector", async () => {
    const { embedVoiceProfile } = await import("@/lib/embeddings");
    const result = await embedVoiceProfile(baseHistory, baseVoiceCard);
    expect(result).toHaveLength(3072);
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
});
