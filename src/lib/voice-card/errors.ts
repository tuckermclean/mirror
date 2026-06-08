import type { ZodIssue } from "zod";

/**
 * Error returned (never thrown) by `parseVoiceCardOutput` when LLM output
 * cannot be turned into a valid VoiceCard.
 *
 * Re-exported from `@/lib/errors` for backwards compatibility with existing
 * consumers that import it from there.
 */
export type VoiceCardParseError =
  | { kind: "invalid_json"; raw: string }
  | { kind: "schema_mismatch"; issues: ZodIssue[] };
