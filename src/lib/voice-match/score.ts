import type { Result } from "@/lib/errors";
import { cosineSimilarity } from "./cosine";
import { voiceCardFeatureOverlap } from "./features";
import type {
  VoiceMatchError,
  VoiceMatchInput,
  VoiceMatchScore,
} from "./types";

/**
 * Blend weight for the embedding cosine backbone. The remaining weight goes to
 * the voice-card lexical/cadence feature term. Cosine is the primary semantic
 * signal; features sharpen and explain it (vocabulary, cadence, anti-jargon).
 */
const COSINE_WEIGHT = 0.7;
const FEATURE_WEIGHT = 1 - COSINE_WEIGHT;

/** Remap cosine similarity from [-1, 1] into [0, 1]. */
function normalizeCosine(cos: number): number {
  return (cos + 1) / 2;
}

function validateEmbeddings(
  input: VoiceMatchInput,
): Result<{ user: number[]; candidate: number[] }, VoiceMatchError> {
  const { userVoiceEmbedding, candidateEmbedding } = input;
  if (!userVoiceEmbedding || userVoiceEmbedding.length === 0) {
    return {
      ok: false,
      error: { kind: "missing_embedding", message: "user voice embedding is missing" },
    };
  }
  if (!candidateEmbedding || candidateEmbedding.length === 0) {
    return {
      ok: false,
      error: { kind: "missing_embedding", message: "candidate embedding is missing" },
    };
  }
  if (userVoiceEmbedding.length !== candidateEmbedding.length) {
    return {
      ok: false,
      error: {
        kind: "dimension_mismatch",
        message: `embedding dimension mismatch (${userVoiceEmbedding.length} vs ${candidateEmbedding.length})`,
      },
    };
  }
  return { ok: true, value: { user: userVoiceEmbedding, candidate: candidateEmbedding } };
}

/**
 * Voice Match Score (SPEC §6.3): how well a rewritten profile reads in the
 * USER'S authentic voice — distinct from per-section model confidence.
 *
 * Backbone is embedding cosine similarity against the user's persisted voice
 * embedding, blended with deterministic voice-card feature overlap
 * (vocabulary, cadence, anti-jargon/anti-hedge). Pure and deterministic: no
 * network, no LLM call, no re-embedding — so it is cheap, cacheable, and unit-
 * testable, and it sidesteps the LLM monthly-cap path entirely.
 *
 * Returns a typed {@link Result} rather than throwing on missing/mismatched
 * embeddings (a normal data condition the UI must handle gracefully).
 */
export function scoreVoiceMatch(
  input: VoiceMatchInput,
): Result<VoiceMatchScore, VoiceMatchError> {
  const embeddings = validateEmbeddings(input);
  if (!embeddings.ok) return embeddings;

  const cosine = normalizeCosine(
    cosineSimilarity(embeddings.value.user, embeddings.value.candidate),
  );
  const feature = voiceCardFeatureOverlap(input.voiceCard, input.candidateText);

  const blended = COSINE_WEIGHT * cosine + FEATURE_WEIGHT * feature;
  const score = Math.max(0, Math.min(100, Math.round(blended * 100)));

  return { ok: true, value: { score, components: { cosine, feature } } };
}
