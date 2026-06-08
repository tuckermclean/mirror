import type { VoyageAIClient } from "voyageai";
import type { ParsedChatHistory } from "@/lib/parsers/types";
import type { VoiceCard } from "@/lib/voice-card/schema";
import { ConfigurationError, ParseError } from "@/lib/errors";

const EMBEDDING_MODEL = "voyage-3";
// voyage-3 returns 1024-dimensional embeddings by default.
const EMBEDDING_DIMENSIONS = 1024;

let _client: VoyageAIClient | undefined;

async function getClient(): Promise<VoyageAIClient> {
  if (!_client) {
    const apiKey = process.env["VOYAGE_API_KEY"];
    if (!apiKey) throw new ConfigurationError("VOYAGE_API_KEY is required for embeddings");
    // Dynamic import defers voyageai ESM resolution to call time (inside Inngest
    // functions), so it is never evaluated during Next.js page-data collection.
    // A static top-level import triggers ERR_UNSUPPORTED_DIR_IMPORT in the ESM
    // loader even when voyageai is listed in serverExternalPackages.
    const { VoyageAIClient } = await import("voyageai");
    _client = new VoyageAIClient({ apiKey });
  }
  return _client;
}

/**
 * Produce a voice embedding vector for an import's parsed chat history.
 *
 * Condenses the user messages and voice card signals into a single text,
 * then embeds it with Voyage AI. Returns a 1024-dimensional vector.
 */
export async function embedVoiceProfile(
  history: ParsedChatHistory,
  voiceCard: VoiceCard
): Promise<number[]> {
  const userText = history.messages
    .filter((m) => m.role === "user")
    .slice(0, 100)
    .map((m) => m.content)
    .join("\n\n");

  const signalText = [
    `Vocabulary: ${voiceCard.vocabulary.slice(0, 20).join(", ")}`,
    `Register: ${voiceCard.emotionalRegister}`,
    `Hedges avoided: ${voiceCard.hedgesAvoided.join(", ")}`,
    `Jargon hated: ${voiceCard.jargonHated.join(", ")}`,
    userText.slice(0, 4000),
  ]
    .filter(Boolean)
    .join("\n\n");

  const client = await getClient();
  const result = await client.embed({
    model: EMBEDDING_MODEL,
    input: [signalText],
    inputType: "document",
  });

  const embedding = result.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new ParseError("Voyage AI returned no embedding");
  }

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new ParseError(
      `Expected ${EMBEDDING_DIMENSIONS}-dim embedding, got ${embedding.length}`
    );
  }

  return embedding as number[];
}
