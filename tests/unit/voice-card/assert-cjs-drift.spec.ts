import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { VoiceCardSchema } from "@/lib/voice-card/schema";
import { FENCE_RE } from "@/lib/voice-card/fence";

// The promptfoo assertion helper is a hand-maintained CommonJS mirror of
// VoiceCardSchema (it cannot import the Zod schema directly). This test fails
// if the two drift apart: for every fixture, the cjs `pass` flag must match the
// Zod `safeParse(...).success` flag.
const require = createRequire(import.meta.url);
const assertVoiceCardSchema = require("../../../evals/helpers/assert-voice-card-schema.cjs") as (
  output: string,
) => { pass: boolean; score: number; reason: string };

const CJS_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../evals/helpers/assert-voice-card-schema.cjs");

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

  it("FENCE_RE in cjs has same source and flags as canonical fence.ts FENCE_RE", () => {
    // The CJS file cannot ESM-import fence.ts, so it carries a tracked copy.
    // Parse the source text to extract the regex literal and compare it to the
    // canonical export so that a copy-paste drift is caught at test time.
    const src = readFileSync(CJS_PATH, "utf8");
    // Match the FENCE_RE assignment: const FENCE_RE = /pattern/flags;
    const match = src.match(/const FENCE_RE = (\/.*?\/[gimsuy]*);/);
    expect(match).not.toBeNull();
    if (!match) return;
    // Evaluate the extracted regex literal safely via RegExp constructor
    const regexLiteralMatch = match[1].match(/^\/(.*)\/([gimsuy]*)$/s);
    expect(regexLiteralMatch).not.toBeNull();
    if (!regexLiteralMatch) return;
    const cjsSource = regexLiteralMatch[1];
    const cjsFlags = regexLiteralMatch[2];
    expect(cjsSource).toBe(FENCE_RE.source);
    expect(cjsFlags).toBe(FENCE_RE.flags);
  });

  it("assertVoiceCardSchema strips a ```json fence and returns pass:true for valid JSON", () => {
    const validCard = JSON.stringify(VALID);
    const fenced = `\`\`\`json\n${validCard}\n\`\`\``;
    expect(assertVoiceCardSchema(fenced).pass).toBe(true);
  });
});
