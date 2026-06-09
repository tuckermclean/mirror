import { describe, it, expect } from "vitest";
import { voiceCardFeatureOverlap } from "@/lib/voice-match/features";
import type { VoiceCard } from "@/lib/voice-card/schema";

const card: VoiceCard = {
  vocabulary: ["shipped", "pragmatic", "ownership", "measured", "rigor"],
  hedgesAvoided: ["I think", "sort of", "maybe"],
  sentenceLengthDistribution: { short: 50, medium: 35, long: 15 },
  emotionalRegister: "technical, direct, methodical",
  jargonHated: ["synergy", "leverage", "rockstar"],
};

describe("voiceCardFeatureOverlap", () => {
  it("returns a value in [0, 1]", () => {
    const onVoice = "I shipped a pragmatic system with rigor and ownership.";
    const score = voiceCardFeatureOverlap(card, onVoice);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("scores on-voice text higher than off-voice text", () => {
    const onVoice =
      "I shipped this with rigor. Took ownership. Stayed pragmatic and measured.";
    const offVoice =
      "I think we could maybe leverage synergy. I'm a rockstar ninja, sort of.";
    expect(voiceCardFeatureOverlap(card, onVoice)).toBeGreaterThan(
      voiceCardFeatureOverlap(card, offVoice),
    );
  });

  it("penalizes the presence of hated jargon", () => {
    const clean = "I shipped pragmatic work with ownership.";
    const jargony = "I shipped pragmatic synergy leverage with ownership.";
    expect(voiceCardFeatureOverlap(card, clean)).toBeGreaterThan(
      voiceCardFeatureOverlap(card, jargony),
    );
  });

  it("penalizes the presence of avoided hedges", () => {
    const direct = "I shipped this with rigor and ownership.";
    const hedged = "I think I sort of shipped this, maybe, with rigor.";
    expect(voiceCardFeatureOverlap(card, direct)).toBeGreaterThan(
      voiceCardFeatureOverlap(card, hedged),
    );
  });

  it("handles an empty voice card gracefully (no NaN, in bounds)", () => {
    const empty: VoiceCard = {
      vocabulary: [],
      hedgesAvoided: [],
      sentenceLengthDistribution: { short: 33, medium: 34, long: 33 },
      emotionalRegister: "",
      jargonHated: [],
    };
    const score = voiceCardFeatureOverlap(empty, "any text here at all");
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("handles empty candidate text gracefully", () => {
    const score = voiceCardFeatureOverlap(card, "");
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("counts multi-word vocabulary terms as hits when present in candidate text", () => {
    // Use ONLY multi-word terms so Set.has() can never match — every token in
    // the set is a single word, so `set.has("machine learning")` is always false.
    const multiWordCard: VoiceCard = {
      vocabulary: ["machine learning", "first principles"],
      hedgesAvoided: [],
      sentenceLengthDistribution: { short: 50, medium: 35, long: 15 },
      emotionalRegister: "technical",
      jargonHated: [],
    };
    // Both multi-word terms appear verbatim in the candidate text.
    // A text WITHOUT these phrases should score lower than one WITH them.
    // With Set.has() both score identically (0 vocab hits each) — the bug.
    const withTerms =
      "I applied machine learning at scale, reasoning from first principles.";
    const withoutTerms =
      "I wrote software and deployed containers to production clusters.";
    const scoreWith = voiceCardFeatureOverlap(multiWordCard, withTerms);
    const scoreWithout = voiceCardFeatureOverlap(multiWordCard, withoutTerms);
    // With the String.includes fix: withTerms gets 2/2 vocab hits → higher score.
    // With the Set.has() bug: both get 0/2 vocab hits → equal score (test fails).
    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });
});
