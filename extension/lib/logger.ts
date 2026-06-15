/**
 * logger — tiny structured logger for the extension.
 *
 * AGENTS.md forbids `console.log` in committed code. The extension cannot import
 * the app's `src/lib/logger.ts` (separate package, browser context), so we keep
 * a minimal local logger that only uses `console.warn` / `console.error`.
 */
const PREFIX = "[mirror]";

export const logger = {
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(PREFIX, message, meta ?? {});
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(PREFIX, message, meta ?? {});
  },
};
