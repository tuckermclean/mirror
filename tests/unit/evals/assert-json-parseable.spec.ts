/**
 * Unit tests for evals/helpers/assert-json-parseable.cjs
 *
 * Covers the JSON parse check used by promptfoo JS assertions in
 * evals/voice-extraction.yaml.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

// assert-json-parseable.cjs is a CommonJS module; use createRequire so Vitest (ESM) can load it.
const require = createRequire(import.meta.url);
const assertJsonParseable = require("../../../evals/helpers/assert-json-parseable.cjs") as (
  output: string,
) => boolean;

describe("assertJsonParseable", () => {
  it("returns true for valid JSON string", () => {
    expect(assertJsonParseable('{"key": "value"}')).toBe(true);
  });

  it("returns true for fenced JSON", () => {
    expect(assertJsonParseable('```json\n{"key": "value"}\n```')).toBe(true);
  });

  it("returns true for plain fenced JSON", () => {
    expect(assertJsonParseable('```\n{"key": "value"}\n```')).toBe(true);
  });

  it("returns false for non-JSON output", () => {
    expect(assertJsonParseable("this is not json")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(assertJsonParseable("")).toBe(false);
  });

  it("returns false for malformed JSON", () => {
    expect(assertJsonParseable('{"key": }}')).toBe(false);
  });
});
