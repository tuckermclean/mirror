import { z } from "zod";
import type { Result } from "@/lib/errors";

/**
 * CANONICAL generation data contract.
 *
 * The frontend walkthrough specialist builds to the IDENTICAL shapes below.
 * Do not deviate without coordinating that change — these are stored verbatim
 * in `generations.output` (the "after") and `generations.rationale`.
 *
 * `GeneratedProfile` is intentionally field-compatible with the
 * `linkedinSnapshots.parsed` shape (the "before") so the diff view can compare
 * them key-for-key: headline, about, experience, education, skills.
 */

// ---------------------------------------------------------------------------
// GeneratedProfile — generations.output
// ---------------------------------------------------------------------------

export const experienceEntrySchema = z.object({
  company: z.string(),
  title: z.string(),
  bullets: z.array(z.string()),
});

export const educationEntrySchema = z.object({
  school: z.string(),
  degree: z.string(),
});

export const generatedProfileSchema = z.object({
  headline: z.string(),
  about: z.string(),
  experience: z.array(experienceEntrySchema),
  education: z.array(educationEntrySchema),
  skills: z.array(z.string()),
});

export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;
export type EducationEntry = z.infer<typeof educationEntrySchema>;
export type GeneratedProfile = z.infer<typeof generatedProfileSchema>;

// ---------------------------------------------------------------------------
// RationaleBundle — generations.rationale
// ---------------------------------------------------------------------------

export const recruiterEyeSectionSchema = z.enum([
  "headline",
  "about",
  "experience",
  "skills",
]);

export const recruiterEyeItemSchema = z.object({
  rank: z.number().int().positive(),
  observation: z.string(),
  section: recruiterEyeSectionSchema,
});

const confidenceScore = z.number().int().min(0).max(100);

export const confidenceSchema = z.object({
  headline: confidenceScore,
  about: confidenceScore,
  experience: confidenceScore,
  skills: confidenceScore,
});

export const rationaleBundleSchema = z.object({
  headline: z.string(),
  about: z.string(),
  // One sentence per experience entry, index-aligned with output.experience.
  experience: z.array(z.string()),
  skills: z.string(),
  recruiterEye: z.array(recruiterEyeItemSchema),
  confidence: confidenceSchema,
});

export type RecruiterEyeSection = z.infer<typeof recruiterEyeSectionSchema>;
export type RecruiterEyeItem = z.infer<typeof recruiterEyeItemSchema>;
export type RationaleBundle = z.infer<typeof rationaleBundleSchema>;

// ---------------------------------------------------------------------------
// Typed parse errors + helpers
// ---------------------------------------------------------------------------

import type { ZodIssue } from "zod";

export type GenerationParseError =
  | { kind: "invalid_json"; raw: string }
  | { kind: "schema_mismatch"; issues: ZodIssue[] };

/**
 * Strip an optional ```json … ``` markdown fence and parse JSON.
 * Models occasionally wrap output in a fence despite "raw JSON only".
 */
function parseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced?.[1] ?? raw;
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch {
    return { ok: false };
  }
}

function parseWith<T>(
  schema: z.ZodType<T>,
  raw: string
): Result<T, GenerationParseError> {
  const json = parseJson(raw);
  if (!json.ok) return { ok: false, error: { kind: "invalid_json", raw } };

  const parsed = schema.safeParse(json.value);
  if (!parsed.success) {
    return { ok: false, error: { kind: "schema_mismatch", issues: parsed.error.issues } };
  }
  return { ok: true, value: parsed.data };
}

/** Parse + validate the LLM's profile JSON into a typed GeneratedProfile. */
export function parseGeneratedProfile(
  raw: string
): Result<GeneratedProfile, GenerationParseError> {
  return parseWith(generatedProfileSchema, raw);
}

/** Parse + validate the LLM's rationale JSON into a typed RationaleBundle. */
export function parseRationaleBundle(
  raw: string
): Result<RationaleBundle, GenerationParseError> {
  return parseWith(rationaleBundleSchema, raw);
}
