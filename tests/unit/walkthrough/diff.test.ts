import { describe, it, expect } from "vitest";
import { computeWordDiff, alignExperience } from "@/components/walkthrough/diff";
import type { ExperienceEntry } from "@/components/walkthrough/types";

function exp(
  company: string,
  title: string,
  bullets: string[] = []
): ExperienceEntry {
  return { company, title, bullets };
}

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

describe("alignExperience", () => {
  it("pairs matched entries when before and after are equal length", () => {
    const before = [exp("Acme", "Engineer"), exp("Beta", "Lead")];
    const after = [exp("Acme", "Senior Engineer"), exp("Beta", "Staff Lead")];
    const aligned = alignExperience(before, after);

    expect(aligned).toHaveLength(2);
    expect(aligned.every((p) => p.kind === "matched")).toBe(true);
    expect(aligned[0]).toMatchObject({
      kind: "matched",
      before: before[0],
      after: after[0],
    });
    expect(aligned[1]).toMatchObject({
      kind: "matched",
      before: before[1],
      after: after[1],
    });
  });

  it("marks trailing before-only entries as removed when after is shorter", () => {
    const before = [exp("Acme", "Engineer"), exp("Old Co", "Intern")];
    const after = [exp("Acme", "Senior Engineer")];
    const aligned = alignExperience(before, after);

    expect(aligned).toHaveLength(2);
    expect(aligned[0]).toMatchObject({ kind: "matched" });
    expect(aligned[1]).toMatchObject({ kind: "removed", before: before[1] });
    expect(aligned[1]!.after).toBeUndefined();
  });

  it("marks trailing after-only entries as added when after is longer", () => {
    const before = [exp("Acme", "Engineer")];
    const after = [exp("Acme", "Senior Engineer"), exp("New Co", "Founder")];
    const aligned = alignExperience(before, after);

    expect(aligned).toHaveLength(2);
    expect(aligned[0]).toMatchObject({ kind: "matched" });
    expect(aligned[1]).toMatchObject({ kind: "added", after: after[1] });
    expect(aligned[1]!.before).toBeUndefined();
  });

  it("returns an empty list when both sides are empty", () => {
    expect(alignExperience([], [])).toEqual([]);
  });

  it("marks every entry as added when before is empty", () => {
    const after = [exp("A", "x"), exp("B", "y")];
    const aligned = alignExperience([], after);
    expect(aligned).toHaveLength(2);
    expect(aligned.every((p) => p.kind === "added")).toBe(true);
  });
});
