import { and, eq, ne } from "drizzle-orm"

import { db } from "@/db/client"
import { users } from "@/db/schema"
import { DELETED_PLAN } from "@/lib/db/delete-user"

/**
 * Resolve the internal user row from a Clerk id, excluding tombstones (ADR-009).
 * Returns null when the user is not found or has been soft-deleted.
 */
export async function resolveActiveUserId(clerkUserId: string): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.clerkId, clerkUserId), ne(users.plan, DELETED_PLAN)))
    .limit(1)
  return rows[0]?.id ?? null
}
