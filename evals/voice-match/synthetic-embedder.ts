/**
 * Deterministic, offline stand-in for the Voyage/OpenAI embedder, used ONLY by
 * the Voice Match eval harness so the Spearman test is reproducible in CI
 * without an embeddings API key or network call.
 *
 * It is a bag-of-words hashing embedder: each token is hashed into a fixed
 * number of dimensions and accumulated, then the vector is L2-normalized. Two
 * texts that share vocabulary land close in cosine space, which is exactly the
 * lexical-voice signal the real embedding model captures (in coarse form). This
 * is intentionally NOT the production scorer — it only generates the embedding
 * vectors that the production `scoreVoiceMatch` then consumes.
 */

const DIMENSIONS = 64;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z']{2,}\b/g) ?? [];
}

/** Deterministic FNV-1a hash, folded into [0, DIMENSIONS). */
function hashToDim(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % DIMENSIONS;
}

export function syntheticEmbed(text: string): number[] {
  const vec = new Array<number>(DIMENSIONS).fill(0);
  for (const token of tokenize(text)) {
    const dim = hashToDim(token);
    vec[dim] = (vec[dim] ?? 0) + 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return vec;
  return vec.map((x) => x / norm);
}
