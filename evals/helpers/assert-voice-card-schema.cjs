/**
 * Assertion helper: validates output against VoiceCardSchema.
 *
 * Mirrors the Zod schema defined in src/lib/voice-card/schema.ts.
 * Field names are authoritative in that TypeScript file; this file
 * must stay in sync if the schema changes.
 *
 * Used via file:// in evals/voice-extraction.yaml.
 */

// FENCE_RE copied from src/lib/voice-card/fence.ts — a tracked CJS copy (cannot ESM-import the canonical module)
const FENCE_RE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i;

/** Non-empty string array predicate, mirroring z.array(z.string().min(1)). */
function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === "string" && v.length > 0);
}

/** @param {string} output */
module.exports = function assertVoiceCardSchema(output) {
  const stripped = FENCE_RE.exec(output.trim())?.[1]?.trim() ?? output.trim();
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { pass: false, score: 0, reason: "Output is not valid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { pass: false, score: 0, reason: "Output is not a JSON object" };
  }

  // vocabulary: array of non-empty strings
  if (!isNonEmptyStringArray(parsed.vocabulary)) {
    return { pass: false, score: 0, reason: "vocabulary must be an array of non-empty strings" };
  }

  // hedgesAvoided: array of non-empty strings
  if (!isNonEmptyStringArray(parsed.hedgesAvoided)) {
    return { pass: false, score: 0, reason: "hedgesAvoided must be an array of non-empty strings" };
  }

  // sentenceLengthDistribution: { short, medium, long } — 0–1 proportions summing to 1 (±0.01)
  const dist = parsed.sentenceLengthDistribution;
  if (
    typeof dist !== "object" ||
    dist === null ||
    typeof dist.short !== "number" ||
    typeof dist.medium !== "number" ||
    typeof dist.long !== "number"
  ) {
    return {
      pass: false,
      score: 0,
      reason: "sentenceLengthDistribution must be an object with numeric short/medium/long fields",
    };
  }
  for (const k of ["short", "medium", "long"]) {
    if (dist[k] < 0 || dist[k] > 1) {
      return { pass: false, score: 0, reason: `sentenceLengthDistribution.${k} must be in [0, 1]` };
    }
  }
  if (Math.abs(dist.short + dist.medium + dist.long - 1) > 0.01) {
    return {
      pass: false,
      score: 0,
      reason: "sentenceLengthDistribution short+medium+long must sum to 1 (±0.01)",
    };
  }

  // emotionalRegister: non-empty string
  if (typeof parsed.emotionalRegister !== "string" || parsed.emotionalRegister.length === 0) {
    return { pass: false, score: 0, reason: "emotionalRegister must be a non-empty string" };
  }

  // jargonHated: array of non-empty strings
  if (!isNonEmptyStringArray(parsed.jargonHated)) {
    return { pass: false, score: 0, reason: "jargonHated must be an array of non-empty strings" };
  }

  return { pass: true, score: 1, reason: "Output matches VoiceCardSchema" };
};
