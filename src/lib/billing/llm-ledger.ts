import { db } from "@/db/client.js";
import { llmSpendLedger } from "@/db/schema.js";

type RecordSpendParams = {
  userId: string;
  generationId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

const MODEL_PRICING: Record<string, { inputPerMToken: number; outputPerMToken: number }> = {
  "claude-sonnet-4-6": { inputPerMToken: 3, outputPerMToken: 15 },
  "claude-opus-4-7": { inputPerMToken: 15, outputPerMToken: 75 },
};

export async function recordLlmSpend(params: RecordSpendParams): Promise<void> {
  const pricing = MODEL_PRICING[params.model] ?? { inputPerMToken: 3, outputPerMToken: 15 };
  const costUsd =
    (params.inputTokens / 1_000_000) * pricing.inputPerMToken +
    (params.outputTokens / 1_000_000) * pricing.outputPerMToken;

  await db.insert(llmSpendLedger).values({
    userId: params.userId,
    generationId: params.generationId ?? null,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costUsd: costUsd.toString(),
  });
}
