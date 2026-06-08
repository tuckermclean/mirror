/**
 * Assertion helper: validates that vocabulary array length is in [1, 30].
 *
 * Used via file:// in evals/voice-extraction.yaml.
 * @param {string} output Raw model output.
 * @returns {boolean} true if vocabulary has 1–30 entries, false otherwise.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS (.cjs) helper loaded by promptfoo; require() is the module system here.
const { stripFence } = require("./strip-fence.cjs");

/** @param {string} output */
module.exports = function assertVocabularyLength(output) {
  try {
    const parsed = JSON.parse(stripFence(output));
    const len = Array.isArray(parsed.vocabulary) ? parsed.vocabulary.length : -1;
    return len >= 1 && len <= 30;
  } catch {
    return false;
  }
};
