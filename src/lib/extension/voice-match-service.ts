import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db/client";
import { imports, users } from "@/db/schema";
import { readImportParsed } from "@/lib/db/pii-read";
import { embedVoiceProfile } from "@/lib/embeddings";
import type { Result } from "@/lib/errors";
import type { ParsedChatHistory } from "@/lib/parsers/types";
import { extractVoiceCard } from "@/lib/voice/extract";
import type { VoiceCard } from "@/lib/voice-card/schema";
import { scoreVoiceMatch } from "@/lib/voice-match";
import type { VoiceMatchScore } from "@/lib/voice-match";

/**
 * Service errors surfaced to the route as discriminated strings.
 * `missing_voice_embedding` maps to 409 (the user has not yet built a voice
 * profile, so there is nothing to score against).
 */
export type VoiceMatchServiceError = "missing_voice_embedding";

/**
 * A neutral voice card used to embed the *candidate* profile text. The shared
 * `embedVoiceProfile` helper folds voice-card signal text into the embedding;
 * passing the user's own card would leak their fingerprint into the candidate
 * vector and inflate cosine similarity. A neutral card keeps the candidate
 * embedding a faithful representation of the profile text alone.
 *
 * Frozen to prevent accidental mutation across call sites.
 */
const NEUTRAL_VOICE_CARD: VoiceCard = Object.freeze({
  vocabulary: [],
  hedgesAvoided: [],
  sentenceLengthDistribution: { short: 34, medium: 33, long: 33 },
  emotionalRegister: "",
  jargonHated: [],
});

/** The user's persisted voice fingerprint: embedding + derived voice card. */
type VoiceProfile = { embedding: number[]; voiceCard: VoiceCard };

/**
 * Load the user's active voice profile: the persisted `voice_embedding` and the
 * voice card derived from the import's parsed chat history.
 *
 * `imports.parsed` is a PII column, so it is read through `readImportParsed`
 * (audit-logged, fail-closed). `voice_embedding` is the derived vector — not in
 * the gated PII set — so it is read directly.
 */
async function loadVoiceProfile(
  internalUserId: string
): Promise<Result<VoiceProfile, VoiceMatchServiceError>> {
  const rows = await db
    .select({ importId: imports.id, embedding: imports.voiceEmbedding })
    .from(users)
    .innerJoin(imports, eq(users.voiceProfileId, imports.id))
    .where(and(eq(users.id, internalUserId), isNotNull(imports.voiceEmbedding)))
    .limit(1);

  const row = rows[0];
  if (!row?.embedding || row.embedding.length === 0) {
    return { ok: false, error: "missing_voice_embedding" };
  }

  const parsedRow = await readImportParsed(
    row.importId,
    internalUserId,
    "extension voice-match — derive voice card for live profile scoring"
  );
  const history = parsedRow?.parsed as ParsedChatHistory | null | undefined;
  if (!history) return { ok: false, error: "missing_voice_embedding" };

  return {
    ok: true,
    value: { embedding: row.embedding, voiceCard: extractVoiceCard(history) },
  };
}

/**
 * Compute the Voice Match Score for ad-hoc live profile text against the user's
 * persisted voice profile (SPEC §6.3).
 *
 * The candidate text is embedded once, in-memory, and never persisted (it is
 * not a stored row, so the embedding-cache rule does not apply). Scoring itself
 * is pure and deterministic — no LLM call, so the Anthropic monthly-cap path is
 * not involved.
 */
export async function computeVoiceMatch(
  internalUserId: string,
  profileText: string
): Promise<Result<VoiceMatchScore, VoiceMatchServiceError>> {
  const profile = await loadVoiceProfile(internalUserId);
  if (!profile.ok) return profile;

  // Voyage AI embeddings are not tracked in llm_spend_ledger (Anthropic-only ledger)
  const candidateEmbedding = await embedVoiceProfile(
    { source: "plain_text", messages: [{ role: "user", content: profileText }] },
    NEUTRAL_VOICE_CARD
  );

  const result = scoreVoiceMatch({
    voiceCard: profile.value.voiceCard,
    userVoiceEmbedding: profile.value.embedding,
    candidateText: profileText,
    candidateEmbedding,
  });

  // scoreVoiceMatch only fails on missing/mismatched embeddings; both are
  // present here, so treat any failure as a missing-profile condition (409).
  if (!result.ok) return { ok: false, error: "missing_voice_embedding" };
  return { ok: true, value: result.value };
}
