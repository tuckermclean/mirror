#!/usr/bin/env -S tsx
/**
 * Benchmark corpus seed CLI.
 *
 *   DATABASE_URL=... VOYAGE_API_KEY=... pnpm benchmark:seed
 *
 * Loads the JSON fixtures in fixtures/benchmark-profiles/, embeds only NEW
 * profiles (publicUrl not already in the corpus), and inserts them idempotently.
 * Safe to re-run — it skips anything already present.
 */
import { seedBenchmarkCorpus } from "@/lib/benchmark/seed-corpus";
import { logger } from "@/lib/logger";

async function main(): Promise<void> {
  logger.info("benchmark:seed starting");
  const res = await seedBenchmarkCorpus();
  if (!res.ok) {
    logger.error("benchmark:seed failed", { error: res.error.message });
    process.exitCode = 1;
    return;
  }
  logger.info("benchmark:seed complete", { ...res.value });
}

main().catch((err: unknown) => {
  logger.error("benchmark:seed crashed", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exitCode = 1;
});
