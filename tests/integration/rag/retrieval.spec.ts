/**
 * Integration tests for src/lib/rag/retrieval.ts — pgvector k-NN.
 *
 * The export check runs everywhere. The k-NN behaviour/latency checks need a
 * real Postgres with pgvector, so they follow the repo convention of gating on
 * DATABASE_URL (they are exercised in CI where the DB is present, and the Wk4
 * corpus job seeds the full 5k-vector benchmark). Each DB test plants its own
 * known vector so it is self-contained.
 *
 *   DATABASE_URL=... pnpm test:integration
 */
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";

const itWithDb = process.env["DATABASE_URL"] ? it : it.skip;

// pgvector column is vector(1024); the query vector must match that dimension.
const DIM = 1024;
const PLANTED_URL = `https://example.test/rag-planted-${Date.now()}`;

describe("pgvector k-NN retrieval", () => {
  it("exports a retrieveSimilarProfiles function", async () => {
    const { retrieveSimilarProfiles } = await import("@/lib/rag/retrieval");
    expect(typeof retrieveSimilarProfiles).toBe("function");
  });

  afterEach(async () => {
    if (!process.env["DATABASE_URL"]) return;
    const { db } = await import("@/db/client");
    const { benchmarkProfiles } = await import("@/db/schema");
    await db.delete(benchmarkProfiles).where(eq(benchmarkProfiles.publicUrl, PLANTED_URL));
  });

  itWithDb("returns the planted near-duplicate with cosine similarity >= 0.7", async () => {
    const { db } = await import("@/db/client");
    const { benchmarkProfiles } = await import("@/db/schema");
    const { retrieveSimilarProfiles } = await import("@/lib/rag/retrieval");

    const embedding = new Array(DIM).fill(0.1) as number[];
    await db.insert(benchmarkProfiles).values({
      industry: "tech",
      role: "sre",
      seniority: "senior",
      publicUrl: PLANTED_URL,
      parsed: { headline: "planted" },
      embedding,
    });

    const results = await retrieveSimilarProfiles(embedding, { limit: 1, minSimilarity: 0.7 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.similarity).toBeGreaterThanOrEqual(0.7);
  });

  itWithDb("retrieval latency is under 200ms", async () => {
    const { retrieveSimilarProfiles } = await import("@/lib/rag/retrieval");
    const embedding = new Array(DIM).fill(0.1) as number[];
    const start = Date.now();
    await retrieveSimilarProfiles(embedding, { limit: 5 });
    expect(Date.now() - start).toBeLessThan(200);
  });
});
