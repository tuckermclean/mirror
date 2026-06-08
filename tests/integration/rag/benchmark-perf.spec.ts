/**
 * Performance test: k-NN retrieval latency at 5k benchmark vectors.
 *
 * SPEC Wk4 acceptance: "retrieval < 200ms at 5k vectors". Seeds 5,000 synthetic
 * 1024-dim vectors into benchmark_profiles, tunes hnsw.ef_search, then asserts
 * median retrieval latency stays under the budget. Gated on DATABASE_URL.
 *
 *   DATABASE_URL=... pnpm test:integration
 *
 * Seeding 5k rows takes a few seconds, so the suite uses an extended timeout.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { like } from "drizzle-orm";

const describeWithDb = process.env["DATABASE_URL"] ? describe : describe.skip;

const DIM = 1024;
const N = 5000;
const BUDGET_MS = 200;
const TAG = `perf-${Date.now()}`;
const URL_PREFIX = `https://perf.test/${TAG}/`;

function randomVector(): number[] {
  const v = new Array(DIM) as number[];
  for (let i = 0; i < DIM; i++) v[i] = Math.random();
  return v;
}

describeWithDb("retrieval latency at 5k vectors", () => {
  beforeAll(async () => {
    const { upsertBenchmarkRows } = await import("@/lib/benchmark/collector");
    // Insert in chunks to keep statement size reasonable.
    const CHUNK = 500;
    for (let start = 0; start < N; start += CHUNK) {
      const rows = Array.from({ length: Math.min(CHUNK, N - start) }, (_, j) => ({
        industry: "tech",
        role: "sre",
        seniority: "senior",
        publicUrl: `${URL_PREFIX}${start + j}`,
        parsed: { headline: `perf ${start + j}`, about: "", experience: [] },
        embedding: randomVector(),
        performanceSignals: null,
      }));
      await upsertBenchmarkRows(rows);
    }
  }, 120_000);

  afterAll(async () => {
    const { db } = await import("@/db/client");
    const { benchmarkProfiles } = await import("@/db/schema");
    await db.delete(benchmarkProfiles).where(like(benchmarkProfiles.publicUrl, `${URL_PREFIX}%`));
  });

  it("retrieves top-5 in under 200ms (median of 5 runs)", async () => {
    const { retrieveSimilarProfiles } = await import("@/lib/rag/retrieval");
    const { withEfSearch } = await import("@/lib/rag/ef-search");

    const latencies: number[] = [];
    for (let i = 0; i < 5; i++) {
      const q = randomVector();
      const start = performance.now();
      const results = await withEfSearch(40, () => retrieveSimilarProfiles(q, { limit: 5 }));
      latencies.push(performance.now() - start);
      expect(results.length).toBeGreaterThan(0);
    }
    latencies.sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length / 2)] ?? Infinity;
    expect(median).toBeLessThan(BUDGET_MS);
  }, 60_000);
});
