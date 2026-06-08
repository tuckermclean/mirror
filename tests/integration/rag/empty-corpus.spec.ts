/**
 * Integration tests for src/lib/rag/retrieval.ts — empty-corpus behaviour.
 *
 * The benchmark corpus is populated in Week 4. Until then (and any time the
 * table is empty) k-NN retrieval MUST return [] rather than throw. Run against
 * a real Postgres; skipped when DATABASE_URL is absent.
 *
 *   DATABASE_URL=... pnpm test:integration
 */
import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { benchmarkProfiles } from "@/db/schema";
import { retrieveSimilarProfiles } from "@/lib/rag/retrieval";

const describeWithDb = process.env["DATABASE_URL"] ? describe : describe.skip;

describeWithDb("retrieveSimilarProfiles — empty corpus", () => {
  it("returns [] when the benchmark_profiles table has no rows", async () => {
    // Ensure empty for this assertion (test DB; safe to clear the corpus).
    await db.delete(benchmarkProfiles);
    const embedding = new Array(1024).fill(0.1) as number[];
    const results = await retrieveSimilarProfiles(embedding);
    expect(results).toEqual([]);
  });

  it("defaults to a top-5 limit", async () => {
    const embedding = new Array(1024).fill(0.1) as number[];
    const results = await retrieveSimilarProfiles(embedding);
    expect(results.length).toBeLessThanOrEqual(5);
  });
});
