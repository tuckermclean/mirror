import { describe, it, expect } from "vitest";
import { scoreVoiceMatch } from "@/lib/voice-match/score";
import type { VoiceMatchInput } from "@/lib/voice-match/types";
import type { VoiceCard } from "@/lib/voice-card/schema";

const card: VoiceCard = {
  vocabulary: ["shipped", "pragmatic", "ownership", "measured", "rigor"],
  hedgesAvoided: ["I think", "sort of", "maybe"],
  sentenceLengthDistribution: { short: 50, medium: 35, long: 15 },
  emotionalRegister: "technical, direct, methodical",
  jargonHated: ["synergy", "leverage", "rockstar"],
};

// A unit-norm-ish reference voice embedding.
const userEmbedding = [0.6, 0.4, 0.2, 0.1];

function input(overrides: Partial<VoiceMatchInput>): VoiceMatchInput {
  return {
    voiceCard: card,
    userVoiceEmbedding: userEmbedding,
    candidateText: "I shipped pragmatic work with rigor and ownership.",
    candidateEmbedding: [0.6, 0.4, 0.2, 0.1],
    ...overrides,
  };
}

describe("scoreVoiceMatch", () => {
  it("returns ok with a score in [0, 100]", () => {
    const res = scoreVoiceMatch(input({}));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.score).toBeGreaterThanOrEqual(0);
      expect(res.value.score).toBeLessThanOrEqual(100);
    }
  });

  it("is an integer score", () => {
    const res = scoreVoiceMatch(input({}));
    if (res.ok) expect(Number.isInteger(res.value.score)).toBe(true);
  });

  it("is deterministic — same input yields same score", () => {
    const a = scoreVoiceMatch(input({}));
    const b = scoreVoiceMatch(input({}));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.score).toBe(b.value.score);
  });

  it("scores a closer embedding higher than a farther one (monotonic in cosine)", () => {
    const close = scoreVoiceMatch(
      input({ candidateEmbedding: [0.6, 0.4, 0.2, 0.1] }),
    );
    const far = scoreVoiceMatch(
      input({ candidateEmbedding: [-0.6, -0.4, -0.2, -0.1] }),
    );
    expect(close.ok && far.ok).toBe(true);
    if (close.ok && far.ok) {
      expect(close.value.score).toBeGreaterThan(far.value.score);
    }
  });

  it("scores on-voice candidate text higher than off-voice text at equal cosine", () => {
    // Hold the embedding constant so only the voice-card feature term varies.
    const onVoice = scoreVoiceMatch(
      input({
        candidateText:
          "I shipped this with rigor. Took ownership. Stayed pragmatic.",
        candidateEmbedding: [0.6, 0.4, 0.2, 0.1],
      }),
    );
    const offVoice = scoreVoiceMatch(
      input({
        candidateText:
          "I think we should leverage synergy. I'm a rockstar, sort of.",
        candidateEmbedding: [0.6, 0.4, 0.2, 0.1],
      }),
    );
    expect(onVoice.ok && offVoice.ok).toBe(true);
    if (onVoice.ok && offVoice.ok) {
      expect(onVoice.value.score).toBeGreaterThan(offVoice.value.score);
    }
  });

  it("exposes the cosine and feature sub-scores for transparency", () => {
    const res = scoreVoiceMatch(input({}));
    if (res.ok) {
      expect(res.value.components.cosine).toBeGreaterThanOrEqual(0);
      expect(res.value.components.cosine).toBeLessThanOrEqual(1);
      expect(res.value.components.feature).toBeGreaterThanOrEqual(0);
      expect(res.value.components.feature).toBeLessThanOrEqual(1);
    }
  });

  it("errors when the user voice embedding is missing", () => {
    const res = scoreVoiceMatch(
      input({ userVoiceEmbedding: undefined }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("missing_embedding");
  });

  it("errors when the candidate embedding is missing", () => {
    const res = scoreVoiceMatch(input({ candidateEmbedding: undefined }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("missing_embedding");
  });

  it("errors on embedding dimension mismatch", () => {
    const res = scoreVoiceMatch(
      input({ candidateEmbedding: [0.1, 0.2, 0.3] }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("dimension_mismatch");
  });

  it("still scores with an empty voice card (feature term degrades gracefully)", () => {
    const empty: VoiceCard = {
      vocabulary: [],
      hedgesAvoided: [],
      sentenceLengthDistribution: { short: 33, medium: 34, long: 33 },
      emotionalRegister: "",
      jargonHated: [],
    };
    const res = scoreVoiceMatch(input({ voiceCard: empty }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.score).toBeGreaterThanOrEqual(0);
      expect(res.value.score).toBeLessThanOrEqual(100);
    }
  });
});
