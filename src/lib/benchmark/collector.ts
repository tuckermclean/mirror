/**
 * Benchmark corpus collector.
 *
 * Turns validated fixture profiles into `benchmark_profiles` rows: each new
 * profile is embedded via an injected provider, then persisted idempotently.
 *
 * Embedding-cache rule (AGENTS.md): a profile whose `publicUrl` already exists
 * in the corpus is NOT re-embedded. The pure `collectBenchmarkRows` takes the
 * set of existing URLs so it stays unit-testable without DB or network.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { benchmarkProfiles } from "@/db/schema";
import { ParseError, type Result } from "@/lib/errors";
import {
  BENCHMARK_EMBEDDING_DIM,
  type BenchmarkFixtureProfile,
  type BenchmarkRow,
} from "@/lib/benchmark/types";
import { buildEmbeddingText } from "@/lib/benchmark/parser";

/** Embeds the rendered profile text into a 1024-dim vector. */
export type EmbedFn = (text: string) => Promise<number[]>;

export type CollectOptions = {
  embed: EmbedFn;
  /** publicUrls already present in the corpus — these are skipped (cache rule). */
  existingUrls: Set<string>;
};

export type CollectResult = {
  rows: BenchmarkRow[];
  /** How many input profiles were skipped (already present or in-batch dupes). */
  skipped: number;
};

const ok = <T>(value: T): Result<T, ParseError> => ({ ok: true, value });
const err = (message: string): Result<never, ParseError> => ({
  ok: false,
  error: new ParseError(message),
});

/**
 * Embed each NEW profile (publicUrl not in `existingUrls` and not already seen
 * in this batch) and return insertable rows. Pure aside from the injected embed.
 */
export async function collectBenchmarkRows(
  profiles: BenchmarkFixtureProfile[],
  opts: CollectOptions
): Promise<Result<CollectResult, ParseError>> {
  const rows: BenchmarkRow[] = [];
  const seen = new Set<string>(opts.existingUrls);
  let skipped = 0;

  for (const p of profiles) {
    if (seen.has(p.publicUrl)) {
      skipped++;
      continue;
    }
    seen.add(p.publicUrl);

    const embedding = await opts.embed(buildEmbeddingText(p.parsed));
    if (embedding.length !== BENCHMARK_EMBEDDING_DIM) {
      return err(
        `embedding for ${p.publicUrl} has ${embedding.length} dims, expected ${BENCHMARK_EMBEDDING_DIM}`
      );
    }
    rows.push({
      industry: p.industry,
      role: p.role,
      seniority: p.seniority,
      publicUrl: p.publicUrl,
      parsed: p.parsed,
      embedding,
      performanceSignals: p.performanceSignals,
    });
  }

  return ok({ rows, skipped });
}

/**
 * Look up which of `urls` already exist in `benchmark_profiles`.
 * Returns a Set for O(1) membership tests in the collector.
 */
export async function findExistingUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const existing = await db
    .select({ publicUrl: benchmarkProfiles.publicUrl })
    .from(benchmarkProfiles)
    .where(inArray(benchmarkProfiles.publicUrl, urls));
  return new Set(existing.map((r) => r.publicUrl));
}

/**
 * Insert rows idempotently. Re-queries existing URLs immediately before insert
 * to reduce duplicate work on sequential re-runs; the INSERT itself uses
 * ON CONFLICT DO NOTHING so truly concurrent seed runs are also safe (the DB
 * constraint is the authoritative guard, not this SELECT which is a plain
 * read without FOR UPDATE).
 * Returns the number of rows actually inserted.
 */
export async function upsertBenchmarkRows(rows: BenchmarkRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const existing = await findExistingUrls(rows.map((r) => r.publicUrl));
  const fresh = rows.filter((r) => !existing.has(r.publicUrl));
  if (fresh.length === 0) return 0;
  await db
    .insert(benchmarkProfiles)
    .values(
      fresh.map((r) => ({
        industry: r.industry,
        role: r.role,
        seniority: r.seniority,
        publicUrl: r.publicUrl,
        parsed: r.parsed,
        embedding: r.embedding,
        performanceSignals: r.performanceSignals,
      }))
    )
    .onConflictDoNothing();
  return fresh.length;
}
