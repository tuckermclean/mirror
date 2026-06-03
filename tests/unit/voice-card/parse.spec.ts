import { describe, it, expect } from "vitest";
import { parseVoiceCardOutput } from "@/lib/voice-card/parse";

const VALID_VOICE_CARD = {
  vocabulary: ["authentic", "driven"],
  hedgesAvoided: ["kind of", "sort of"],
  sentenceLengthDistribution: { short: 0.4, medium: 0.4, long: 0.2 },
  emotionalRegister: "confident",
  jargonHated: ["synergy"],
};

const VALID_JSON = JSON.stringify(VALID_VOICE_CARD);

describe("parseVoiceCardOutput", () => {
  it("parses valid bare JSON", () => {
    const result = parseVoiceCardOutput(VALID_JSON);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(VALID_VOICE_CARD);
    }
  });

  it("strips ```json fenced code block before parsing", () => {
    const fenced = `\`\`\`json\n${VALID_JSON}\n\`\`\``;
    const result = parseVoiceCardOutput(fenced);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(VALID_VOICE_CARD);
    }
  });

  it("strips plain ``` fenced code block before parsing", () => {
    const fenced = `\`\`\`\n${VALID_JSON}\n\`\`\``;
    const result = parseVoiceCardOutput(fenced);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(VALID_VOICE_CARD);
    }
  });

  it("returns invalid_json error for non-JSON text", () => {
    const result = parseVoiceCardOutput("not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_json");
      expect(result.error.raw).toBe("not json");
    }
  });

  it("returns invalid_json error for empty string", () => {
    const result = parseVoiceCardOutput("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_json");
    }
  });

  it("returns schema_mismatch error for valid JSON that fails schema", () => {
    const result = parseVoiceCardOutput("{}");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("schema_mismatch");
      if (result.error.kind === "schema_mismatch") {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    }
  });

  it("returns schema_mismatch error when a field has the wrong type", () => {
    const bad = { ...VALID_VOICE_CARD, vocabulary: "not-an-array" };
    const result = parseVoiceCardOutput(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("schema_mismatch");
    }
  });

  it("does not throw — returns Result instead", () => {
    expect(() => parseVoiceCardOutput("totally invalid {{}}")).not.toThrow();
    expect(() => parseVoiceCardOutput("{}")).not.toThrow();
  });
});
