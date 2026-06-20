/**
 * logger — tiny structured logger for the extension.
 *
 * AGENTS.md forbids `console.log` in committed code. The extension cannot import
 * the app's `src/lib/logger.ts` (separate package, browser context), so we keep
 * a minimal local logger that only uses `console.warn` / `console.error`.
 */
const PREFIX = "[mirror]";

// console.info/warn/error are the intended sinks here: AGENTS.md forbids
// console.log specifically, but these leveled methods are the correct way to
// surface diagnostics in the extension's devtools console.
export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.info(PREFIX, message, meta ?? {});
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(PREFIX, message, meta ?? {});
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(PREFIX, message, meta ?? {});
  },
};
