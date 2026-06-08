import { ValidationError } from "@/lib/errors";

/** Convert raw values to fractional ranks, averaging ties. */
function rank(values: readonly number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((p, q) => p.value - q.value);

  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1]!.value === indexed[i]!.value) {
      j++;
    }
    // Average rank for the tie group [i, j] (1-based ranks).
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k]!.index] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

function pearson(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - meanX;
    const dy = y[i]! - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}

/**
 * Spearman rank correlation coefficient between two equal-length samples.
 *
 * Computed as the Pearson correlation of the fractional ranks, which handles
 * ties correctly. Returns a value in [-1, 1]. Throws a typed
 * {@link ValidationError} on length mismatch or fewer than two points.
 */
export function spearman(x: readonly number[], y: readonly number[]): number {
  if (x.length !== y.length) {
    throw new ValidationError(
      `spearman: length mismatch (${x.length} vs ${y.length})`,
    );
  }
  if (x.length < 2) {
    throw new ValidationError("spearman: need at least two points");
  }
  return pearson(rank(x), rank(y));
}
