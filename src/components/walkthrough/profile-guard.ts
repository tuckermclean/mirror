/**
 * Runtime validation for an externally-sourced profile shape.
 *
 * The parsed LinkedIn snapshot (`linkedin_snapshots.parsed`) comes from a
 * different upstream pipeline than the Zod-validated AI output, so shape drift
 * would otherwise throw client-side when the walkthrough renders it. This guard
 * validates the snapshot against the local `GeneratedProfile` contract before it
 * is trusted. It is deliberately self-contained — it does NOT import from
 * `src/lib/generation/` (that module is built in parallel and may be absent).
 */

import type {
  EducationEntry,
  ExperienceEntry,
  GeneratedProfile,
} from "./types";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isExperienceEntry(value: unknown): value is ExperienceEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.company === "string" &&
    typeof entry.title === "string" &&
    isStringArray(entry.bullets)
  );
}

function isEducationEntry(value: unknown): value is EducationEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.school === "string" && typeof entry.degree === "string";
}

/**
 * Type guard for the `GeneratedProfile` contract. Returns true only when every
 * field is present and well-typed, so callers can safely narrow an `unknown`
 * value (e.g. `snapshot.parsed`) without an unchecked cast.
 */
export function isGeneratedProfile(value: unknown): value is GeneratedProfile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.headline === "string" &&
    typeof profile.about === "string" &&
    Array.isArray(profile.experience) &&
    profile.experience.every(isExperienceEntry) &&
    Array.isArray(profile.education) &&
    profile.education.every(isEducationEntry) &&
    isStringArray(profile.skills)
  );
}
