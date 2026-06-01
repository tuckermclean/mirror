import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { db } from "@/db/client";
import { generations } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { checkMonthlyCap, computeCostUsd, recordLlmSpend } from "@/lib/llm/cost-guard";
import { logger } from "@/lib/logger";
import type { ParsedChatHistory } from "@/lib/parsers/types";

// ---------------------------------------------------------------------------
// VoiceCard schema
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Prompt loading — load once at module init, never inline
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const VOICE_EXTRACTION_SYSTEM = readFileSync(
  join(__dirname, "prompts", "voice_extraction.md"),
  "utf8"
);

// ---------------------------------------------------------------------------
// Lazy Anthropic client — avoids coupling module to env at import time
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// extractVoiceCard
// ---------------------------------------------------------------------------

export async function extractVoiceCard(
  history: ParsedChatHistory,
  userId: string,
  generationId?: string
): Promise<VoiceCard> {
  const userMessages = history.messages
    .filter((m) => m.role === "user")
    .slice(0, 200);

  if (userMessages.length === 0) {
    throw new Error("No user messages found in chat history");
  }

  const transcriptText = userMessages.map((m) => `Human: ${m.content}`).join("\n\n");
  const userPrompt = `Here is the chat history transcript to analyze:\n\n${transcriptText}\n\nExtract the Voice Card JSON now.`;

  // Check monthly spend cap before calling LLM
  const capResult = await checkMonthlyCap();
  if (!capResult.allowed) {
    throw new Error(`monthly_cap_reached — resets at ${capResult.resets_at}`);
  }

  // 24h prompt cache check
  const promptHash = createHash("sha256")
    .update(JSON.stringify({ systemPrompt: VOICE_EXTRACTION_SYSTEM, userMessages: userPrompt, modelId: MODEL }))
    .digest("hex");

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cached = await db
    .select({ output: generations.output })
    .from(generations)
    .where(
      and(
        eq(generations.userId, userId),
        eq(generations.promptHash, promptHash),
        gte(generations.createdAt, oneDayAgo)
      )
    )
    .limit(1);

  if (cached.length > 0 && cached[0]?.output != null) {
    logger.info("voice-card: cache hit", { promptHash });
    return VoiceCardSchema.parse(cached[0].output);
  }

  // Call Anthropic streaming API
  logger.info("voice-card: calling LLM", { userId, messages: userMessages.length });

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: VOICE_EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });

  const finalMessage = await stream.finalMessage();
  const textBlock = finalMessage.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from voice extraction LLM");
  }

  let rawJson: unknown;
  try {
    const text = textBlock.text.trim();
    const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text) ?? null;
    const jsonStr = jsonMatch ? jsonMatch[1]!.trim() : text;
    rawJson = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Voice extraction LLM returned invalid JSON: ${textBlock.text.slice(0, 200)}`);
  }

  const voiceCard = VoiceCardSchema.parse(rawJson);

  // Insert generation row and capture its id for the spend ledger FK
  const [gen] = await db
    .insert(generations)
    .values({
      userId,
      model: MODEL,
      promptHash,
      output: voiceCard,
      rationale: null,
      inputSnapshotId: null,
    })
    .returning({ id: generations.id });

  // Record actual LLM cost — build params object without conditional spread
  const costUsd = computeCostUsd(MODEL, finalMessage.usage.input_tokens, finalMessage.usage.output_tokens);
  const spendParams: Parameters<typeof recordLlmSpend>[0] = {
    userId,
    model: MODEL,
    inputTokens: finalMessage.usage.input_tokens,
    outputTokens: finalMessage.usage.output_tokens,
    costUsd,
  };
  if (gen?.id !== undefined) spendParams.generationId = gen.id;
  if (generationId !== undefined) spendParams.generationId = generationId;
  await recordLlmSpend(spendParams);

  return voiceCard;
}
