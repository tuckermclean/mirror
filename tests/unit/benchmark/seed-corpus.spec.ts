/**
 * Unit tests for the seed orchestration (src/lib/benchmark/seed-corpus).
 *
 * `loadAllFixtures` is pure (fs only) and runs against the real fixture dir.
 * `seedBenchmarkCorpus` is exercised with an injected embed provider and the
 * collector's DB calls mocked, so no real Postgres/network is touched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

// Spy on readdirSync so we can assert it is called only once per
// seedBenchmarkCorpus invocation (Suggestion 9: no double readdirSync).
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readdirSync: vi.fn(actual.readdirSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
});

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
  it("loads and validates every JSON fixture in the directory", async () => {
    const { loadAllFixtures } = await import("@/lib/benchmark/seed-corpus");
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
  beforeEach(async () => {
    const fs = await import("node:fs");
    vi.mocked(fs.readdirSync).mockClear();
  });

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

  it("calls readdirSync exactly once per run (no redundant directory scan)", async () => {
    const fs = await import("node:fs");
    const { seedBenchmarkCorpus } = await import("@/lib/benchmark/seed-corpus");
    const embed = vi.fn(async () => new Array(1024).fill(0.1) as number[]);
    await seedBenchmarkCorpus({ fixturesDir: FIXTURE_DIR, embed });
    // readdirSync must be called once (inside loadAllFixtures) — not twice.
    // The double-call bug read the directory again just to derive filesRead.
    expect(vi.mocked(fs.readdirSync).mock.calls.length).toBe(1);
  });

  it("filesRead reflects the number of profiles parsed, not a second directory scan", async () => {
    const { seedBenchmarkCorpus } = await import("@/lib/benchmark/seed-corpus");
    const embed = vi.fn(async () => new Array(1024).fill(0.1) as number[]);
    const res = await seedBenchmarkCorpus({ fixturesDir: FIXTURE_DIR, embed });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 2 JSON files in the fixture dir → filesRead should be 2.
    expect(res.value.filesRead).toBe(2);
    // parsed is the flat profile count across all files.
    expect(res.value.parsed).toBe(16);
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
