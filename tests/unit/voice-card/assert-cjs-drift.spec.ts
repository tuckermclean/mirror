import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { VoiceCardSchema } from "@/lib/voice-card/schema";

// The promptfoo assertion helper is a hand-maintained CommonJS mirror of
// VoiceCardSchema (it cannot import the Zod schema directly). This test fails
// if the two drift apart: for every fixture, the cjs `pass` flag must match the
// Zod `safeParse(...).success` flag.
const require = createRequire(import.meta.url);
const assertVoiceCardSchema = require("../../../evals/helpers/assert-voice-card-schema.cjs") as (
  output: string,
) => { pass: boolean; score: number; reason: string };

// The CJS mirrors Zod's type-level constraints. Distribution sum/range
// constraints are intentionally NOT mirrored (the schema's refine() is a
// run-time safeguard; the CJS just ensures the fields are numeric).
const VALID = {
  vocabulary: ["authentic", "driven"],
  hedgesAvoided: ["kind of"],
  sentenceLengthDistribution: { short: 40, medium: 40, long: 20 },
  emotionalRegister: "confident",
  jargonHated: ["synergy"],
};

const FIXTURES: Record<string, { data: unknown; expectPass: boolean }> = {
  valid: { data: VALID, expectPass: true },
  emptyObject: { data: {}, expectPass: false },
  wrongVocabType: { data: { ...VALID, vocabulary: "nope" }, expectPass: false },
  distributionWrongType: {
    data: { ...VALID, sentenceLengthDistribution: { short: "x", medium: 0, long: 0 } },
    expectPass: false,
  },
  missingField: {
    data: {
      vocabulary: ["a"],
      hedgesAvoided: [],
      sentenceLengthDistribution: { short: 50, medium: 50, long: 0 },
      jargonHated: [],
      // emotionalRegister intentionally absent
    },
    expectPass: false,
  },
};

describe("assert-voice-card-schema.cjs drift guard", () => {
  for (const [name, { data, expectPass }] of Object.entries(FIXTURES)) {
    it(`agrees with VoiceCardSchema for fixture: ${name}`, () => {
      const zodPass = VoiceCardSchema.safeParse(data).success;
      const cjsPass = assertVoiceCardSchema(JSON.stringify(data)).pass;
      expect(zodPass).toBe(expectPass);
      expect(cjsPass).toBe(zodPass);
    });
  }

  it("the cjs accepts the canonical valid fixture", () => {
    expect(assertVoiceCardSchema(JSON.stringify(VALID)).pass).toBe(true);
  });

  it("the cjs rejects non-JSON output", () => {
    expect(assertVoiceCardSchema("not json").pass).toBe(false);
  });

  it("assertVoiceCardSchema strips a ```json fence and returns pass:true for valid JSON", () => {
    const validCard = JSON.stringify(VALID);
    const fenced = `\`\`\`json\n${validCard}\n\`\`\``;
    expect(assertVoiceCardSchema(fenced).pass).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FENCE_RE parity: evals/helpers/strip-fence.cjs must stay identical to
// src/lib/voice-card/fence.ts (canonical source).  If these drift, fence
// stripping behaves differently in evals vs. production.
// ---------------------------------------------------------------------------
describe("FENCE_RE parity — strip-fence.cjs vs fence.ts", () => {
  const stripFenceCjs = require("../../../evals/helpers/strip-fence.cjs") as {
    FENCE_RE: RegExp;
  };

  it("FENCE_RE source is identical in CJS helper and canonical fence.ts", async () => {
    // Dynamic import so we pick up the live TS module (compiled by Vitest).
    const { FENCE_RE: canonicalRe } = await import("@/lib/voice-card/fence");
    const cjsRe = stripFenceCjs.FENCE_RE;

    // Compare source and flags separately for a clear failure message.
    expect(cjsRe.source).toBe(canonicalRe.source);
    expect(cjsRe.flags).toBe(canonicalRe.flags);
  });
});
