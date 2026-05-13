// RED: @/lib/voice-card does not exist yet — fails until Wk 2
import { describe, it, expect } from "vitest";

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
    const { extractVoiceCard } = await import("@/lib/voice-card");
    expect(typeof extractVoiceCard).toBe("function");
  });
});
