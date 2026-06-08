/**
 * Word-level diff used by the walkthrough Diff view.
 *
 * Pure, framework-free, and unit-tested independently of React so the rendering
 * layer can stay a thin map over the segments. Splits on whitespace, then runs a
 * classic longest-common-subsequence (LCS) alignment over the tokens.
 */

export type DiffSegmentType = "unchanged" | "added" | "removed";

export interface DiffSegment {
  type: DiffSegmentType;
  /** Includes the trailing space so segments concatenate back into the source. */
  text: string;
}

/** Split into tokens that each carry their trailing whitespace. */
function tokenize(input: string): string[] {
  const trimmed = input.trim();
  if (trimmed.length === 0) return [];
  // Each token = a run of non-space chars plus the whitespace that follows it.
  return trimmed.match(/\S+\s*/g) ?? [];
}

/** Build the LCS length table for two token arrays. */
function lcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] =
        a[i]!.trim() === b[j]!.trim()
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

/** Coalesce adjacent same-type segments into one. */
function coalesce(raw: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const seg of raw) {
    const last = out[out.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      out.push({ ...seg });
    }
  }
  // Normalise trailing whitespace so a clean rebuild is possible.
  return out.map((s) => ({ ...s, text: s.text }));
}

/**
 * Compute a word-level diff between `before` and `after`.
 *
 * Returns ordered segments: `removed` text appears in source order from
 * `before`, `added` text from `after`, `unchanged` for the shared subsequence.
 */
export function computeWordDiff(before: string, after: string): DiffSegment[] {
  const a = tokenize(before);
  const b = tokenize(after);

  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ type: "added", text: after.trim() }];
  if (b.length === 0) return [{ type: "removed", text: before.trim() }];

  const table = lcsTable(a, b);
  const raw: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i]!.trim() === b[j]!.trim()) {
      raw.push({ type: "unchanged", text: a[i]! });
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      raw.push({ type: "removed", text: a[i]! });
      i++;
    } else {
      raw.push({ type: "added", text: b[j]! });
      j++;
    }
  }
  while (i < a.length) raw.push({ type: "removed", text: a[i++]! });
  while (j < b.length) raw.push({ type: "added", text: b[j++]! });

  return coalesce(raw).map((s) => ({ ...s, text: s.text.replace(/\s+$/, (m) => m) }));
}
