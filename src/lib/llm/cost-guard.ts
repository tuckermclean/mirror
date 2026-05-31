import { db } from "@/db/client";
import { llmSpendLedger } from "@/db/schema";
import { and, eq, gte, sum } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Pricing table — USD per million tokens
// Formula: inputTokens * inputPerMToken / 1_000_000
//        + outputTokens * outputPerMToken / 1_000_000
// ---------------------------------------------------------------------------
const MODEL_PRICING: Record<string, { inputPerMToken: number; outputPerMToken: number }> = {
  "claude-sonnet-4-6": { inputPerMToken: 3, outputPerMToken: 15 },
  "claude-opus-4-7": { inputPerMToken: 15, outputPerMToken: 75 },
  "claude-haiku-4-5-20251001": { inputPerMToken: 0.8, outputPerMToken: 4 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute cost in USD from token counts. Throws for unrecognised models. */
export function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    throw new Error(`Unknown model "${model}" — add it to MODEL_PRICING in cost-guard.ts`);
  }
  return (
    (inputTokens * pricing.inputPerMToken) / 1_000_000 +
    (outputTokens * pricing.outputPerMToken) / 1_000_000
  );
}

/** ISO 8601 timestamp for the first instant of the next calendar month (UTC). */
function nextMonthFirstDay(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type CapResult =
  | { allowed: true }
  | { allowed: false; resets_at: string };

/**
 * Check whether userId has remaining budget for the current calendar month.
 *
 * Reads from llm_spend_ledger using the (user_id, recorded_at) index so the
 * query is always an index-range scan, not a seqscan.
 */
export async function checkMonthlyCap(userId: string): Promise<CapResult> {
  const capUsd = Number(process.env["LLM_MONTHLY_CAP_USD"] ?? 20);

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const rows = await db
    .select({ total: sum(llmSpendLedger.costUsd) })
    .from(llmSpendLedger)
    .where(
      and(
        eq(llmSpendLedger.userId, userId),
        gte(llmSpendLedger.recordedAt, startOfMonth)
      )
    );

  const mtdSpend = Number(rows[0]?.total ?? 0);

  if (mtdSpend >= capUsd) {
    return { allowed: false, resets_at: nextMonthFirstDay() };
  }
  return { allowed: true };
}

type RecordSpendParams = {
  userId: string;
  generationId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Pre-computed cost in USD from the Anthropic usage metadata. */
  costUsd: number;
};

/**
 * Persist one LLM call's cost to llm_spend_ledger.
 *
 * costUsd must be derived from the actual Anthropic usage object —
 * never estimate; use computeCostUsd(model, inputTokens, outputTokens).
 */
export async function recordLlmSpend(params: RecordSpendParams): Promise<void> {
  await db.insert(llmSpendLedger).values({
    userId: params.userId,
    generationId: params.generationId ?? null,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costUsd: params.costUsd.toString(),
  });
}
