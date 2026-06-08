import { NextResponse } from "next/server";

import { resolveActiveUserId } from "@/lib/db/user";

/**
 * Resolve the internal user id from a Clerk user id, or return the
 * appropriate error response (401 if unauthenticated, 404 if no active row).
 *
 * Extracted here so route handlers in different parts of the API can share
 * this boilerplate without duplication.
 */
export async function resolveUserOr401Or404(
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
