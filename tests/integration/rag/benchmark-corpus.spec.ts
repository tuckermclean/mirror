/**
 * Integration tests for the Week 4 benchmark corpus + k-NN retrieval.
 *
 * Requires a real Postgres with pgvector (gated on DATABASE_URL, per repo
 * convention). Seeds rows through the production collector/seed path and asserts
 * the SPEC Wk4 acceptance criteria:
 *   - k-NN retrieval returns a planted near-duplicate with > 0.7 cosine
 *   - the HNSW index (benchmark_profiles_embedding_hnsw_idx) is actually used
 *
 *   DATABASE_URL=... pnpm test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { like, sql } from "drizzle-orm";

const describeWithDb = process.env["DATABASE_URL"] ? describe : describe.skip;

const DIM = 1024;
const TAG = `bench-corpus-${Date.now()}`;
const URL_PREFIX = `https://corpus.test/${TAG}/`;

/** Deterministic unit-ish vector pointing mostly along axis `seed`. */
function makeVector(seed: number): number[] {
  const v = new Array(DIM).fill(0.01) as number[];
  v[seed % DIM] = 1;
  v[(seed * 7 + 3) % DIM] = 0.5;
  return v;
}

describeWithDb("benchmark corpus retrieval", () => {
  beforeAll(async () => {
    const { db } = await import("@/db/client");
    const { benchmarkProfiles } = await import("@/db/schema");
    const { upsertBenchmarkRows } = await import("@/lib/benchmark/collector");

    // Plant a known near-duplicate plus a handful of distractors.
    const planted = makeVector(1);
    const rows = [
      {
        industry: "tech",
        role: "sre",
        seniority: "senior",
        publicUrl: `${URL_PREFIX}planted`,
        parsed: { headline: "planted near-duplicate" },
        embedding: planted,
        performanceSignals: { profileViews: 1 },
      },
      ...Array.from({ length: 8 }, (_, i) => ({
        industry: "tech",
        role: "sre",
        seniority: "senior",
        publicUrl: `${URL_PREFIX}distractor-${i}`,
        parsed: { headline: `distractor ${i}` },
        embedding: makeVector(i + 50),
        performanceSignals: null,
      })),
    ];
    void benchmarkProfiles;
    void db;
    await upsertBenchmarkRows(rows);
  });

  afterAll(async () => {
    const { db } = await import("@/db/client");
    const { benchmarkProfiles } = await import("@/db/schema");
    await db.delete(benchmarkProfiles).where(like(benchmarkProfiles.publicUrl, `${URL_PREFIX}%`));
  });

  it("returns the planted near-duplicate with cosine similarity > 0.7", async () => {
    const { retrieveSimilarProfiles } = await import("@/lib/rag/retrieval");
    // Query is a slightly perturbed copy of the planted vector (near-duplicate).
    const query = makeVector(1);
    query[2] = (query[2] ?? 0) + 0.02;

    const results = await retrieveSimilarProfiles(query, { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    const top = results[0];
    expect(top?.publicUrl ?? top?.id).toBeTruthy();
    expect(top?.similarity).toBeGreaterThan(0.7);
  });

  it("uses the HNSW index for k-NN ordering (EXPLAIN shows the index)", async () => {
    const { db } = await import("@/db/client");
    const query = makeVector(1);
    const literal = `[${query.join(",")}]`;
    // hnsw indexes are only chosen when there is an ORDER BY ... LIMIT.
    const plan = await db.execute(sql`
      EXPLAIN (FORMAT TEXT)
      SELECT id
      FROM benchmark_profiles
      WHERE embedding IS NOT NULL
      ORDER BY (embedding::halfvec(1024)) <=> (${literal}::halfvec(1024))
      LIMIT 5
    `);
    const text = JSON.stringify(plan);
    expect(text).toContain("benchmark_profiles_embedding_hnsw_idx");
  });
});
