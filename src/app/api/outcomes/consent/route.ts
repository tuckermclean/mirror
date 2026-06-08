import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { resolveUserOr401Or404 } from "@/lib/api/resolve-user";
import {
  grantOutcomeTrackingConsent,
  revokeOutcomeTrackingConsent,
  hasOutcomeTrackingConsent,
} from "@/lib/outcomes/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/outcomes/consent — grant outcome-tracking consent. */
export async function POST(): Promise<NextResponse> {
  const { userId: clerkUserId } = await auth();
  const resolved = await resolveUserOr401Or404(clerkUserId);
  if (!resolved.ok) return resolved.response;

  await grantOutcomeTrackingConsent(resolved.userId);
  return NextResponse.json({ consented: true }, { status: 200 });
}

/** DELETE /api/outcomes/consent — revoke consent (stops collection). */
export async function DELETE(): Promise<NextResponse> {
  const { userId: clerkUserId } = await auth();
  const resolved = await resolveUserOr401Or404(clerkUserId);
  if (!resolved.ok) return resolved.response;

  await revokeOutcomeTrackingConsent(resolved.userId);
  return NextResponse.json({ consented: false }, { status: 200 });
}

/** GET /api/outcomes/consent — read current consent state. */
export async function GET(): Promise<NextResponse> {
  const { userId: clerkUserId } = await auth();
  const resolved = await resolveUserOr401Or404(clerkUserId);
  if (!resolved.ok) return resolved.response;

  // read-only path, no TOCTOU risk — no transaction needed here
  const consented = await hasOutcomeTrackingConsent(resolved.userId);
  return NextResponse.json({ consented }, { status: 200 });
}
