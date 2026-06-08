import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { resolveActiveUserId } from "@/lib/db/user";
import {
  grantOutcomeTrackingConsent,
  revokeOutcomeTrackingConsent,
  hasOutcomeTrackingConsent,
} from "@/lib/outcomes/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve the internal user id from a Clerk user id, or return the appropriate error response. */
async function resolveOrReject(
  clerkUserId: string | null | undefined
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  if (!clerkUserId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const internalUserId = await resolveActiveUserId(clerkUserId);
  if (!internalUserId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "user_not_found" }, { status: 404 }),
    };
  }
  return { ok: true, userId: internalUserId };
}

/** POST /api/outcomes/consent — grant outcome-tracking consent. */
export async function POST(): Promise<NextResponse> {
  const { userId: clerkUserId } = await auth();
  const resolved = await resolveOrReject(clerkUserId);
  if (!resolved.ok) return resolved.response;

  await grantOutcomeTrackingConsent(resolved.userId);
  return NextResponse.json({ consented: true }, { status: 200 });
}

/** DELETE /api/outcomes/consent — revoke consent (stops collection). */
export async function DELETE(): Promise<NextResponse> {
  const { userId: clerkUserId } = await auth();
  const resolved = await resolveOrReject(clerkUserId);
  if (!resolved.ok) return resolved.response;

  await revokeOutcomeTrackingConsent(resolved.userId);
  return NextResponse.json({ consented: false }, { status: 200 });
}

/** GET /api/outcomes/consent — read current consent state. */
export async function GET(): Promise<NextResponse> {
  const { userId: clerkUserId } = await auth();
  const resolved = await resolveOrReject(clerkUserId);
  if (!resolved.ok) return resolved.response;

  const consented = await hasOutcomeTrackingConsent(resolved.userId);
  return NextResponse.json({ consented }, { status: 200 });
}
