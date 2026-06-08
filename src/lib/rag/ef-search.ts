/**
 * HNSW search-breadth tuning for benchmark k-NN retrieval.
 *
 * pgvector's `hnsw.ef_search` GUC controls how many candidates the HNSW search
 * explores: higher = better recall but slower; lower = faster, lower recall.
 * Default is 40. For the 5k-vector benchmark corpus, 40 keeps p50 retrieval well
 * under the 200ms budget while preserving recall for top-5 exemplars.
 *
 * Two application modes:
 *   - `setEfSearch(n)`     — session-level `SET` (persists on the pooled conn).
 *   - `withEfSearch(n, fn)`— transaction-scoped `SET LOCAL`, guaranteed to apply
 *                            to the queries inside `fn` and auto-reset on commit.
 *
 * Raw SQL is permitted here only via Drizzle's `sql` template tag (AGENTS.md).
 * The value is always a clamped integer literal — Postgres SET takes no binds.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import type { DB } from "@/db/client";

/** pgvector accepts hnsw.ef_search in [1, 1000]. */
export function clampEfSearch(n: number): number {
  const floored = Math.floor(n);
  if (floored < 1) return 1;
  if (floored > 1000) return 1000;
  return floored;
}

/**
 * Build the session-level `SET hnsw.ef_search = N` statement. Safe: the value is
 * clamped to an integer in [1, 1000] before interpolation.
 */
export function efSearchStatement(n: number): SQL {
  return sql.raw(`SET hnsw.ef_search = ${clampEfSearch(n)}`);
}

/**
 * Build the transaction-scoped `SET LOCAL hnsw.ef_search = N` statement, used
 * inside `withEfSearch` so the setting applies to subsequent queries in the same
 * transaction and resets automatically at commit.
 */
export function efSearchLocalStatement(n: number): SQL {
  return sql.raw(`SET LOCAL hnsw.ef_search = ${clampEfSearch(n)}`);
}

/**
 * Apply `hnsw.ef_search` at the session level for subsequent queries on the
 * current pooled connection.
 */
export async function setEfSearch(n: number): Promise<void> {
  await db.execute(efSearchStatement(n));
}

/**
 * Run `fn` in a transaction with `hnsw.ef_search` set locally, so the override
 * is guaranteed to apply to the k-NN queries inside it regardless of pooling.
 */
export async function withEfSearch<T>(
  n: number,
  fn: (tx: DB) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(efSearchLocalStatement(n));
    return fn(tx as unknown as DB);
  });
}
