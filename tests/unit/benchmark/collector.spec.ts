/**
 * Unit tests for the benchmark corpus collector (src/lib/benchmark/collector).
 *
 * The collector turns parsed fixture profiles into rows ready for
 * `benchmark_profiles`, embedding each via an injected provider. The DB and the
 * real embeddings client are injected so this stays a pure-logic unit test.
 *
 * AGENTS.md embedding-cache rule: a row that already has a non-null embedding
 * (an existing publicUrl in the corpus) MUST NOT be re-embedded.
 */
import { describe, it, expect, vi } from "vitest";
import { collectBenchmarkRows } from "@/lib/benchmark/collector";
import type { BenchmarkFixtureProfile } from "@/lib/benchmark/types";

const DIM = 1024;

function profile(over: Partial<BenchmarkFixtureProfile> = {}): BenchmarkFixtureProfile {
  return {
    industry: "tech",
    role: "Product Manager",
    seniority: "senior",
    publicUrl: "https://linkedin.test/in/p1",
    parsed: {
      headline: "Senior PM",
      about: "I build products",
      experience: [{ title: "PM", company: "Acme", bullets: ["shipped X"] }],
    },
    performanceSignals: { profileViews: 100, recruiterMessages: 5 },
    ...over,
  };
}

const fakeEmbed = (n = DIM) =>
  vi.fn(async (text: string) => {
    expect(typeof text).toBe("string");
    return new Array(n).fill(0.1) as number[];
  });

describe("collectBenchmarkRows", () => {
  it("embeds each new profile and returns insertable rows", async () => {
    const embed = fakeEmbed();
    const res = await collectBenchmarkRows([profile()], {
      embed,
      existingUrls: new Set<string>(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.rows.length).toBe(1);
    expect(res.value.rows[0]?.embedding.length).toBe(DIM);
    expect(res.value.rows[0]?.publicUrl).toBe("https://linkedin.test/in/p1");
    expect(res.value.skipped).toBe(0);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it("does NOT re-embed a profile whose publicUrl already exists (cache rule)", async () => {
    const embed = fakeEmbed();
    const res = await collectBenchmarkRows([profile()], {
      embed,
      existingUrls: new Set(["https://linkedin.test/in/p1"]),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.rows.length).toBe(0);
    expect(res.value.skipped).toBe(1);
    expect(embed).not.toHaveBeenCalled();
  });

  it("only embeds the new profiles in a mixed batch", async () => {
    const embed = fakeEmbed();
    const batch = [
      profile({ publicUrl: "https://linkedin.test/in/a" }),
      profile({ publicUrl: "https://linkedin.test/in/b" }),
      profile({ publicUrl: "https://linkedin.test/in/c" }),
    ];
    const res = await collectBenchmarkRows(batch, {
      embed,
      existingUrls: new Set(["https://linkedin.test/in/b"]),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.rows.length).toBe(2);
    expect(res.value.skipped).toBe(1);
    expect(embed).toHaveBeenCalledTimes(2);
  });

  it("dedupes duplicate publicUrls within the same batch", async () => {
    const embed = fakeEmbed();
    const batch = [
      profile({ publicUrl: "https://linkedin.test/in/dup" }),
      profile({ publicUrl: "https://linkedin.test/in/dup" }),
    ];
    const res = await collectBenchmarkRows(batch, {
      embed,
      existingUrls: new Set<string>(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.rows.length).toBe(1);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it("returns an error if the embedding has the wrong dimension", async () => {
    const embed = fakeEmbed(512);
    const res = await collectBenchmarkRows([profile()], {
      embed,
      existingUrls: new Set<string>(),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.name).toBe("ParseError");
  });

  it("carries industry/role/seniority/performanceSignals through to the row", async () => {
    const embed = fakeEmbed();
    const res = await collectBenchmarkRows(
      [profile({ industry: "sales", role: "AE", seniority: "lead" })],
      { embed, existingUrls: new Set<string>() }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = res.value.rows[0];
    expect(row?.industry).toBe("sales");
    expect(row?.role).toBe("AE");
    expect(row?.seniority).toBe("lead");
    expect(row?.performanceSignals).toEqual({ profileViews: 100, recruiterMessages: 5 });
  });
});
