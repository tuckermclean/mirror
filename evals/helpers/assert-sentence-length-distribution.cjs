/**
 * Assertion helper: validates that sentenceLengthDistribution sums to 90–110.
 *
 * Checks that the parsed VoiceCard's sentenceLengthDistribution has numeric
 * short/medium/long fields whose sum falls in [90, 110].
 *
 * Used via file:// in evals/voice-extraction.yaml.
 * @param {string} output Raw model output.
 * @returns {boolean} true if the distribution sum is in range, false otherwise.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS (.cjs) helper loaded by promptfoo; require() is the module system here.
const { stripFence } = require("./strip-fence.cjs");

/** @param {string} output */
module.exports = function assertSentenceLengthDistribution(output) {
  try {
    const parsed = JSON.parse(stripFence(output));
    const dist = parsed.sentenceLengthDistribution;
    if (!dist || typeof dist !== "object") return false;
    const { short, medium, long } = dist;
    if (typeof short !== "number" || typeof medium !== "number" || typeof long !== "number") return false;
    const sum = short + medium + long;
    return sum >= 90 && sum <= 110;
  } catch {
    return false;
  }
};
