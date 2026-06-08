import { describe, it, expect } from "vitest";
import type { ParsedChatHistory } from "@/lib/parsers/types";
import fixtureHistory from "./fixtures/parsed-chat-history.json";

const REQUIRED_VOICE_CARD_FIELDS = [
  "vocabulary",
  "hedgesAvoided",
  "sentenceLengthDistribution",
  "emotionalRegister",
  "jargonHated",
] as const;

describe("Voice Card extraction", () => {
  it("extracted Voice Card has all required fields", async () => {
    const { VoiceCardSchema } = await import("@/lib/voice-card");
    for (const field of REQUIRED_VOICE_CARD_FIELDS) {
      expect(VoiceCardSchema.shape).toHaveProperty(field);
    }
  });

  it("extractVoiceCard returns a valid Voice Card for a fixture transcript", async () => {
    const { extractVoiceCard, VoiceCardSchema } = await import("@/lib/voice-card");
    const history = fixtureHistory as ParsedChatHistory;

    const result = extractVoiceCard(history);

    // Must parse without throwing — validates all fields and constraints
    expect(() => VoiceCardSchema.parse(result)).not.toThrow();

    // Structural shape assertions
    expect(Array.isArray(result.vocabulary)).toBe(true);
    expect(Array.isArray(result.hedgesAvoided)).toBe(true);
    expect(typeof result.emotionalRegister).toBe("string");
    expect(result.emotionalRegister.length).toBeGreaterThan(0);
    expect(Array.isArray(result.jargonHated)).toBe(true);

    // sentenceLengthDistribution must sum to approximately 100 (90–110)
    const { short, medium, long } = result.sentenceLengthDistribution;
    const sum = short + medium + long;
    expect(sum).toBeGreaterThanOrEqual(90);
    expect(sum).toBeLessThanOrEqual(110);

    // vocabulary should pick up domain words repeated in the fixture
    // "reliability" appears multiple times in user messages
    expect(result.vocabulary.some((w) => w === "reliability" || w === "sre")).toBe(true);
  });
});
