/**
 * Unit tests for evals/helpers/assert-vocabulary-length.cjs
 *
 * Covers the vocabulary length check used by promptfoo JS assertions in
 * evals/voice-extraction.yaml.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

// assert-vocabulary-length.cjs is a CommonJS module; use createRequire so Vitest (ESM) can load it.
const require = createRequire(import.meta.url);
const assertVocabularyLength = require("../../../evals/helpers/assert-vocabulary-length.cjs") as (
  output: string,
) => boolean;

describe("assertVocabularyLength", () => {
  it("returns true for vocabulary with 1 entry (lower bound)", () => {
    const card = JSON.stringify({ vocabulary: ["word"] });
    expect(assertVocabularyLength(card)).toBe(true);
  });

  it("returns true for vocabulary with 30 entries (upper bound)", () => {
    const card = JSON.stringify({ vocabulary: Array(30).fill("word") });
    expect(assertVocabularyLength(card)).toBe(true);
  });

  it("returns true for vocabulary with 15 entries (mid range)", () => {
    const card = JSON.stringify({ vocabulary: Array(15).fill("word") });
    expect(assertVocabularyLength(card)).toBe(true);
  });

  it("returns false for empty vocabulary", () => {
    const card = JSON.stringify({ vocabulary: [] });
    expect(assertVocabularyLength(card)).toBe(false);
  });

  it("returns false for vocabulary with 31 entries (over upper bound)", () => {
    const card = JSON.stringify({ vocabulary: Array(31).fill("word") });
    expect(assertVocabularyLength(card)).toBe(false);
  });

  it("returns false when vocabulary is not an array", () => {
    const card = JSON.stringify({ vocabulary: "not an array" });
    expect(assertVocabularyLength(card)).toBe(false);
  });

  it("returns false when vocabulary is missing", () => {
    const card = JSON.stringify({ otherField: "value" });
    expect(assertVocabularyLength(card)).toBe(false);
  });

  it("returns false for invalid JSON", () => {
    expect(assertVocabularyLength("not json")).toBe(false);
  });

  it("returns true for fenced JSON with valid vocabulary", () => {
    const card = JSON.stringify({ vocabulary: Array(10).fill("word") });
    const fenced = "```json\n" + card + "\n```";
    expect(assertVocabularyLength(fenced)).toBe(true);
  });
});
