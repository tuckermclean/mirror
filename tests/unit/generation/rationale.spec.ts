/**
 * Unit tests for src/lib/generation/rationale.ts — RED first per TDD.
 *
 * The rationale bundle is produced from a single LLM JSON response. This module
 * parses + validates that response into the canonical RationaleBundle, and keeps
 * the recruiter-eye list ranked and index-aligned to the rewritten experience
 * entries. No network — pure assembly from a string.
 */
import { describe, it, expect } from "vitest";
import {
  parseRationaleBundle,
  rationaleBundleSchema,
  type RationaleBundle,
} from "@/lib/generation/schema";
import { assembleRationaleBundle } from "@/lib/generation/rationale";

const wellFormed: RationaleBundle = {
  headline: "Leads with the outcome a recruiter scans for first.",
  about: "Opens with a concrete value statement in the person's own voice.",
  experience: ["Quantifies the impact instead of listing responsibilities."],
  skills: "Front-loads the in-demand platform skills recruiters filter on.",
  recruiterEye: [
    { rank: 2, observation: "Skills list is scannable.", section: "skills" },
    { rank: 1, observation: "'Cut MTTR 40%' is the first number that lands.", section: "experience" },
  ],
  confidence: { headline: 90, about: 80, experience: 75, skills: 60 },
};

describe("parseRationaleBundle", () => {
  it("parses a valid bundle JSON string", () => {
    const res = parseRationaleBundle(JSON.stringify(wellFormed));
    expect(res.ok).toBe(true);
  });

  it("returns invalid_json for non-JSON", () => {
    const res = parseRationaleBundle("nope");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("invalid_json");
  });

  it("returns schema_mismatch for a structurally wrong bundle", () => {
    const res = parseRationaleBundle(JSON.stringify({ headline: "x" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("schema_mismatch");
  });
});

describe("assembleRationaleBundle", () => {
  it("returns a schema-valid bundle from a valid LLM response", () => {
    const res = assembleRationaleBundle(JSON.stringify(wellFormed), 1);
    expect(res.ok).toBe(true);
    if (res.ok) expect(rationaleBundleSchema.safeParse(res.value).success).toBe(true);
  });

  it("sorts recruiterEye observations by ascending rank", () => {
    const res = assembleRationaleBundle(JSON.stringify(wellFormed), 1);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const ranks = res.value.recruiterEye.map((o) => o.rank);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      expect(res.value.recruiterEye[0]?.rank).toBe(1);
    }
  });

  it("pads experience rationale to match the experience count", () => {
    // Two experience entries in the profile, but the model only returned one.
    const res = assembleRationaleBundle(JSON.stringify(wellFormed), 2);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.experience).toHaveLength(2);
  });

  it("truncates experience rationale to match the experience count", () => {
    const overlong: RationaleBundle = {
      ...wellFormed,
      experience: ["one", "two", "three"],
    };
    const res = assembleRationaleBundle(JSON.stringify(overlong), 1);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.experience).toHaveLength(1);
  });

  it("propagates a parse failure", () => {
    const res = assembleRationaleBundle("not json", 1);
    expect(res.ok).toBe(false);
  });
});
