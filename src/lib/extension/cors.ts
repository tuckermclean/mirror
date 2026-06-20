/**
 * CORS posture for the Chrome-extension API surface.
 *
 * The only cross-origin caller we permit is the Mirror Chrome extension's
 * background service worker, whose `Origin` header is `chrome-extension://<id>`.
 * We never reply with `Access-Control-Allow-Origin: *` — a wildcard is
 * incompatible with `Access-Control-Allow-Credentials: true` (the browser
 * refuses to send the Clerk cookie / Bearer token to a wildcard origin) and
 * would also let any extension or site read authenticated responses.
 *
 * Instead we *reflect* the request `Origin` back only when it matches the
 * allow-list of extension IDs (THREAT_MODEL.md §6.6 — host access is scoped
 * strictly; the same spirit applies to the API's CORS allow-list). Reflection
 * keeps the response locked to exactly one origin per request while letting the
 * extension ID vary per environment (dev unpacked id vs. published Web Store id)
 * without code changes.
 *
 * Configure the allowed extension origins via `EXTENSION_ALLOWED_ORIGINS`
 * (comma-separated, e.g. `chrome-extension://aaaa...,chrome-extension://bbbb...`).
 * When unset we fall back to accepting any well-formed `chrome-extension://`
 * origin in non-production only; in production an empty allow-list denies all
 * cross-origin callers (fail-closed).
 */

import { logger } from "@/lib/logger";

// A Chrome extension ID is 32 chars drawn from the alphabet `a`–`p`: the Web
// Store derives it by mapping the extension's public-key hash from base-16
// (0–f) onto the letters a–p, so `[a-p]{32}` matches exactly that ID character
// set. (Firefox/Edge use different ID formats; this surface is Chrome-only.)
const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

/**
 * Memoized parse of the allow-list. `configuredOrigins()` is consulted on every
 * request, but the parse only depends on `EXTENSION_ALLOWED_ORIGINS` (and, for
 * the fail-closed warning, `NODE_ENV`), which are fixed for the process lifetime
 * in any real deployment. We cache the parsed result and the env values it was
 * derived from; if either env value changes (e.g. between tests) the cache is
 * recomputed so behavior stays identical to re-parsing on every call. This keeps
 * the string splitting and the `logger.warn` calls off the per-request hot path.
 *
 * Scope: this cache is process-local — it lives in module state and is therefore
 * held independently per Node.js worker process, recomputed only on a cache miss
 * within that process. It is not shared across processes and never persisted.
 */
let cache:
  | { rawOrigins: string | undefined; nodeEnv: string | undefined; origins: string[] }
  | undefined;

/** Parse the comma-separated allow-list from the environment (memoized). */
function configuredOrigins(): string[] {
  const rawOrigins = process.env["EXTENSION_ALLOWED_ORIGINS"];
  const nodeEnv = process.env["NODE_ENV"];
  if (cache && cache.rawOrigins === rawOrigins && cache.nodeEnv === nodeEnv) {
    return cache.origins;
  }

  const origins = (rawOrigins ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
    .filter((o) => {
      if (CHROME_EXTENSION_ORIGIN.test(o)) return true;
      logger.warn("cors: skipping invalid EXTENSION_ALLOWED_ORIGINS entry", {
        entry: o,
      });
      return false;
    });

  // Operability: in production an empty allow-list silently denies *all*
  // cross-origin extension callers (fail-closed). Surface that once so a
  // misconfigured deploy is diagnosable from the logs rather than only via a
  // mysterious CORS failure in the browser.
  if (origins.length === 0 && nodeEnv === "production") {
    logger.warn(
      "cors: EXTENSION_ALLOWED_ORIGINS is empty in production — all " +
        "cross-origin extension requests will be denied (fail-closed)"
    );
  }

  // Note: this warning fires once per cache miss. In test environments where env
  // values oscillate between test cases the log can appear more than once per
  // process; that is expected behavior, not a bug. Use clearConfiguredOriginsCache()
  // in afterEach to avoid spurious log output in test suites.

  cache = { rawOrigins, nodeEnv, origins };
  return origins;
}

/**
 * Reset the memoized allow-list cache.
 *
 * TEST-ONLY SEAM. This is exported solely so test files can reset module state
 * between cases; it is imported by `tests/unit/extension/cors.test.ts` and is
 * not part of the request path (no production code calls it). Calling it is a
 * harmless, idempotent reset — it only clears the memo, so the next call to
 * `configuredOrigins()` simply re-parses the env. There is deliberately no
 * NODE_ENV guard: it must stay a no-op-safe reset that can never throw if reached
 * in any environment.
 *
 * Intended for test isolation only — call in afterEach (or beforeEach) to
 * ensure that env changes made by one test do not bleed into the next test
 * through a stale cached result.
 */
export function clearConfiguredOriginsCache(): void {
  cache = undefined;
}

/**
 * Decide whether a request `Origin` is an allowed extension origin.
 *
 * Returns the origin to reflect, or `null` to send no CORS headers at all
 * (which causes the browser to block a cross-origin reader — fail-closed).
 */
export function resolveAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  const allow = configuredOrigins();
  if (allow.length > 0) return allow.includes(origin) ? origin : null;

  // No explicit allow-list configured. Accept any well-formed extension origin
  // only outside production; deny everything in production (fail-closed).
  if (process.env["NODE_ENV"] === "production") return null;
  return CHROME_EXTENSION_ORIGIN.test(origin) ? origin : null;
}

/**
 * Build the CORS headers for a given request origin. When the origin is not an
 * allowed extension origin, returns an empty object so no allow-origin header
 * is emitted (the browser then blocks any cross-origin read).
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = resolveAllowedOrigin(origin);
  if (!allowed) return {};
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
