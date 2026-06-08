import type { Result } from "@/lib/errors";
import {
  parseRationaleBundle,
  type GenerationParseError,
  type RationaleBundle,
} from "@/lib/generation/schema";

/**
 * Assemble the canonical RationaleBundle from the LLM's rationale JSON response.
 *
 * Two normalisations are applied so the bundle is safe for the walkthrough:
 *  1. recruiterEye observations are sorted by ascending rank (the "what jumps
 *     out first" ordering the UI renders top-to-bottom).
 *  2. The per-experience rationale array is forced to `experienceCount` length —
 *     padded with "" or truncated — so it stays index-aligned with
 *     output.experience even if the model returned the wrong number of entries.
 *
 * Returns a typed Result; parse/schema failures propagate unchanged.
 */
export function assembleRationaleBundle(
  raw: string,
  experienceCount: number
): Result<RationaleBundle, GenerationParseError> {
  const parsed = parseRationaleBundle(raw);
  if (!parsed.ok) return parsed;

  const bundle = parsed.value;
  return {
    ok: true,
    value: {
      ...bundle,
      experience: alignExperience(bundle.experience, experienceCount),
      recruiterEye: [...bundle.recruiterEye].sort((a, b) => a.rank - b.rank),
    },
  };
}

/** Pad with "" or truncate so the rationale array matches the entry count. */
function alignExperience(rationale: string[], count: number): string[] {
  if (rationale.length === count) return rationale;
  if (rationale.length > count) return rationale.slice(0, count);
  return [...rationale, ...Array(count - rationale.length).fill("")];
}
