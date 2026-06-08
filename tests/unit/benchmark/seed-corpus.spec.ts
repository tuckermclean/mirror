/**
 * Unit tests for the seed orchestration (src/lib/benchmark/seed-corpus).
 *
 * `loadAllFixtures` is pure (fs only) and runs against the real fixture dir.
 * `seedBenchmarkCorpus` is exercised with an injected embed provider and the
 * collector's DB calls mocked, so no real Postgres/network is touched.
 */
import { describe, it, expect, vi } from "vitest";
import { join } from "node:path";
import { loadAllFixtures } from "@/lib/benchmark/seed-corpus";

const FIXTURE_DIR = join(process.cwd(), "fixtures", "benchmark-profiles");

vi.mock("@/lib/benchmark/collector", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/benchmark/collector")>();
  return {
    ...actual,
    findExistingUrls: vi.fn(async () => new Set<string>()),
    upsertBenchmarkRows: vi.fn(async (rows: unknown[]) => rows.length),
  };
});

describe("loadAllFixtures", () => {
  it("loads and validates every JSON fixture in the directory", () => {
    const res = loadAllFixtures(FIXTURE_DIR);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // clusters.json (11) + sre-top5.json (5) = 16 profiles.
    expect(res.value.length).toBe(16);
    for (const p of res.value) {
      expect(p.publicUrl).toMatch(/^https?:\/\//);
      expect(p.parsed.headline.length).toBeGreaterThan(0);
    }
  });
});

describe("seedBenchmarkCorpus", () => {
  it("embeds and inserts all fixtures when the corpus is empty", async () => {
    const { seedBenchmarkCorpus } = await import("@/lib/benchmark/seed-corpus");
    const embed = vi.fn(async () => new Array(1024).fill(0.1) as number[]);
    const res = await seedBenchmarkCorpus({ fixturesDir: FIXTURE_DIR, embed });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.parsed).toBe(16);
    expect(res.value.embedded).toBe(16);
    expect(res.value.inserted).toBe(16);
    expect(res.value.skipped).toBe(0);
    expect(embed).toHaveBeenCalledTimes(16);
  });

  it("skips profiles already present (idempotent re-run)", async () => {
    const collector = await import("@/lib/benchmark/collector");
    vi.mocked(collector.findExistingUrls).mockResolvedValueOnce(
      new Set(["https://linkedin.test/in/pm-bench-01"])
    );
    const { seedBenchmarkCorpus } = await import("@/lib/benchmark/seed-corpus");
    const embed = vi.fn(async () => new Array(1024).fill(0.1) as number[]);
    const res = await seedBenchmarkCorpus({ fixturesDir: FIXTURE_DIR, embed });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.skipped).toBe(1);
    expect(res.value.embedded).toBe(15);
    expect(embed).toHaveBeenCalledTimes(15);
  });
});
