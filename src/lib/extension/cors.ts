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

const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

/** Parse the comma-separated allow-list from the environment. */
function configuredOrigins(): string[] {
  return (process.env["EXTENSION_ALLOWED_ORIGINS"] ?? "")
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
