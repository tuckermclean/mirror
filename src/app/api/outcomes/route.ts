import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import type { DB } from "@/db/client";
import { outcomes } from "@/db/schema";
import { resolveActiveUserId } from "@/lib/db/user";
import { hasOutcomeTrackingConsent } from "@/lib/outcomes/consent";
import { selfReportSchema } from "@/lib/outcomes/self-report-schema";
import { aggregateWeeklySeries } from "@/lib/outcomes/aggregation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function parseBody(
  request: NextRequest
): Promise<
  | { ok: true; data: ReturnType<typeof selfReportSchema.parse> }
  | { ok: false; response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "invalid_json" }, { status: 400 }) };
  }

  const parsed = selfReportSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "validation_error",
          issues: parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

async function insertOutcomeWithConsentCheck(
  tx: DB,
  internalUserId: string,
  data: ReturnType<typeof selfReportSchema.parse>
): Promise<{ id: string }[] | null> {
  const hasConsent = await hasOutcomeTrackingConsent(internalUserId, tx);
  if (!hasConsent) return null;

  return tx
    .insert(outcomes)
    .values({
      userId: internalUserId,
      weekOf: data.weekOf,
      profileViews: data.profileViews,
      searchAppearances: data.searchAppearances,
      recruiterMsgs: data.recruiterMsgs,
      postImpressions: data.postImpressions,
      source: "self_report",
    })
    .onConflictDoUpdate({
      target: [outcomes.userId, outcomes.weekOf, outcomes.source],
      set: {
        profileViews: data.profileViews,
        searchAppearances: data.searchAppearances,
        recruiterMsgs: data.recruiterMsgs,
        postImpressions: data.postImpressions,
      },
    })
    .returning({ id: outcomes.id });
}

/**
 * POST /api/outcomes — submit a weekly self-reported outcome.
 *
 * Gated on outcome-tracking consent (revoke stops collection). Stores
 * `source: 'self_report'`. Auth is the FIRST line per AGENTS.md.
 *
 * The consent check and INSERT are wrapped in a single transaction to
 * prevent a TOCTOU race where consent is revoked between the check and
 * the write. The INSERT uses onConflictDoUpdate so that re-submitting
 * the same week is idempotent (upsert).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await parseBody(request);
  if (!body.ok) return body.response;

  const internalUserId = await resolveActiveUserId(clerkUserId);
  if (!internalUserId) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  // Wrap the consent check and INSERT in a transaction to prevent a TOCTOU
  // race where the user revokes consent between the check and the write.
  // Drizzle's transaction callback type omits the `.query` builder that the
  // `DB` alias includes, so `tx` does not directly satisfy `DB`. The double-
  // cast via `unknown` is the safe widening path used by Drizzle's own docs.
  const inserted = await db.transaction(async (tx) => {
    return insertOutcomeWithConsentCheck(tx as unknown as DB, internalUserId, body.data);
  });

  if (!inserted) return NextResponse.json({ error: "consent_required" }, { status: 403 });

  return NextResponse.json({ outcomeId: inserted[0]!.id }, { status: 200 });
}

/**
 * GET /api/outcomes — read the caller's aggregated weekly outcome series.
 *
 * GDPR Art. 15 right-of-access: historical data remains readable after consent
 * revocation. Collection is blocked (POST gated on consent), but the user
 * retains access to their own stored records. See COMPLIANCE.md.
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
