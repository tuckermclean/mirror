import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { resolveActiveUserId } from "@/lib/db/user";
import { corsHeaders } from "@/lib/extension/cors";
import { computeVoiceMatch } from "@/lib/extension/voice-match-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** JSON response carrying the request-scoped CORS headers (locked to the ext). */
function json(
  body: unknown,
  status: number,
  origin: string | null
): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders(origin) });
}

/** Extract a non-empty `profileText` string, or null on any invalid body. */
function parseProfileText(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const text = (raw as Record<string, unknown>)["profileText"];
  if (typeof text !== "string" || text.trim().length === 0) return null;
  return text;
}

/**
 * POST /api/extension/voice-match — Voice Match Score for live profile text
 * (SPEC §1.4 Tier C, §6.3). Auth is the FIRST line (AGENTS.md).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId: clerkUserId } = await auth();
  const origin = request.headers.get("origin");
  if (!clerkUserId) return json({ error: "unauthorized" }, 401, origin);

  let profileText: string | null;
  try {
    profileText = parseProfileText(await request.json());
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }
  if (!profileText) return json({ error: "profileText is required" }, 400, origin);

  const internalUserId = await resolveActiveUserId(clerkUserId);
  if (!internalUserId) return json({ error: "user_not_found" }, 404, origin);

  const result = await computeVoiceMatch(internalUserId, profileText);
  if (!result.ok) {
    if (result.error === "not_found") return json({ error: "user_not_found" }, 404, origin);
    return json({ error: "missing_voice_embedding" }, 409, origin);
  }
  return json(result.value, 200, origin);
}

/** CORS preflight — answered only for allowed extension origins (no `*`). */
export function OPTIONS(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
