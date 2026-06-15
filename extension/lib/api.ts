/**
 * api — typed client for Mirror's backend, as consumed by the extension.
 *
 * Contract (owned by the backend / security engineer — we only CONSUME it):
 *   POST /api/extension/voice-match
 *   Request:  { profileText: string }
 *   200 { score: number /*0-100*\/, components: { cosine: number; feature: number } }
 *   400 { error: string }
 *   401 { error: "unauthorized" }
 *   402 { error: "monthly_cap_reached" }
 *   404 { error: "user_not_found" }
 *   409 { error: "missing_voice_embedding" }
 */

/**
 * Base URL for the Mirror backend. Must be set via `PLASMO_PUBLIC_API_BASE` at
 * build time. In development it falls back to localhost. In production, an
 * unset env var is a build-time error — we throw rather than silently sending
 * `credentials: "include"` requests to an arbitrary local service on port 3000.
 */
function resolveApiBase(): string {
  const envBase =
    typeof process !== "undefined" ? process.env?.PLASMO_PUBLIC_API_BASE : undefined;
  if (envBase) return envBase;

  // Allow localhost in development (NODE_ENV !== "production").
  const isProd =
    typeof process !== "undefined" && process.env?.NODE_ENV === "production";
  if (isProd) {
    throw new Error(
      "[mirror] PLASMO_PUBLIC_API_BASE must be set for production builds. " +
        "Refusing to default to localhost — this would leak session cookies.",
    );
  }
  return "http://localhost:3000";
}

export const API_BASE: string = resolveApiBase();

export interface VoiceMatchComponents {
  cosine: number;
  feature: number;
}

export interface VoiceMatchSuccess {
  score: number;
  components: VoiceMatchComponents;
}

/** Non-200 HTTP codes the contract defines, plus "network" for transport errors. */
export type VoiceMatchErrorCode = 400 | 401 | 402 | 404 | 409 | "network";

export type VoiceMatchResult =
  | { ok: true; data: VoiceMatchSuccess }
  | { ok: false; code: VoiceMatchErrorCode; error: string };

const KNOWN_ERROR_CODES: ReadonlySet<number> = new Set([400, 401, 402, 404, 409]);

function toErrorCode(status: number): VoiceMatchErrorCode {
  return KNOWN_ERROR_CODES.has(status)
    ? (status as VoiceMatchErrorCode)
    : "network";
}

/**
 * POST the concatenated profile text to the voice-match endpoint.
 * Returns a typed Result — never throws for HTTP errors; transport failures
 * collapse to `{ ok: false, code: "network" }`.
 */
export async function getVoiceMatch(
  profileText: string,
  init?: { fetchImpl?: typeof fetch; apiBase?: string },
): Promise<VoiceMatchResult> {
  const doFetch = init?.fetchImpl ?? fetch;
  const base = init?.apiBase ?? API_BASE;

  let response: Response;
  try {
    response = await doFetch(`${base}/api/extension/voice-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ profileText }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, code: "network", error: "network_error" };
  }

  if (response.status === 200) {
    try {
      const data = (await response.json()) as VoiceMatchSuccess;
      return { ok: true, data };
    } catch {
      return { ok: false, code: "network", error: "json_parse_error" };
    }
  }

  let error = `http_${response.status}`;
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) error = body.error;
  } catch {
    // Non-JSON error body — keep the synthetic code.
  }
  return { ok: false, code: toErrorCode(response.status), error };
}
