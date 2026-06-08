/**
 * Benchmark corpus seeding orchestration.
 *
 * Reads the JSON fixture files, validates them, embeds NEW profiles only
 * (skipping any publicUrl already in the corpus — the embedding-cache rule),
 * and inserts idempotently. Returns a summary so the CLI can report it.
 *
 * The fixture directory and embed provider are injectable for tests; defaults
 * point at `fixtures/benchmark-profiles/*.json` and the Voyage adapter.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ParseError, type Result } from "@/lib/errors";
import type { BenchmarkFixtureProfile } from "@/lib/benchmark/types";
import { loadBenchmarkFixtures } from "@/lib/benchmark/parser";
import {
  collectBenchmarkRows,
  findExistingUrls,
  upsertBenchmarkRows,
  type EmbedFn,
} from "@/lib/benchmark/collector";
import { embedBenchmarkText } from "@/lib/benchmark/embed";

export type SeedSummary = {
  filesRead: number;
  parsed: number;
  embedded: number;
  inserted: number;
  skipped: number;
};

export type SeedOptions = {
  fixturesDir?: string;
  embed?: EmbedFn;
};

const DEFAULT_DIR = join(process.cwd(), "fixtures", "benchmark-profiles");

/** Read and validate every `*.json` fixture in `dir` into one flat list. */
export function loadAllFixtures(
  dir: string
): Result<BenchmarkFixtureProfile[], ParseError> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const all: BenchmarkFixtureProfile[] = [];
  for (const file of files) {
    const res = loadBenchmarkFixtures(readFileSync(join(dir, file), "utf8"));
    if (!res.ok) {
      return { ok: false, error: new ParseError(`${file}: ${res.error.message}`) };
    }
    all.push(...res.value);
  }
  return { ok: true, value: all };
}

/**
 * Seed the benchmark corpus from fixture files. Idempotent: re-running embeds
 * and inserts only profiles whose publicUrl is not already present.
 */
export async function seedBenchmarkCorpus(
  opts: SeedOptions = {}
): Promise<Result<SeedSummary, ParseError>> {
  const dir = opts.fixturesDir ?? DEFAULT_DIR;
  const embed = opts.embed ?? embedBenchmarkText;

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const loaded = loadAllFixtures(dir);
  if (!loaded.ok) return loaded;
  const profiles = loaded.value;

  const existingUrls = await findExistingUrls(profiles.map((p) => p.publicUrl));
  const collected = await collectBenchmarkRows(profiles, { embed, existingUrls });
  if (!collected.ok) return collected;

  const inserted = await upsertBenchmarkRows(collected.value.rows);

  return {
    ok: true,
    value: {
      filesRead: files.length,
      parsed: profiles.length,
      embedded: collected.value.rows.length,
      inserted,
      skipped: collected.value.skipped,
    },
  };
}
