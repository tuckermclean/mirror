import type { ZodIssue } from "zod";

export type VoiceCardParseError =
  | { kind: "invalid_json"; raw: string }
  | { kind: "schema_mismatch"; issues: ZodIssue[] };
