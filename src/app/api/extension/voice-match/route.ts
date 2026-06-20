import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { resolveActiveUserId } from "@/lib/db/user";
import { corsHeaders } from "@/lib/extension/cors";
import { computeVoiceMatch } from "@/lib/extension/voice-match-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** JSON response carrying the request-scoped CORS headers (locked to the ext). */
function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null
): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders(origin) });
}

/**
 * Extract a non-empty `profileText` string, or null on any invalid body. The
 * returned string is trimmed, so the empty check and every downstream consumer
 * (length check, scorer) operate on the same canonical value.
 */
function parseProfileText(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const text = (raw as Record<string, unknown>)["profileText"];
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

/**
 * POST /api/extension/voice-match — Voice Match Score for live profile text
 * (SPEC §1.4 Tier C, §6.3). Auth is the FIRST line (AGENTS.md).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId: clerkUserId } = await auth();
  const origin = request.headers.get("origin");
  if (!clerkUserId) return jsonResponse({ error: "unauthorized" }, 401, origin);

  // `parseProfileText` returns the trimmed text, so the empty and length checks
  // below both apply to the same canonical value passed to the scorer.
  let profileText: string | null;
  try {
    profileText = parseProfileText(await request.json());
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, origin);
  }
  if (!profileText)
    return jsonResponse({ error: "profileText is required" }, 400, origin);
  if (profileText.length > 50_000)
    return jsonResponse({ error: "profileText too large" }, 422, origin);

  const internalUserId = await resolveActiveUserId(clerkUserId);
  if (!internalUserId)
    return jsonResponse({ error: "user_not_found" }, 404, origin);

  const result = await computeVoiceMatch(internalUserId, profileText);
  if (!result.ok) {
    return jsonResponse({ error: "missing_voice_embedding" }, 409, origin);
  }
  return jsonResponse(result.value, 200, origin);
}

/** CORS preflight — answered only for allowed extension origins (no `*`). */
export function OPTIONS(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
