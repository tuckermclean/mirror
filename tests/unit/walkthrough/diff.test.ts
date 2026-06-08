import { describe, it, expect } from "vitest";
import { computeWordDiff } from "@/components/walkthrough/diff";

describe("computeWordDiff", () => {
  it("returns a single unchanged segment for identical strings", () => {
    const segs = computeWordDiff("hello world", "hello world");
    expect(segs).toEqual([{ type: "unchanged", text: "hello world" }]);
  });

  it("marks purely added text as added", () => {
    const segs = computeWordDiff("", "brand new");
    expect(segs).toEqual([{ type: "added", text: "brand new" }]);
  });

  it("marks purely removed text as removed", () => {
    const segs = computeWordDiff("gone now", "");
    expect(segs).toEqual([{ type: "removed", text: "gone now" }]);
  });

  it("detects a trailing addition while keeping the shared prefix unchanged", () => {
    const segs = computeWordDiff("lead engineer", "lead engineer at acme");
    expect(segs.some((s) => s.type === "unchanged" && s.text.includes("lead engineer"))).toBe(true);
    expect(segs.some((s) => s.type === "added" && s.text.includes("acme"))).toBe(true);
    expect(segs.some((s) => s.type === "removed")).toBe(false);
  });

  it("detects a replacement as a removal followed by an addition", () => {
    const segs = computeWordDiff("junior developer", "senior developer");
    expect(segs.some((s) => s.type === "removed" && s.text.includes("junior"))).toBe(true);
    expect(segs.some((s) => s.type === "added" && s.text.includes("senior"))).toBe(true);
    expect(segs.some((s) => s.type === "unchanged" && s.text.includes("developer"))).toBe(true);
  });

  it("reconstructs the original (before) text from unchanged+removed segments", () => {
    const before = "the quick brown fox";
    const after = "the slow brown cat";
    const segs = computeWordDiff(before, after);
    const rebuilt = segs
      .filter((s) => s.type !== "added")
      .map((s) => s.text)
      .join("");
    expect(rebuilt.replace(/\s+/g, " ").trim()).toBe(before);
  });

  it("reconstructs the new (after) text from unchanged+added segments", () => {
    const before = "the quick brown fox";
    const after = "the slow brown cat";
    const segs = computeWordDiff(before, after);
    const rebuilt = segs
      .filter((s) => s.type !== "removed")
      .map((s) => s.text)
      .join("");
    expect(rebuilt.replace(/\s+/g, " ").trim()).toBe(after);
  });
});
