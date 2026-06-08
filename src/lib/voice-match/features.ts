import type { VoiceCard } from "@/lib/voice-card/schema";

/**
 * Fraction of the voice card's vocabulary present in the candidate text.
 *
 * Uses `String.includes()` (not `Set.has()`) so that multi-word vocabulary
 * terms like "machine learning" are matched against the full text rather than
 * against the set of individual tokens.
 */
function vocabularyOverlap(card: VoiceCard, candidateText: string): number {
  const vocab = card.vocabulary.map((v) => v.toLowerCase());
  if (vocab.length === 0 || candidateText.length === 0) return 0;
  const textLower = candidateText.toLowerCase();
  const hits = vocab.filter((word) => textLower.includes(word)).length;
  return hits / vocab.length;
}

/** Count how many of the listed phrases appear in the lowercased text. */
function phraseHits(phrases: string[], textLower: string): number {
  return phrases.filter((p) => p.length > 0 && textLower.includes(p.toLowerCase()))
    .length;
}

/** Cadence agreement: 1 minus the normalized L1 distance of the bucket mix. */
function cadenceAgreement(card: VoiceCard, candidateText: string): number {
  const sentences = candidateText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return 0.5;

  let short = 0;
  let medium = 0;
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter((w) => w.length > 0).length;
    if (words <= 10) short++;
    else if (words <= 25) medium++;
  }
  const total = sentences.length;
  const candShort = (short / total) * 100;
  const candMedium = (medium / total) * 100;
  const candLong = 100 - candShort - candMedium;

  const d = card.sentenceLengthDistribution;
  const l1 =
    Math.abs(candShort - d.short) +
    Math.abs(candMedium - d.medium) +
    Math.abs(candLong - d.long);
  // Max L1 distance between two 3-bucket distributions summing to 100 is 200.
  return 1 - Math.min(l1, 200) / 200;
}

/**
 * Voice-card feature overlap in [0, 1]: how well a candidate text matches the
 * lexical and cadence fingerprint of a voice card.
 *
 * Blends vocabulary overlap and sentence-cadence agreement, then applies soft
 * penalties for using jargon the user hates or hedges they avoid. Deterministic
 * and dependency-free — no network, no LLM — so it is fully unit-testable and
 * complements the embedding cosine term in {@link scoreVoiceMatch}.
 */
export function voiceCardFeatureOverlap(
  card: VoiceCard,
  candidateText: string,
): number {
  const textLower = candidateText.toLowerCase();

  const vocab = vocabularyOverlap(card, candidateText);
  const cadence = cadenceAgreement(card, candidateText);

  const jargonPenalty =
    card.jargonHated.length > 0
      ? Math.min(phraseHits(card.jargonHated, textLower) * 0.15, 0.6)
      : 0;
  const hedgePenalty =
    card.hedgesAvoided.length > 0
      ? Math.min(phraseHits(card.hedgesAvoided, textLower) * 0.1, 0.4)
      : 0;

  const base = 0.6 * vocab + 0.4 * cadence;
  const score = base - jargonPenalty - hedgePenalty;
  return Math.max(0, Math.min(1, score));
}
