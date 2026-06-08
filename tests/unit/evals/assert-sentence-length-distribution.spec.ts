/**
 * Unit tests for evals/helpers/assert-sentence-length-distribution.cjs
 *
 * Covers the sentence length distribution check used by promptfoo JS assertions
 * in evals/voice-extraction.yaml.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

// assert-sentence-length-distribution.cjs is a CommonJS module; use createRequire so Vitest (ESM) can load it.
const require = createRequire(import.meta.url);
const assertSentenceLengthDistribution = require("../../../evals/helpers/assert-sentence-length-distribution.cjs") as (
  output: string,
) => boolean;

const validCard = JSON.stringify({
  sentenceLengthDistribution: { short: 30, medium: 40, long: 30 },
  vocabulary: ["word"],
  hedgesAvoided: [],
  emotionalRegister: "warm",
  jargonHated: [],
});

describe("assertSentenceLengthDistribution", () => {
  it("returns true when sum is exactly 100", () => {
    expect(assertSentenceLengthDistribution(validCard)).toBe(true);
  });

  it("returns true when sum is 90 (lower bound)", () => {
    const card = JSON.stringify({
      sentenceLengthDistribution: { short: 30, medium: 30, long: 30 },
    });
    expect(assertSentenceLengthDistribution(card)).toBe(true);
  });

  it("returns true when sum is 110 (upper bound)", () => {
    const card = JSON.stringify({
      sentenceLengthDistribution: { short: 40, medium: 40, long: 30 },
    });
    expect(assertSentenceLengthDistribution(card)).toBe(true);
  });

  it("returns false when sum is below 90", () => {
    const card = JSON.stringify({
      sentenceLengthDistribution: { short: 20, medium: 20, long: 20 },
    });
    expect(assertSentenceLengthDistribution(card)).toBe(false);
  });

  it("returns false when sum is above 110", () => {
    const card = JSON.stringify({
      sentenceLengthDistribution: { short: 50, medium: 50, long: 50 },
    });
    expect(assertSentenceLengthDistribution(card)).toBe(false);
  });

  it("returns false when sentenceLengthDistribution is missing", () => {
    const card = JSON.stringify({ vocabulary: ["word"] });
    expect(assertSentenceLengthDistribution(card)).toBe(false);
  });

  it("returns false when distribution values are not numbers", () => {
    const card = JSON.stringify({
      sentenceLengthDistribution: { short: "30", medium: 40, long: 30 },
    });
    expect(assertSentenceLengthDistribution(card)).toBe(false);
  });

  it("returns false for invalid JSON", () => {
    expect(assertSentenceLengthDistribution("not json")).toBe(false);
  });

  it("returns true for fenced JSON with valid distribution", () => {
    const fenced = "```json\n" + validCard + "\n```";
    expect(assertSentenceLengthDistribution(fenced)).toBe(true);
  });
});
