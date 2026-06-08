import { auth } from "@clerk/nextjs/server"
import { redirect, notFound } from "next/navigation"
import { and, eq } from "drizzle-orm"

import { db } from "@/db/client"
import { generations } from "@/db/schema"
import { resolveActiveUserId } from "@/lib/db/user"
import { readLinkedinSnapshot } from "@/lib/db/pii-read"
import { WalkthroughClient } from "@/components/walkthrough/walkthrough-client"
import {
  SEED_GENERATION_ID,
  WALKTHROUGH_FIXTURE,
} from "@/components/walkthrough/fixture"
import { isGeneratedProfile } from "@/components/walkthrough/profile-guard"
import { rationaleBundleSchema } from "@/lib/generation/schema"
import type { WalkthroughData } from "@/components/walkthrough/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Load a real generation + its input snapshot for the authenticated owner.
 * Returns null when the row is absent or not owned by the user (IDOR guard).
 */
async function loadWalkthroughData(
  generationId: string,
  userId: string
): Promise<WalkthroughData | null> {
  // Ownership is enforced in the WHERE clause — UUIDs are not access credentials.
  const genRows = await db
    .select({
      id: generations.id,
      output: generations.output,
      rationale: generations.rationale,
      inputSnapshotId: generations.inputSnapshotId,
    })
    .from(generations)
    .where(and(eq(generations.id, generationId), eq(generations.userId, userId)))
    .limit(1)
  const gen = genRows[0]
  if (!gen || !gen.output || !gen.rationale || !gen.inputSnapshotId) return null

  // snapshot.parsed is PII — read through the audited wrapper.
  const snapshot = await readLinkedinSnapshot(
    gen.inputSnapshotId,
    userId,
    "render walkthrough before/after comparison"
  )
  if (!snapshot?.parsed) return null

  // snapshot.parsed comes from the scraper/parse pipeline, not the Zod-validated
  // AI output, so validate its shape at runtime. Drift is treated like a missing
  // row (caller falls back to the fixture in dev/test, 404s in production)
  // instead of throwing client-side mid-render.
  if (!isGeneratedProfile(snapshot.parsed)) return null

  // gen.output and gen.rationale are JSONB — validate at the boundary so a row
  // written by an older schema version fails gracefully instead of crashing the
  // server component at render time.
  if (!isGeneratedProfile(gen.output)) return null
  const rationaleResult = rationaleBundleSchema.safeParse(gen.rationale)
  if (!rationaleResult.success) return null

  return {
    generationId: gen.id,
    before: snapshot.parsed,
    after: gen.output,
    rationale: rationaleResult.data,
    isFixture: false,
  }
}

export default async function WalkthroughPage({
  params,
}: {
  params: Promise<{ generationId: string }>
}) {
  // Auth first — read the session before any data access.
  const { userId: clerkUserId } = await auth()

  const { generationId } = await params

  // Demo/seed path: the DB seed is a no-op until Week 6, so the seed id always
  // renders the built-in fixture (and stays reachable for E2E/visual/a11y tests
  // that hit it without a session). Real ids never reach this branch and remain
  // behind the owner-only guard below.
  if (generationId === SEED_GENERATION_ID) {
    return <WalkthroughClient data={WALKTHROUGH_FIXTURE} />
  }

  // Every real generation requires an authenticated, owning user.
  if (!clerkUserId) redirect("/sign-in")

  const internalUserId = await resolveActiveUserId(clerkUserId)
  if (!internalUserId) redirect("/sign-in")

  const data = await loadWalkthroughData(generationId, internalUserId)

  // Real id with no owned row → 404 (also covers IDOR attempts). In dev/test
  // where seeds don't exist yet, fall back to the fixture so the walkthrough is
  // still demoable for any id.
  if (!data) {
    if (process.env.NODE_ENV !== "production") {
      return (
        <WalkthroughClient
          data={{ ...WALKTHROUGH_FIXTURE, generationId }}
        />
      )
    }
    notFound()
  }

  return <WalkthroughClient data={data} />
}
