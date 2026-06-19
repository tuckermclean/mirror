/**
 * Shared fence-stripping helper for promptfoo JS assertions.
 *
 * A single source of truth for the markdown code-fence regex so it is not
 * duplicated across inline `type: javascript` assertions and the other CJS
 * assertion helpers. Used via require() from evals/voice-extraction.yaml and
 * evals/helpers/assert-voice-card-schema.cjs.
 *
 * FENCE_RE copied from src/lib/voice-card/fence.ts (canonical source).
 * That file is the single documented source of truth; this CJS copy exists
 * because promptfoo assertion helpers cannot ESM-import TypeScript modules.
 * If fence.ts changes, update this file too and the tests in
 * tests/unit/voice-card/assert-cjs-drift.spec.ts will catch any drift.
 */

/**
 * Matches an optionally json-tagged ```fenced``` block, capturing its body.
 *
 * Language-tag scope: only strips untagged fences (```) and ```json fences.
 * Non-json language tags (```ts, ```yaml, …) are left intact — intentional,
 * because voice-extraction outputs should never be fenced with a non-JSON tag;
 * leaving them intact surfaces the problem rather than silently mangling output.
 *
 * Trailing-space safety: the `\s*$` at the end of the closing fence tolerates
 * trailing whitespace on that line.  This is safe because `stripFence` calls
 * `String(output).trim()` before `exec()`, so any leading/trailing whitespace
 * on the whole string is already removed before the regex runs.
 */
const FENCE_RE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i;

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
