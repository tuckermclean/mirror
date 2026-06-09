/**
 * Unit tests for evals/helpers/strip-fence.cjs
 *
 * Covers the FENCE_RE regex and stripFence() helper used by promptfoo
 * JS assertions in evals/voice-extraction.yaml.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

// strip-fence.cjs is a CommonJS module; use createRequire so Vitest (ESM) can load it.
const require = createRequire(import.meta.url);
const { FENCE_RE, stripFence } = require("../../../evals/helpers/strip-fence.cjs") as {
  FENCE_RE: RegExp;
  stripFence: (output: unknown) => string;
};

describe("FENCE_RE", () => {
  it("matches a ```json fenced block", () => {
    const input = "```json\n{\"key\": \"value\"}\n```";
    const match = FENCE_RE.exec(input);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('{"key": "value"}');
  });

  it("matches a plain ``` fenced block", () => {
    const input = "```\nhello world\n```";
    const match = FENCE_RE.exec(input);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("hello world");
  });

  it("does not match unfenced text", () => {
    expect(FENCE_RE.exec("just plain text")).toBeNull();
  });
});

describe("stripFence", () => {
  it("passes through unfenced input trimmed", () => {
    expect(stripFence("  hello world  ")).toBe("hello world");
  });

  it("strips a ```json ... ``` fence", () => {
    const fenced = "```json\n{\"name\": \"Alice\"}\n```";
    expect(stripFence(fenced)).toBe('{"name": "Alice"}');
  });

  it("strips a plain ``` ... ``` fence", () => {
    const fenced = "```\nsome content\n```";
    expect(stripFence(fenced)).toBe("some content");
  });

  it("coerces non-string input via String()", () => {
    // Numbers, booleans, etc. should be coerced without throwing
    expect(stripFence(42)).toBe("42");
    expect(stripFence(true)).toBe("true");
    expect(stripFence(null)).toBe("null");
  });
});
