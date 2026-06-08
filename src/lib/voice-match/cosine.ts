import { ValidationError } from "@/lib/errors";

/**
 * Cosine similarity between two equal-length vectors.
 *
 * Returns a value in [-1, 1]. Returns 0 for a degenerate (zero-magnitude)
 * vector rather than producing NaN, so callers never propagate NaN into a
 * score. Throws a typed {@link ValidationError} on dimension mismatch — a
 * programming error the caller must fix, not a runtime data condition.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new ValidationError(
      `cosineSimilarity: dimension mismatch (${a.length} vs ${b.length})`,
    );
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
