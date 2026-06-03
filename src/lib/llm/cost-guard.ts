import { db } from "@/db/client";
import { llmSpendLedger } from "@/db/schema";
import { gte, sum } from "drizzle-orm";
import { UnknownModelError } from "@/lib/errors";

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
    throw new UnknownModelError(model);
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
 * Check whether the platform has remaining budget for the current calendar month.
 *
 * LLM_MONTHLY_CAP_USD is a global platform budget (protects the Anthropic bill),
 * not a per-user quota. All spend rows are summed without a userId filter.
 * Uses the (recorded_at) index for an efficient range scan.
 */
export async function checkMonthlyCap(): Promise<CapResult> {
  const rawCap = Number(process.env["LLM_MONTHLY_CAP_USD"] ?? 20);
  const capUsd = Number.isFinite(rawCap) && rawCap > 0 ? rawCap : 20;

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const rows = await db
    .select({ total: sum(llmSpendLedger.costUsd) })
    .from(llmSpendLedger)
    .where(gte(llmSpendLedger.recordedAt, startOfMonth));

  const mtdSpend = Number(rows[0]?.total ?? 0);

  if (mtdSpend >= capUsd) {
    return { allowed: false, resets_at: nextMonthFirstDay() };
  }
  return { allowed: true };
}

export type ModelRow = {
  model: string;
  total: string | null;
};

export type MtdData = {
  totalUsd: number;
  byModel: ModelRow[];
  startOfMonth: Date;
};

/** Fetch month-to-date LLM spend totals from the ledger. */
export async function getMtdData(): Promise<MtdData> {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const byModel: ModelRow[] = await db
    .select({ model: llmSpendLedger.model, total: sum(llmSpendLedger.costUsd) })
    .from(llmSpendLedger)
    .where(gte(llmSpendLedger.recordedAt, startOfMonth))
    .groupBy(llmSpendLedger.model);

  const totalUsd = byModel.reduce((acc, row) => acc + Number(row.total ?? 0), 0);

  return { totalUsd, byModel, startOfMonth };
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
