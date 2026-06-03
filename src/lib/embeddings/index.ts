import VoyageAI from "voyageai";
import type { ParsedChatHistory } from "@/lib/parsers/types";
import type { VoiceCard } from "@/lib/voice/extract";

const EMBEDDING_MODEL = "voyage-3";
const EMBEDDING_DIMENSIONS = 3072;

let _client: InstanceType<typeof VoyageAI> | undefined;

function getClient(): InstanceType<typeof VoyageAI> {
  if (!_client) {
    const apiKey = process.env["VOYAGE_API_KEY"];
    if (!apiKey) throw new Error("VOYAGE_API_KEY is required for embeddings");
    _client = new VoyageAI({ apiKey });
  }
  return _client;
}

/**
 * Produce a voice embedding vector for an import's parsed chat history.
 *
 * Condenses the user messages and voice card signals into a single text,
 * then embeds it with Voyage AI. Returns a 3072-dimensional vector.
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
    `Topics: ${voiceCard.topics.join(", ")}`,
    `Style: ${voiceCard.writingStyle}`,
    userText.slice(0, 4000),
  ]
    .filter(Boolean)
    .join("\n\n");

  const client = getClient();
  const result = await client.embed({
    model: EMBEDDING_MODEL,
    input: [signalText],
    inputType: "document",
  });

  const embedding = result.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error("Voyage AI returned no embedding");
  }

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS}-dim embedding, got ${embedding.length}`
    );
  }

  return embedding as number[];
}
