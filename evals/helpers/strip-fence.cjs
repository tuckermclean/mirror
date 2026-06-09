/**
 * Shared fence-stripping helper for promptfoo JS assertions.
 *
 * A single source of truth for the markdown code-fence regex so it is not
 * duplicated across inline `type: javascript` assertions and the other CJS
 * assertion helpers. Used via require() from evals/voice-extraction.yaml and
 * evals/helpers/assert-voice-card-schema.cjs.
 */

/** Matches an optionally json-tagged ```fenced``` block, capturing its body. */
const FENCE_RE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;

/**
 * Strip a surrounding markdown code fence (if present) and trim.
 * @param {string} output Raw model output.
 * @returns {string} The fenced body, or the trimmed input when unfenced.
 */
function stripFence(output) {
  const trimmed = String(output).trim();
  return FENCE_RE.exec(trimmed)?.[1]?.trim() ?? trimmed;
}

module.exports = { FENCE_RE, stripFence };
