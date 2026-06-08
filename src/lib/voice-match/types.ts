import type { VoiceCard } from "@/lib/voice-card/schema";

/**
 * Inputs to {@link scoreVoiceMatch}. Embeddings are PASSED IN, never computed
 * here — the caller supplies the user's already-persisted voice embedding and
 * the candidate's embedding. This honors the AGENTS.md embedding-cache rule:
 * the scorer never re-embeds a row that already has a vector, and never makes a
 * network/LLM call of its own.
 */
export interface VoiceMatchInput {
  /** The user's authentic-voice fingerprint (from interview + AI history). */
  voiceCard: VoiceCard;
  /** The user's persisted voice embedding (e.g. `imports.voice_embedding`). */
  userVoiceEmbedding: number[] | null | undefined;
  /** The rewritten profile text being graded. */
  candidateText: string;
  /** Embedding of `candidateText`, computed once by the caller and cached. */
  candidateEmbedding: number[] | null | undefined;
}

/** Transparent breakdown of the two scoring terms (each in [0, 1]). */
export interface VoiceMatchComponents {
  /** Embedding cosine similarity, remapped from [-1, 1] to [0, 1]. */
  cosine: number;
  /** Voice-card lexical/cadence feature overlap. */
  feature: number;
}

export interface VoiceMatchScore {
  /** Integer Voice Match Score in [0, 100]. */
  score: number;
  components: VoiceMatchComponents;
}

export type VoiceMatchError =
  | { kind: "missing_embedding"; message: string }
  | { kind: "dimension_mismatch"; message: string };
