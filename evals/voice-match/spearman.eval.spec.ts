/**
 * Voice Match Score eval (SPEC §7 Week 4 row):
 *   "Eval: Spearman >= 0.7 vs. human rating on labeled pairs".
 *
 * This is a vitest-driven eval rather than a promptfoo rubric because the
 * scorer is deterministic (embedding cosine + voice-card feature overlap, no
 * LLM call). We run the REAL production `scoreVoiceMatch` over a labeled-pairs
 * fixture and assert the rank correlation between its score and the human
 * voice-fidelity rating clears the 0.7 bar.
 *
 * Embeddings are synthesized offline (see synthetic-embedder.ts) so CI needs no
 * Voyage/OpenAI key. The fixture is the eval's published rubric: each pair's
 * `human` field is the ground-truth label the algo must rank-agree with.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { scoreVoiceMatch } from "@/lib/voice-match/score";
import { spearman } from "@/lib/voice-match/spearman";
import type { VoiceCard } from "@/lib/voice-card/schema";
import { syntheticEmbed } from "./synthetic-embedder";

const SPEARMAN_TARGET = 0.7;

interface Fixture {
  voiceCards: Record<string, VoiceCard>;
  referenceTexts: Record<string, string>;
  pairs: { voice: string; candidate: string; human: number }[];
}

function loadFixture(): Fixture {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(
    join(here, "fixtures", "labeled-pairs.json"),
    "utf8",
  );
  return JSON.parse(raw) as Fixture;
}

describe("Voice Match Score eval — Spearman vs. human labels", () => {
  const fixture = loadFixture();

  it("has a non-trivial labeled set (>= 12 pairs)", () => {
    expect(fixture.pairs.length).toBeGreaterThanOrEqual(12);
  });

  it("ranks candidates in agreement with human voice-fidelity labels (Spearman >= 0.7)", () => {
    const algoScores: number[] = [];
    const humanScores: number[] = [];

    for (const pair of fixture.pairs) {
      const voiceCard = fixture.voiceCards[pair.voice];
      const referenceText = fixture.referenceTexts[pair.voice];
      expect(voiceCard, `missing voiceCard "${pair.voice}"`).toBeDefined();
      expect(referenceText, `missing referenceText "${pair.voice}"`).toBeDefined();

      const result = scoreVoiceMatch({
        voiceCard: voiceCard!,
        userVoiceEmbedding: syntheticEmbed(referenceText!),
        candidateText: pair.candidate,
        candidateEmbedding: syntheticEmbed(pair.candidate),
      });

      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) continue; // keep algoScores / humanScores in sync on failure
      algoScores.push(result.value.score);
      humanScores.push(pair.human);
    }

    const rho = spearman(algoScores, humanScores);
    // Surface the measured correlation in the test output for tuning.
    expect(
      rho,
      `Spearman ${rho.toFixed(3)} below target ${SPEARMAN_TARGET}`,
    ).toBeGreaterThanOrEqual(SPEARMAN_TARGET);
  });
});
