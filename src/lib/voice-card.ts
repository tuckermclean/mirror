import { readFileSync } from "fs";
import { createHash } from "crypto";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { generations } from "@/db/schema";
import { checkMonthlyCap, computeCostUsd, recordLlmSpend } from "@/lib/llm/cost-guard";
import { LlmParseError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ParsedChatHistory } from "@/lib/parsers/types";

const MODEL = "claude-sonnet-4-6";

const VOICE_EXTRACTION_SYSTEM = readFileSync(
  new URL("./prompts/voice_extraction.md", import.meta.url),
  "utf8"
);

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export const VoiceCardSchema = z.object({
  vocabulary: z.array(z.string()),
  hedgesAvoided: z.array(z.string()),
  sentenceLengthDistribution: z.object({
    short: z.number(),
    medium: z.number(),
    long: z.number(),
  }),
  emotionalRegister: z.string(),
  jargonHated: z.array(z.string()),
});

export type VoiceCard = z.infer<typeof VoiceCardSchema>;

type CapReachedResult = { error: "monthly_cap_reached"; resets_at: string };

export async function extractVoiceCard(
  history: ParsedChatHistory,
  userId: string
): Promise<VoiceCard | CapReachedResult> {
  const capResult = await checkMonthlyCap();
  if (!capResult.allowed) {
    return { error: "monthly_cap_reached", resets_at: capResult.resets_at };
  }

  const userMessages = history.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const promptHash = createHash("sha256")
    .update(JSON.stringify({ systemPrompt: VOICE_EXTRACTION_SYSTEM, userMessages, modelId: MODEL }))
    .digest("hex");

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cached = await db
    .select({ id: generations.id, output: generations.output })
    .from(generations)
    .where(
      and(
        eq(generations.userId, userId),
        eq(generations.promptHash, promptHash),
        gte(generations.createdAt, cutoff)
      )
    )
    .limit(1);

  if (cached.length > 0 && cached[0]!.output !== null) {
    const parsed = VoiceCardSchema.safeParse(cached[0]!.output);
    if (parsed.success) {
      logger.info("voice_card_cache_hit", { userId, promptHash });
      return parsed.data;
    }
  }

  const client = getClient();
  let fullText = "";

  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: VOICE_EXTRACTION_SYSTEM,
    messages: userMessages,
  });

  stream.on("text", (chunk: string) => {
    fullText += chunk;
  });

  const finalMessage = await stream.finalMessage();

  let rawOutput: unknown;
  try {
    const fenced = fullText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    rawOutput = JSON.parse(fenced ? fenced[1]! : fullText.trim());
  } catch {
    throw new LlmParseError("Failed to parse Voice Card JSON from LLM response");
  }

  const parsed = VoiceCardSchema.safeParse(rawOutput);
  if (!parsed.success) {
    throw new LlmParseError(`Voice Card schema validation failed: ${parsed.error.message}`);
  }

  const voiceCard = parsed.data;

  const [gen] = await db
    .insert(generations)
    .values({
      userId,
      model: MODEL,
      promptHash,
      output: voiceCard,
    })
    .returning({ id: generations.id });

  const inputTokens = finalMessage.usage.input_tokens;
  const outputTokens = finalMessage.usage.output_tokens;
  const costUsd = computeCostUsd(MODEL, inputTokens, outputTokens);

  const spendParams: Parameters<typeof recordLlmSpend>[0] = {
    userId,
    model: MODEL,
    inputTokens,
    outputTokens,
    costUsd,
  };
  if (gen?.id !== undefined) spendParams.generationId = gen.id;
  await recordLlmSpend(spendParams);

  logger.info("voice_card_extracted", { userId, generationId: gen?.id, promptHash });

  return voiceCard;
}
