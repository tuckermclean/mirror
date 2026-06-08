import { isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { benchmarkProfiles } from "@/db/schema";

/**
 * A benchmark exemplar retrieved for generation, with its cosine similarity to
 * the query embedding (1 = identical direction, 0 = orthogonal).
 */
export type SimilarProfile = {
  id: string;
  industry: string;
  role: string;
  seniority: string;
  parsed: unknown;
  performanceSignals: unknown;
  similarity: number;
};

export type RetrievalOptions = {
  /** Max exemplars to return. Default 5 (top-5 exemplars feed generation). */
  limit?: number;
  /** Drop results below this cosine similarity (0-1). Default: no floor. */
  minSimilarity?: number;
};

const DEFAULT_LIMIT = 5;

/**
 * k-NN retrieval of the most similar benchmark profiles to `embedding`.
 *
 * Uses the pgvector cosine-distance operator `<=>` via Drizzle's `sql` template
 * tag (the only place raw SQL is permitted, per AGENTS.md). The stored column is
 * `vector(1024)`; we cast both sides to `halfvec(1024)` so the query rides the
 * `benchmark_profiles_embedding_hnsw_idx` HNSW index (halfvec_cosine_ops).
 *
 * Cosine similarity is `1 - (embedding <=> query)`. Results are ordered nearest
 * first and optionally filtered by `minSimilarity`.
 *
 * Behaves correctly against an empty corpus (Week 4 populates it): returns [].
 */
export async function retrieveSimilarProfiles(
  embedding: number[],
  opts: RetrievalOptions = {}
): Promise<SimilarProfile[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const literal = `[${embedding.join(",")}]`;
  const distance = sql<number>`(embedding::halfvec(1024)) <=> (${literal}::halfvec(1024))`;

  const rows = await db
    .select({
      id: benchmarkProfiles.id,
      industry: benchmarkProfiles.industry,
      role: benchmarkProfiles.role,
      seniority: benchmarkProfiles.seniority,
      parsed: benchmarkProfiles.parsed,
      performanceSignals: benchmarkProfiles.performanceSignals,
      distance,
    })
    .from(benchmarkProfiles)
    .where(isNotNull(benchmarkProfiles.embedding))
    .orderBy(distance)
    .limit(limit);

  const results: SimilarProfile[] = rows.map((r) => ({
    id: r.id,
    industry: r.industry,
    role: r.role,
    seniority: r.seniority,
    parsed: r.parsed,
    performanceSignals: r.performanceSignals,
    similarity: 1 - Number(r.distance),
  }));

  const floor = opts.minSimilarity;
  return floor == null ? results : results.filter((r) => r.similarity >= floor);
}
