import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { generations } from "@/db/schema";
import { checkMonthlyCap, computeCostUsd, recordLlmSpend } from "@/lib/llm/cost-guard";
import { ApiError, MonthlyCapError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ParsedChatHistory } from "@/lib/parsers/types";
import { parseVoiceCardOutput } from "./parse";
import { VoiceCardSchema, type VoiceCard } from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "../prompts/voice_extraction.md"), "utf-8");
const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * Extract a Voice Card from a parsed chat history using the LLM voice-extraction prompt.
 *
 * Calls the Anthropic API (respects monthly cap), parses the JSON response via
 * parseVoiceCardOutput, and returns the canonical VoiceCard schema shape.
 */
export async function extractVoiceCard(history: ParsedChatHistory, userId: string): Promise<VoiceCard> {
  const cap = await checkMonthlyCap();
  if (!cap.allowed) throw new MonthlyCapError(cap.resets_at);

  const transcript = history.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n\n");

  const userMessages: Anthropic.MessageParam[] = [{ role: "user", content: transcript }];
  const promptHash = createHash("sha256")
    .update(JSON.stringify({ systemPrompt: SYSTEM_PROMPT, userMessages, modelId: MODEL }))
    .digest("hex");

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cached = await db
    .select({ id: generations.id, output: generations.output })
    .from(generations)
    .where(and(eq(generations.promptHash, promptHash), gte(generations.createdAt, cutoff)))
    .limit(1);

  if (cached[0]?.output) {
    const parsed = VoiceCardSchema.safeParse(cached[0].output);
    if (parsed.success) return parsed.data;
  }

  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: userMessages,
    });
  } catch (err) {
    throw new ApiError(
      `Anthropic API error in voice extraction: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new ApiError("Voice extraction: Anthropic returned no text block");
  }

  const result = parseVoiceCardOutput(textBlock.text);
  if (!result.ok) {
    logger.warn("voice-extraction: parse failed", { error: result.error, userId });
    throw new ApiError("Voice extraction: failed to parse LLM output as VoiceCard");
  }

  const [gen] = await db
    .insert(generations)
    .values({
      userId,
      model: MODEL,
      promptHash,
      output: result.value as unknown as Record<string, unknown>,
    })
    .returning({ id: generations.id });

  const costUsd = computeCostUsd(MODEL, response.usage.input_tokens, response.usage.output_tokens);
  await recordLlmSpend({
    userId,
    ...(gen?.id !== undefined ? { generationId: gen.id } : {}),
    model: MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsd,
  });

  return result.value;
}
