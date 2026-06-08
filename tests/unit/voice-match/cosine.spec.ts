import { describe, it, expect } from "vitest";
import { cosineSimilarity } from "@/lib/voice-match/cosine";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3, 4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("is symmetric", () => {
    const a = [0.2, 0.9, -0.3];
    const b = [0.7, -0.1, 0.5];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it("returns 0 when either vector is all zeros (degenerate, no NaN)", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it("throws a typed error on length mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrowError(
      /dimension/i,
    );
  });
});
