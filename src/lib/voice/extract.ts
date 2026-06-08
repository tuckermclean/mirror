import type { ParsedChatHistory } from "@/lib/parsers/types";
import type { VoiceCard } from "@/lib/voice-card/schema";

const HEDGE_WORDS = [
  "I think",
  "I believe",
  "sort of",
  "kind of",
  "maybe",
  "perhaps",
  "just",
  "basically",
  "literally",
  "honestly",
  "actually",
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
    return { short: 33, medium: 34, long: 33 };
  }

  let short = 0;
  let medium = 0;
  let long = 0;

  for (const sentence of sentences) {
    const wordCount = sentence.split(/\s+/).filter((w) => w.length > 0).length;
    if (wordCount <= 10) short++;
    else if (wordCount <= 25) medium++;
    else long++;
  }

  const total = sentences.length;
  return {
    short: Math.round((short / total) * 100),
    medium: Math.round((medium / total) * 100),
    long: 100 - Math.round((short / total) * 100) - Math.round((medium / total) * 100),
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
