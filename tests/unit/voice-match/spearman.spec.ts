import { describe, it, expect } from "vitest";
import { spearman } from "@/lib/voice-match/spearman";

describe("spearman", () => {
  it("returns 1 for a perfectly monotonic increasing relationship", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
  });

  it("returns 1 even when not linear, as long as rank order matches", () => {
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1, 10);
  });

  it("returns -1 for a perfectly monotonic decreasing relationship", () => {
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 10);
  });

  it("handles tied ranks via average ranking", () => {
    // x = [1,1,2,2], y = [1,1,2,2] -> perfect rank agreement.
    expect(spearman([1, 1, 2, 2], [5, 5, 9, 9])).toBeCloseTo(1, 10);
  });

  it("throws on length mismatch", () => {
    expect(() => spearman([1, 2], [1, 2, 3])).toThrowError(/length/i);
  });

  it("throws on fewer than two points", () => {
    expect(() => spearman([1], [1])).toThrowError(/at least/i);
  });
});
