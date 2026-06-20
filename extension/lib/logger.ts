/**
 * logger — tiny structured logger for the extension.
 *
 * AGENTS.md requires the app's production code to route diagnostics through the
 * structured logger in `src/lib/logger.ts` (where `console.log` is a lint
 * error). The extension is a separate browser package that cannot import that
 * logger, so we keep a minimal local one using leveled `console` methods.
 */
const PREFIX = "[mirror]";

// console.info/warn/error are the intended sinks here: leveled console methods
// are the correct way to surface diagnostics in the extension's devtools
// console, mirroring the app's structured-logging convention.
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
