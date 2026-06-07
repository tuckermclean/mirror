import type { Result } from "@/lib/errors";
import { VoiceCardSchema, type VoiceCard } from "./schema";
import type { VoiceCardParseError } from "./errors";

const FENCE_RE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;

export function parseVoiceCardOutput(text: string): Result<VoiceCard, VoiceCardParseError> {
  const raw = text.trim();
  const stripped = FENCE_RE.exec(raw)?.[1]?.trim() ?? raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { ok: false, error: { kind: "invalid_json", raw: text } };
  }

  const result = VoiceCardSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: { kind: "schema_mismatch", issues: result.error.issues } };
  }

  return { ok: true, value: result.data };
}
