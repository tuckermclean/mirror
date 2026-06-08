import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { and, eq, ne } from "drizzle-orm"

import { db } from "@/db/client"
import { commits, generations, users } from "@/db/schema"
import { DELETED_PLAN } from "@/lib/db/delete-user"
import { ValidationError } from "@/lib/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Commit methods accepted by the API (mirrors the commits.method enum usage). */
const VALID_METHODS = new Set(["in-app", "export-doc", "extension"])

interface CommitBody {
  generationId: string
  fieldsAccepted: Record<string, unknown>
  method: string
}

/** Resolve the internal user row from a Clerk id, excluding tombstones (ADR-009). */
async function resolveActiveUserId(clerkUserId: string): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.clerkId, clerkUserId), ne(users.plan, DELETED_PLAN)))
    .limit(1)
  return rows[0]?.id ?? null
}

/** Parse and validate the request body, throwing ValidationError on bad input. */
function parseBody(raw: unknown): CommitBody {
  if (typeof raw !== "object" || raw === null) {
    throw new ValidationError("body must be an object")
  }
  const body = raw as Record<string, unknown>
  if (typeof body.generationId !== "string" || body.generationId.length === 0) {
    throw new ValidationError("generationId is required")
  }
  if (typeof body.method !== "string" || !VALID_METHODS.has(body.method)) {
    throw new ValidationError("method is invalid")
  }
  const fieldsAccepted =
    typeof body.fieldsAccepted === "object" && body.fieldsAccepted !== null
      ? (body.fieldsAccepted as Record<string, unknown>)
      : {}
  return { generationId: body.generationId, fieldsAccepted, method: body.method }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authenticate — must be the first line.
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // 2. Parse + validate body.
  let body: CommitBody
  try {
    body = parseBody(await request.json())
  } catch (err) {
    const message = err instanceof ValidationError ? err.message : "invalid_json"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // 3. Resolve internal user row (tombstone-excluded).
  const internalUserId = await resolveActiveUserId(clerkUserId)
  if (!internalUserId) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 })
  }

  // 4. Verify generation ownership — UUIDs are not access credentials (IDOR guard).
  const genRows = await db
    .select({ id: generations.id })
    .from(generations)
    .where(
      and(
        eq(generations.id, body.generationId),
        eq(generations.userId, internalUserId)
      )
    )
    .limit(1)
  if (!genRows[0]) {
    return NextResponse.json({ error: "generation_not_found" }, { status: 404 })
  }

  // 5. Record the commit.
  const inserted = await db
    .insert(commits)
    .values({
      userId: internalUserId,
      generationId: body.generationId,
      fieldsAccepted: body.fieldsAccepted,
      method: body.method,
    })
    .returning({ id: commits.id })

  return NextResponse.json({ commitId: inserted[0]!.id }, { status: 201 })
}
