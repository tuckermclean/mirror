import type { ParsedChatHistory } from "@/lib/parsers/types";

export type VoiceCard = {
  vocabulary: string[];
  topics: string[];
  writingStyle: string;
  communicationPatterns: string[];
};

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

  const wordFreq = new Map<string, number>();
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "is", "it", "i", "you", "we", "they", "he", "she",
    "this", "that", "was", "are", "be", "have", "had", "has", "do", "did",
    "can", "will", "would", "could", "should", "not", "so", "as", "by",
    "from", "my", "your", "our", "their", "its", "if", "then", "just",
  ]);

  const words = allText.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
  for (const word of words) {
    if (!stopWords.has(word)) {
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
    }
  }

  const vocabulary = Array.from(wordFreq.entries())
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30)
    .map(([word]) => word);

  const topicWords = vocabulary.slice(0, 10);

  const avgLen =
    userMessages.length > 0
      ? userMessages.reduce((sum, m) => sum + m.split(/\s+/).length, 0) / userMessages.length
      : 0;

  let writingStyle = "concise";
  if (avgLen > 100) writingStyle = "detailed";
  else if (avgLen > 50) writingStyle = "moderate";

  return {
    vocabulary,
    topics: topicWords,
    writingStyle,
    communicationPatterns: [],
  };
}
