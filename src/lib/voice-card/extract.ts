import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { checkMonthlyCap, computeCostUsd, recordLlmSpend } from "@/lib/llm/cost-guard";
import { ApiError, MonthlyCapError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ParsedChatHistory } from "@/lib/parsers/types";
import { parseVoiceCardOutput } from "./parse";
import type { VoiceCard } from "./schema";

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

  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
    });
  } catch (err) {
    throw new ApiError(
      `Anthropic API error in voice extraction: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const costUsd = computeCostUsd(MODEL, response.usage.input_tokens, response.usage.output_tokens);
  await recordLlmSpend({
    userId,
    model: MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsd,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new ApiError("Voice extraction: Anthropic returned no text block");
  }

  const result = parseVoiceCardOutput(textBlock.text);
  if (!result.ok) {
    logger.warn("voice-extraction: parse failed", { error: result.error, userId });
    throw new ApiError("Voice extraction: failed to parse LLM output as VoiceCard");
  }

  return result.value;
}
