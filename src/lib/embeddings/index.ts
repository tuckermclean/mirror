import { ConfigurationError } from "@/lib/errors";

const VOYAGE_MODEL = "voyage-3-large";
const OPENAI_MODEL = "text-embedding-3-large";
const DIMENSIONS = 3072;

type EmbeddingProvider = "voyage" | "openai";

function getProvider(): EmbeddingProvider {
  const raw = process.env["EMBEDDING_PROVIDER"] ?? "voyage";
  if (raw === "openai") return "openai";
  return "voyage";
}

async function embedWithVoyage(text: string): Promise<number[]> {
  const apiKey = process.env["VOYAGE_API_KEY"];
  if (!apiKey) {
    throw new ConfigurationError("VOYAGE_API_KEY is not set");
  }

  // voyageai package uses CommonJS; dynamic import avoids ESM interop issues
  const { VoyageAIClient } = (await import("voyageai")) as {
    VoyageAIClient: new (opts: { apiKey: string }) => {
      embed: (params: {
        input: string[];
        model: string;
        outputDimension?: number;
      }) => Promise<{ data: Array<{ embedding: number[] }> }>;
    };
  };

  const client = new VoyageAIClient({ apiKey });
  const response = await client.embed({
    input: [text],
    model: VOYAGE_MODEL,
    outputDimension: DIMENSIONS,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding || embedding.length !== DIMENSIONS) {
    throw new ConfigurationError(
      `Voyage embedding returned unexpected dimensions: ${embedding?.length ?? 0}`
    );
  }

  return embedding;
}

async function embedWithOpenAI(text: string): Promise<number[]> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new ConfigurationError("OPENAI_API_KEY is not set");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: OPENAI_MODEL,
      dimensions: DIMENSIONS,
    }),
  });

  if (!response.ok) {
    throw new ConfigurationError(
      `OpenAI embeddings API error: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  const embedding = data.data[0]?.embedding;
  if (!embedding || embedding.length !== DIMENSIONS) {
    throw new ConfigurationError(
      `OpenAI embedding returned unexpected dimensions: ${embedding?.length ?? 0}`
    );
  }

  return embedding;
}

/**
 * Embed a text string using the configured provider (Voyage or OpenAI).
 * Returns a float32 vector of length 3072.
 */
export async function embed(text: string): Promise<number[]> {
  const provider = getProvider();
  if (provider === "openai") {
    return embedWithOpenAI(text);
  }
  return embedWithVoyage(text);
}
