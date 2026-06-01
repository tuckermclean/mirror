import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { db } from "@/db/client";
import { generations } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { checkMonthlyCap, computeCostUsd, recordLlmSpend } from "@/lib/llm/cost-guard";
import { logger } from "@/lib/logger";
import type { ParsedChatHistory } from "@/lib/parsers/types";

// ---------------------------------------------------------------------------
// VoiceCard schema — the fingerprint of someone's written voice
// ---------------------------------------------------------------------------

export const VoiceCardSchema = z.object({
  /** Characteristic words and phrases this person uses distinctively. */
  vocabulary: z.array(z.string()),
  /** Hedging language this person avoids (e.g., "sort of", "maybe", "I think"). */
  hedgesAvoided: z.array(z.string()),
  /** Distribution of sentence lengths: short / medium / long percentages. */
  sentenceLengthDistribution: z.object({
    short: z.number().describe("Percentage of sentences under 10 words"),
    medium: z.number().describe("Percentage of sentences 10-25 words"),
    long: z.number().describe("Percentage of sentences over 25 words"),
  }),
  /** The overall emotional register: e.g., "analytical", "warm", "assertive". */
  emotionalRegister: z.string(),
  /** Industry jargon or overused terms this person avoids or dislikes. */
  jargonHated: z.array(z.string()),
  /** Topics this person returns to repeatedly. */
  recurringTopics: z.array(z.string()),
});

export type VoiceCard = z.infer<typeof VoiceCardSchema>;

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

const VOICE_EXTRACTION_SYSTEM = `You are a linguistic analyst specializing in personal writing voice.

Given a chat history transcript, extract a Voice Card that captures how this person writes and communicates. Focus exclusively on the user/human messages.

Analyze:
1. Distinctive vocabulary and phrases they use (not common words)
2. Hedging language they avoid (direct communicators don't say "sort of" / "maybe" / "I think")
3. Sentence length patterns (what percentage are short / medium / long)
4. Emotional register (analytical, warm, assertive, playful, formal, casual, etc.)
5. Jargon or buzzwords they actively avoid or push back against
6. Topics they return to repeatedly

Output ONLY a valid JSON object matching this exact schema:
{
  "vocabulary": string[],           // 5-15 distinctive words/phrases
  "hedgesAvoided": string[],        // hedges they don't use (may be empty array)
  "sentenceLengthDistribution": {   // must sum to ~100
    "short": number,                // % sentences under 10 words
    "medium": number,               // % sentences 10-25 words
    "long": number                  // % sentences over 25 words
  },
  "emotionalRegister": string,      // single descriptive phrase
  "jargonHated": string[],          // may be empty array
  "recurringTopics": string[]       // 3-10 topics
}

Do NOT invent information not present in the transcript. Do NOT include job titles, companies, or skills not mentioned.`;

// ---------------------------------------------------------------------------
// Extract VoiceCard from a parsed chat history
// ---------------------------------------------------------------------------

const MODEL = "claude-sonnet-4-6";
const client = new Anthropic();

/**
 * Extract a Voice Card from a parsed AI chat history.
 * Checks the monthly spend cap before calling the LLM,
 * records the cost after, and returns a validated VoiceCard.
 *
 * @param history - The parsed chat history to analyze
 * @param userId - The internal user ID for billing
 * @param generationId - Optional generation row ID for ledger FK
 */
export async function extractVoiceCard(
  history: ParsedChatHistory,
  userId: string,
  generationId?: string
): Promise<VoiceCard> {
  // Build the transcript text from user messages
  const userMessages = history.messages
    .filter((m) => m.role === "user")
    .slice(0, 200); // Cap at 200 messages to stay within context

  if (userMessages.length === 0) {
    throw new Error("No user messages found in chat history");
  }

  const transcriptText = userMessages
    .map((m) => `Human: ${m.content}`)
    .join("\n\n");

  const userPrompt = `Here is the chat history transcript to analyze:\n\n${transcriptText}\n\nExtract the Voice Card JSON now.`;

  // Check monthly cap before calling LLM
  const capResult = await checkMonthlyCap();
  if (!capResult.allowed) {
    throw new Error(`monthly_cap_reached — resets at ${capResult.resets_at}`);
  }

  // Check prompt cache in generations table (24h window)
  const promptHash = createHash("sha256")
    .update(JSON.stringify({ system: VOICE_EXTRACTION_SYSTEM, user: userPrompt, model: MODEL }))
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

  const stream = client.messages.stream({
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

  // Parse and validate the JSON response
  let rawJson: unknown;
  try {
    // Extract JSON from response (may have markdown code fences)
    const text = textBlock.text.trim();
    const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text) ?? null;
    const jsonStr = jsonMatch ? jsonMatch[1]!.trim() : text;
    rawJson = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Voice extraction LLM returned invalid JSON: ${textBlock.text.slice(0, 200)}`);
  }

  const voiceCard = VoiceCardSchema.parse(rawJson);

  // Record LLM spend
  const costUsd = computeCostUsd(
    MODEL,
    finalMessage.usage.input_tokens,
    finalMessage.usage.output_tokens
  );
  await recordLlmSpend({
    userId,
    generationId,
    model: MODEL,
    inputTokens: finalMessage.usage.input_tokens,
    outputTokens: finalMessage.usage.output_tokens,
    costUsd,
  });

  // Persist to generations table for future cache hits
  await db.insert(generations).values({
    userId,
    model: MODEL,
    promptHash,
    output: voiceCard,
    rationale: null,
    inputSnapshotId: null,
  });

  return voiceCard;
}
