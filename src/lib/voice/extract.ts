import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { ParsedChatHistory } from "@/lib/parsers/types";
import type { VoiceCard } from "@/lib/voice-card/schema";
import { parseVoiceCardOutput } from "@/lib/voice-card/parse";
import { checkMonthlyCap, computeCostUsd, recordLlmSpend } from "@/lib/llm/cost-guard";
import { computePromptHash, findCachedGeneration, recordGeneration, evictGeneration } from "@/lib/llm/prompt-cache";
import { MonthlyCapError, GenerationSchemaError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const HEDGE_WORDS = [
  "I think",
  "I believe",
  "sort of",
  "kind of",
  "maybe",
  "perhaps",
  "just",
  "basically",
  "probably",
  "I guess",
  "I suppose",
];

const JARGON_CANDIDATES = [
  "synergy",
  "leverage",
  "pivot",
  "disruptive",
  "scalable",
  "ecosystem",
  "bandwidth",
  "circle back",
  "move the needle",
  "low-hanging fruit",
  "rockstar",
  "ninja",
  "guru",
  "thought leader",
  "game changer",
];

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "is", "it", "i", "you", "we", "they", "he", "she",
  "this", "that", "was", "are", "be", "have", "had", "has", "do", "did",
  "can", "will", "would", "could", "should", "not", "so", "as", "by",
  "from", "my", "your", "our", "their", "its", "if", "then", "just",
]);

function extractVocabulary(allText: string): string[] {
  const wordFreq = new Map<string, number>();
  const words = allText.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
  for (const word of words) {
    if (!STOP_WORDS.has(word)) {
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
    }
  }
  return Array.from(wordFreq.entries())
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30)
    .map(([word]) => word);
}

function detectHedgesAvoided(allText: string): string[] {
  const textLower = allText.toLowerCase();
  return HEDGE_WORDS.filter((hedge) => !textLower.includes(hedge.toLowerCase()));
}

function computeSentenceLengthDistribution(
  messages: string[],
): { short: number; medium: number; long: number } {
  const sentences = messages
    .join(" ")
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) {
    return { short: 0.33, medium: 0.34, long: 0.33 };
  }

  let short = 0;
  let medium = 0;

  for (const sentence of sentences) {
    const wordCount = sentence.split(/\s+/).filter((w) => w.length > 0).length;
    if (wordCount <= 10) short++;
    else if (wordCount <= 25) medium++;
  }

  const total = sentences.length;
  // Emit 0–1 proportions. Derive `long` as the remainder so the three always
  // sum to exactly 1 (no floating-point drift past the schema's ±0.01 bound).
  const shortProp = short / total;
  const mediumProp = medium / total;
  return {
    short: shortProp,
    medium: mediumProp,
    long: 1 - shortProp - mediumProp,
  };
}

function detectEmotionalRegister(allText: string): string {
  const textLower = allText.toLowerCase();

  const enthusiasmMarkers = ["!", "love", "excited", "amazing", "fantastic", "great", "awesome"];
  const formalMarkers = ["therefore", "furthermore", "consequently", "regarding", "pursuant"];
  const technicalMarkers = ["implementation", "architecture", "system", "performance", "optimize"];
  const analyticalMarkers = ["data", "metric", "measure", "analyze", "insight", "result"];

  const scores = {
    enthusiastic: enthusiasmMarkers.filter((m) => textLower.includes(m)).length,
    formal: formalMarkers.filter((m) => textLower.includes(m)).length,
    technical: technicalMarkers.filter((m) => textLower.includes(m)).length,
    analytical: analyticalMarkers.filter((m) => textLower.includes(m)).length,
  };

  const dominant = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];

  if (!dominant || dominant[1] === 0) return "neutral, professional";

  const registers: Record<string, string> = {
    enthusiastic: "warm, enthusiastic, collaborative",
    formal: "formal, precise, structured",
    technical: "technical, direct, methodical",
    analytical: "analytical, data-driven, measured",
  };

  return registers[dominant[0]] ?? "neutral, professional";
}

function detectJargonHated(allText: string): string[] {
  const textLower = allText.toLowerCase();
  return JARGON_CANDIDATES.filter((jargon) => !textLower.includes(jargon.toLowerCase()));
}

/**
 * Extract a voice card from a parsed chat history or LinkedIn snapshot.
 *
 * The voice card captures linguistic fingerprint signals used later by the
 * generation pipeline to rewrite LinkedIn sections in the user's own voice.
 */
export function extractVoiceCard(history: ParsedChatHistory): VoiceCard {
  const userMessages = history.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content);

  const allText = userMessages.join(" ");

  return {
    vocabulary: extractVocabulary(allText),
    hedgesAvoided: detectHedgesAvoided(allText),
    sentenceLengthDistribution: computeSentenceLengthDistribution(userMessages),
    emotionalRegister: detectEmotionalRegister(allText),
    jargonHated: detectJargonHated(allText),
  };
}

// ---------------------------------------------------------------------------
// LLM-backed extraction
//
// The heuristic `extractVoiceCard` above is the cheap, deterministic default.
// `extractVoiceCardLlm` wires the `voice_extraction.md` prompt to Anthropic for
// a higher-fidelity Voice Card, honouring the AGENTS.md LLM rules: monthly cap
// check first, 24h prompt-hash cache, streaming API, actual-usage spend record.
// ---------------------------------------------------------------------------

const VOICE_EXTRACTION_MODEL = "claude-sonnet-4-6";
const VOICE_EXTRACTION_MAX_TOKENS = 1024;

const __dirname = dirname(fileURLToPath(import.meta.url));
const VOICE_EXTRACTION_PROMPT = readFileSync(
  join(__dirname, "../prompts/voice_extraction.md"),
  "utf-8",
);

let _anthropicClient: Anthropic | undefined;
function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) _anthropicClient = new Anthropic();
  return _anthropicClient;
}

/** Concatenate the text content of a finished Anthropic message. */
function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export type VoiceExtractionOptions = { userId: string };

/**
 * Extract a Voice Card from a transcript using the `voice_extraction.md` prompt.
 *
 * Throws {@link MonthlyCapError} if the platform spend cap is reached and
 * {@link GenerationSchemaError} if the model output fails the VoiceCard schema.
 */
export async function extractVoiceCardLlm(
  transcript: string,
  options: VoiceExtractionOptions,
): Promise<VoiceCard> {
  const promptHash = computePromptHash({
    systemPrompt: VOICE_EXTRACTION_PROMPT,
    userMessages: [transcript],
    modelId: VOICE_EXTRACTION_MODEL,
  });

  const cached = await findCachedGeneration(promptHash);
  if (cached) {
    const parsed = parseVoiceCardOutput(JSON.stringify(cached.output));
    if (parsed.ok) return parsed.value;
    logger.warn("voice-extraction: cached output failed schema, regenerating", {
      userId: options.userId,
    });
    // Evict the invalid row so future calls skip re-validation overhead.
    await evictGeneration(cached.id);
  }

  const cap = await checkMonthlyCap();
  if (!cap.allowed) {
    logger.warn("voice-extraction: monthly cap reached", { userId: options.userId });
    throw new MonthlyCapError(cap.resets_at);
  }

  const stream = await getAnthropicClient().messages.stream({
    model: VOICE_EXTRACTION_MODEL,
    max_tokens: VOICE_EXTRACTION_MAX_TOKENS,
    system: VOICE_EXTRACTION_PROMPT,
    messages: [{ role: "user", content: transcript }],
  });
  const final = await stream.finalMessage();

  await recordLlmSpend({
    userId: options.userId,
    model: VOICE_EXTRACTION_MODEL,
    inputTokens: final.usage.input_tokens,
    outputTokens: final.usage.output_tokens,
    costUsd: computeCostUsd(
      VOICE_EXTRACTION_MODEL,
      final.usage.input_tokens,
      final.usage.output_tokens,
    ),
  });

  const parsed = parseVoiceCardOutput(extractText(final));
  if (!parsed.ok) {
    const detail =
      parsed.error.kind === "invalid_json"
        ? "model did not return JSON"
        : JSON.stringify(parsed.error.issues);
    logger.warn("voice-extraction: output failed schema validation", {
      userId: options.userId,
      detail,
    });
    throw new GenerationSchemaError(detail);
  }

  // Cache the successful result so subsequent identical calls hit the cache.
  await recordGeneration({
    userId: options.userId,
    model: VOICE_EXTRACTION_MODEL,
    promptHash,
    output: parsed.value,
  });

  return parsed.value;
}
