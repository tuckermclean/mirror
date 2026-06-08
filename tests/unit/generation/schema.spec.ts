/**
 * Unit tests for src/lib/generation/schema.ts — RED first per TDD.
 *
 * Locks the CANONICAL data contract shared with the frontend specialist:
 *   - GeneratedProfile  (stored in generations.output, the "after")
 *   - RationaleBundle   (stored in generations.rationale)
 *
 * These tests assert that the Zod schemas accept well-formed payloads and
 * reject malformed ones, and that parse helpers surface typed failures rather
 * than throwing naked errors.
 */
import { describe, it, expect } from "vitest";
import {
  generatedProfileSchema,
  rationaleBundleSchema,
  parseGeneratedProfile,
  type GeneratedProfile,
  type RationaleBundle,
} from "@/lib/generation/schema";

const validProfile: GeneratedProfile = {
  headline: "Platform Engineer · Making infra invisible",
  about: "I keep the lights on so product teams never have to think about infra.",
  experience: [
    { company: "Synthwave Systems", title: "Senior SRE", bullets: ["Cut MTTR 40%"] },
  ],
  education: [{ school: "State University", degree: "BS Computer Science" }],
  skills: ["Kubernetes", "Observability"],
};

const validRationale: RationaleBundle = {
  headline: "Leads with the outcome a recruiter scans for first.",
  about: "Opens with a concrete value statement in the person's own voice.",
  experience: ["Quantifies the impact instead of listing responsibilities."],
  skills: "Front-loads the in-demand platform skills recruiters filter on.",
  recruiterEye: [
    { rank: 1, observation: "'Cut MTTR 40%' is the first number that lands.", section: "experience" },
  ],
  confidence: { headline: 90, about: 80, experience: 75, skills: 60 },
};

describe("generatedProfileSchema", () => {
  it("accepts a well-formed GeneratedProfile", () => {
    expect(generatedProfileSchema.parse(validProfile)).toEqual(validProfile);
  });

  it("rejects a profile missing the headline", () => {
    const bad = { ...validProfile } as Record<string, unknown>;
    delete bad["headline"];
    expect(generatedProfileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an experience entry whose bullets are not strings", () => {
    const bad = {
      ...validProfile,
      experience: [{ company: "X", title: "Y", bullets: [123] }],
    };
    expect(generatedProfileSchema.safeParse(bad).success).toBe(false);
  });

  it("is field-compatible with the linkedinSnapshots.parsed shape", () => {
    // The "before" (snapshot.parsed) uses the same keys; a snapshot-shaped
    // object must validate as a GeneratedProfile.
    const snapshotParsed = {
      headline: "Senior SRE",
      about: "I keep the lights on.",
      experience: [{ company: "Synthwave", title: "SRE", bullets: ["Reduced MTTR"] }],
      education: [{ school: "State U", degree: "BS CS" }],
      skills: ["SRE"],
    };
    expect(generatedProfileSchema.safeParse(snapshotParsed).success).toBe(true);
  });

  it("strips extra keys the LLM may output (featured, inline rationale) — these fields have no consumer", () => {
    // The generation prompt must NOT ask the LLM to output `featured` or an
    // inline `rationale` object: Zod silently strips unknown keys, so they
    // would be wasted tokens that never reach storage. This test documents the
    // schema as the source of truth — the prompt must match it.
    const withExtras = {
      ...validProfile,
      featured: ["My cool project"],
      rationale: { headline: "because it's good", about: "voice match" },
    };
    const result = generatedProfileSchema.parse(withExtras);
    expect(result).not.toHaveProperty("featured");
    expect(result).not.toHaveProperty("rationale");
    expect(Object.keys(result)).toEqual(["headline", "about", "experience", "education", "skills"]);
  });
});

describe("rationaleBundleSchema", () => {
  it("accepts a well-formed RationaleBundle", () => {
    expect(rationaleBundleSchema.parse(validRationale)).toEqual(validRationale);
  });

  it("rejects a recruiterEye section outside the allowed enum", () => {
    const bad = {
      ...validRationale,
      recruiterEye: [{ rank: 1, observation: "x", section: "featured" }],
    };
    expect(rationaleBundleSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a confidence score outside 0-100", () => {
    const bad = {
      ...validRationale,
      confidence: { headline: 120, about: 80, experience: 75, skills: 60 },
    };
    expect(rationaleBundleSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-integer confidence score", () => {
    const bad = {
      ...validRationale,
      confidence: { headline: 90.5, about: 80, experience: 75, skills: 60 },
    };
    expect(rationaleBundleSchema.safeParse(bad).success).toBe(false);
  });
});

describe("parseGeneratedProfile", () => {
  it("returns ok:true with the parsed value for valid JSON", () => {
    const res = parseGeneratedProfile(JSON.stringify(validProfile));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.headline).toBe(validProfile.headline);
  });

  it("returns ok:false with invalid_json for non-JSON input", () => {
    const res = parseGeneratedProfile("not json {");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("invalid_json");
  });

  it("tolerates a markdown-fenced JSON object", () => {
    const fenced = "```json\n" + JSON.stringify(validProfile) + "\n```";
    const res = parseGeneratedProfile(fenced);
    expect(res.ok).toBe(true);
  });

  it("returns ok:false with schema_mismatch for valid JSON that violates the schema", () => {
    const res = parseGeneratedProfile(JSON.stringify({ headline: "only this" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("schema_mismatch");
  });
});
