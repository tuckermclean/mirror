/**
 * Assertion helper: validates output against VoiceCardSchema.
 *
 * Mirrors the Zod schema defined in src/lib/voice-card/schema.ts.
 * Field names are authoritative in that TypeScript file; this file
 * must stay in sync if the schema changes.
 *
 * Used via file:// in evals/voice-extraction.yaml.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS (.cjs) helper loaded by promptfoo; require() is the module system here.
const { stripFence } = require("./strip-fence.cjs");

/** @param {string} output */
module.exports = function assertVoiceCardSchema(output) {
  const stripped = stripFence(output);
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { pass: false, score: 0, reason: "Output is not valid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { pass: false, score: 0, reason: "Output is not a JSON object" };
  }

  // vocabulary: string[]
  if (!Array.isArray(parsed.vocabulary) || !parsed.vocabulary.every((v) => typeof v === "string")) {
    return { pass: false, score: 0, reason: "vocabulary must be an array of strings" };
  }

  // hedgesAvoided: string[]
  if (!Array.isArray(parsed.hedgesAvoided) || !parsed.hedgesAvoided.every((v) => typeof v === "string")) {
    return { pass: false, score: 0, reason: "hedgesAvoided must be an array of strings" };
  }

  // sentenceLengthDistribution: { short: number, medium: number, long: number }
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

  // emotionalRegister: string
  if (typeof parsed.emotionalRegister !== "string") {
    return { pass: false, score: 0, reason: "emotionalRegister must be a string" };
  }

  // jargonHated: string[]
  if (!Array.isArray(parsed.jargonHated) || !parsed.jargonHated.every((v) => typeof v === "string")) {
    return { pass: false, score: 0, reason: "jargonHated must be an array of strings" };
  }

  return { pass: true, score: 1, reason: "Output matches VoiceCardSchema" };
};
