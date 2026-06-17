/**
 * Benchmark embedding adapter.
 *
 * Reuses the same Voyage AI provider/model the voice-embedding path uses
 * (`voyage-3`, 1024-dim) so corpus vectors live in the same space as query
 * vectors at retrieval time. Kept as a thin `EmbedFn` so the collector can be
 * unit-tested with a fake provider.
 *
 * Voyage embeddings are not gated by the Anthropic monthly cap (that guard is
 * for generation calls); we still embed only NEW profiles — see the collector's
 * cache rule — so we never pay to re-embed an existing corpus row.
 */
import type { VoyageAIClient } from "voyageai";
import { ConfigurationError, ParseError } from "@/lib/errors";
import { BENCHMARK_EMBEDDING_DIM } from "@/lib/benchmark/types";
import type { EmbedFn } from "@/lib/benchmark/collector";

const EMBEDDING_MODEL = "voyage-3";

let _client: VoyageAIClient | undefined;

/**
 * Reset the module-level singleton — for use in tests only.
 *
 * Allows test suites to clear the cached client between tests so that a
 * different VOYAGE_API_KEY value in one test does not leak into another.
 * Calling this in production code is a no-op but should be avoided.
 */
export function _resetEmbedClient(): void {
  _client = undefined;
}

async function getClient(): Promise<VoyageAIClient> {
  if (!_client) {
    const apiKey = process.env["VOYAGE_API_KEY"];
    if (!apiKey) throw new ConfigurationError("VOYAGE_API_KEY is required for embeddings");
    // Dynamic import: voyageai's ESM build uses directory imports that break the
    // Node ESM loader if imported statically at module top-level.
    const { VoyageAIClient } = await import("voyageai");
    _client = new VoyageAIClient({ apiKey });
  }
  return _client;
}

/** Embed a single benchmark profile's rendered text into a 1024-dim vector. */
export const embedBenchmarkText: EmbedFn = async (text: string): Promise<number[]> => {
  const client = await getClient();
  const result = await client.embed({
    model: EMBEDDING_MODEL,
    input: [text],
    inputType: "document",
  });

  const embedding = result.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new ParseError("Voyage AI returned no embedding for benchmark profile");
  }
  if (embedding.length !== BENCHMARK_EMBEDDING_DIM) {
    throw new ParseError(
      `Expected ${BENCHMARK_EMBEDDING_DIM}-dim embedding, got ${embedding.length}`
    );
  }
  return embedding as number[];
};
