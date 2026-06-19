/**
 * logger — tiny structured logger for the extension.
 *
 * AGENTS.md forbids `console.log` in app code under `src/`. The extension is a
 * separate package running in a browser/devtools context and cannot import the
 * app's `src/lib/logger.ts`, so we keep a minimal local logger. It maps onto the
 * browser console's leveled methods (`console.info` / `console.warn` /
 * `console.error`) so events show up under the matching devtools filter.
 */
const PREFIX = "[mirror]";

export const logger = {
  /** Informational, non-error events (lifecycle, expected state changes). */
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
