import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { generations, linkedinSnapshots, users } from "@/db/schema";
import { DELETED_PLAN } from "@/lib/db/delete-user";
import { checkMonthlyCap } from "@/lib/llm/cost-guard";
import { computePromptHash, findCachedGeneration } from "@/lib/llm/prompt-cache";
import { inngest } from "@/lib/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_ID = "claude-sonnet-4-6";
// Placeholder until the generation pipeline owns the real system prompt; the
// hash only needs to be stable across identical requests for the same snapshot.
const GENERATION_SYSTEM_PROMPT = "mirror:generation:v1";

/** Resolve the internal user row from a Clerk id, excluding tombstones (ADR-009). */
async function resolveActiveUserId(clerkUserId: string): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.clerkId, clerkUserId), ne(users.plan, DELETED_PLAN)))
    .limit(1);
  return rows[0]?.id ?? null;
}

function capReachedResponse(resetsAt: string): NextResponse {
  return NextResponse.json(
    { error: "monthly_cap_reached", resets_at: resetsAt },
    { status: 402 }
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authenticate — must be the first line.
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate body.
  let snapshotId: string;
  try {
    const body = (await request.json()) as { snapshotId?: unknown };
    if (typeof body.snapshotId !== "string" || body.snapshotId.length === 0) {
      return NextResponse.json({ error: "invalid_snapshot_id" }, { status: 400 });
    }
    snapshotId = body.snapshotId;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 3. Resolve internal user row (tombstone-excluded).
  const internalUserId = await resolveActiveUserId(clerkUserId);
  if (!internalUserId) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // 3b. Verify snapshot ownership — UUIDs are not access credentials.
  const snapshotRow = await db
    .select({ id: linkedinSnapshots.id })
    .from(linkedinSnapshots)
    .where(and(eq(linkedinSnapshots.id, snapshotId), eq(linkedinSnapshots.userId, internalUserId)))
    .limit(1);
  if (!snapshotRow[0]) {
    return NextResponse.json({ error: "snapshot_not_found" }, { status: 404 });
  }

  // 4. Monthly spend cap — enforced before any generation work.
  const capResult = await checkMonthlyCap();
  if (!capResult.allowed) {
    return capReachedResponse(capResult.resets_at);
  }

  // 5. Prompt-hash cache check — return the cached generation without re-running.
  const promptHash = computePromptHash({
    systemPrompt: GENERATION_SYSTEM_PROMPT,
    userMessages: { snapshotId },
    modelId: MODEL_ID,
  });
  const cached = await findCachedGeneration(promptHash);
  if (cached) {
    return NextResponse.json({ generationId: cached.id, cached: true });
  }

  // 6. Cache miss — insert a placeholder row, then kick off the pipeline.
  const inserted = await db
    .insert(generations)
    .values({
      userId: internalUserId,
      inputSnapshotId: snapshotId,
      model: MODEL_ID,
      promptHash,
      output: null,
    })
    .returning({ id: generations.id });
  const generationId = inserted[0]!.id;

  await inngest.send({
    name: "generation/start",
    data: { userId: internalUserId, snapshotId, generationId },
  });

  return NextResponse.json({ generationId });
}
