/**
 * Assertion helper: validates that output is parseable JSON (after fence stripping).
 *
 * Used via file:// in evals/voice-extraction.yaml.
 * @param {string} output Raw model output.
 * @returns {boolean} true if the output is valid JSON, false otherwise.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS (.cjs) helper loaded by promptfoo; require() is the module system here.
const { stripFence } = require("./strip-fence.cjs");

/** @param {string} output */
module.exports = function assertJsonParseable(output) {
  try {
    JSON.parse(stripFence(output));
    return true;
  } catch {
    return false;
  }
};
