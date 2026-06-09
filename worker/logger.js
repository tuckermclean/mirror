/**
 * worker/logger.js — shared structured logger for the Playwright worker.
 *
 * Writes one JSON object per line to stdout (no console.log in production).
 *
 * Security invariant: callers MUST NEVER pass the decrypted li_at session
 * cookie (or any name=value form of it) in `msg` or `meta`. Only non-sensitive
 * identifiers (userId, profileSlug, snapshotId, presence booleans) may be
 * logged.
 *
 * @param {"info"|"warn"|"error"} level
 * @param {string} msg
 * @param {Record<string, unknown>} [meta]
 */
export function log(level, msg, meta = {}) {
  process.stdout.write(JSON.stringify({ level, msg, ...meta }) + "\n");
}
