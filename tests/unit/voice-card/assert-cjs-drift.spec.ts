import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { VoiceCardSchema } from "@/lib/voice-card/schema";

// The promptfoo assertion helper is a hand-maintained CommonJS mirror of
// VoiceCardSchema (it cannot import the Zod schema directly). This test fails
// if the two drift apart: for every fixture, the cjs `pass` flag must match the
// Zod `safeParse(...).success` flag.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS mirror has no ESM entry
const assertVoiceCardSchema = require("../../../evals/helpers/assert-voice-card-schema.cjs") as (
  output: string,
) => { pass: boolean; score: number; reason: string };

const VALID = {
  vocabulary: ["authentic", "driven"],
  hedgesAvoided: ["kind of"],
  sentenceLengthDistribution: { short: 0.4, medium: 0.4, long: 0.2 },
  emotionalRegister: "confident",
  jargonHated: ["synergy"],
};

const FIXTURES: Record<string, unknown> = {
  valid: VALID,
  emptyObject: {},
  wrongVocabType: { ...VALID, vocabulary: "nope" },
  emptyStringInArray: { ...VALID, vocabulary: ["ok", ""] },
  emptyEmotionalRegister: { ...VALID, emotionalRegister: "" },
  distributionOverOne: { ...VALID, sentenceLengthDistribution: { short: 1.5, medium: 0, long: 0 } },
  distributionBadSum: { ...VALID, sentenceLengthDistribution: { short: 0.5, medium: 0.5, long: 0.5 } },
  distributionWithinTolerance: {
    ...VALID,
    sentenceLengthDistribution: { short: 0.33, medium: 0.34, long: 0.33 },
  },
  distributionWrongType: { ...VALID, sentenceLengthDistribution: { short: "x", medium: 0, long: 0 } },
  missingField: {
    vocabulary: ["a"],
    hedgesAvoided: [],
    sentenceLengthDistribution: { short: 0.5, medium: 0.5, long: 0 },
    jargonHated: [],
  },
};

describe("assert-voice-card-schema.cjs drift guard", () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    it(`agrees with VoiceCardSchema for fixture: ${name}`, () => {
      const zodPass = VoiceCardSchema.safeParse(fixture).success;
      const cjsPass = assertVoiceCardSchema(JSON.stringify(fixture)).pass;
      expect(cjsPass).toBe(zodPass);
    });
  }

  it("the cjs accepts the canonical valid fixture", () => {
    expect(assertVoiceCardSchema(JSON.stringify(VALID)).pass).toBe(true);
  });

  it("the cjs rejects non-JSON output", () => {
    expect(assertVoiceCardSchema("not json").pass).toBe(false);
  });
});
