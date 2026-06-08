import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { outcomes } from "@/db/schema";
import { resolveActiveUserId } from "@/lib/db/user";
import { hasOutcomeTrackingConsent } from "@/lib/outcomes/consent";
import { selfReportSchema } from "@/lib/outcomes/self-report-schema";
import { aggregateWeeklySeries } from "@/lib/outcomes/aggregation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/outcomes — submit a weekly self-reported outcome.
 *
 * Gated on outcome-tracking consent (revoke stops collection). Stores
 * `source: 'self_report'`. Auth is the FIRST line per AGENTS.md.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = selfReportSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const internalUserId = await resolveActiveUserId(clerkUserId);
  if (!internalUserId) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // Consent gate — capture is only lawful while consent is held.
  if (!(await hasOutcomeTrackingConsent(internalUserId))) {
    return NextResponse.json({ error: "consent_required" }, { status: 403 });
  }

  const r = parsed.data;
  const inserted = await db
    .insert(outcomes)
    .values({
      userId: internalUserId,
      weekOf: r.weekOf,
      profileViews: r.profileViews,
      searchAppearances: r.searchAppearances,
      recruiterMsgs: r.recruiterMsgs,
      postImpressions: r.postImpressions,
      source: "self_report",
    })
    .returning({ id: outcomes.id });

  return NextResponse.json({ outcomeId: inserted[0]!.id }, { status: 201 });
}

/**
 * GET /api/outcomes — read the caller's aggregated weekly outcome series.
 */
export async function GET(): Promise<NextResponse> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const internalUserId = await resolveActiveUserId(clerkUserId);
  if (!internalUserId) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const rows = await db
    .select({
      weekOf: outcomes.weekOf,
      profileViews: outcomes.profileViews,
      searchAppearances: outcomes.searchAppearances,
      recruiterMsgs: outcomes.recruiterMsgs,
      postImpressions: outcomes.postImpressions,
    })
    .from(outcomes)
    .where(eq(outcomes.userId, internalUserId))
    .orderBy(outcomes.weekOf);

  return NextResponse.json({ series: aggregateWeeklySeries(rows) }, { status: 200 });
}
