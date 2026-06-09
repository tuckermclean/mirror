/**
 * Unit tests for the hnsw.ef_search tuning helper (src/lib/rag/ef-search).
 *
 * Pure SQL-builder logic — no DB. `hnsw.ef_search` controls the HNSW search
 * breadth: higher = better recall, slower; lower = faster, lower recall. The
 * helper guards the value to pgvector's supported range (1..1000).
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

const executedStatements: string[] = [];
const mockTx = {
  execute: vi.fn(async (stmt: unknown) => {
    executedStatements.push(JSON.stringify(stmt));
  }),
};

vi.mock("@/db/client", () => ({
  db: {
    execute: vi.fn(),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(mockTx)
    ),
  },
}));

import {
  efSearchStatement,
  efSearchLocalStatement,
  clampEfSearch,
  withEfSearch,
} from "@/lib/rag/ef-search";

describe("clampEfSearch", () => {
  it("clamps below 1 up to 1", () => {
    expect(clampEfSearch(0)).toBe(1);
    expect(clampEfSearch(-5)).toBe(1);
  });

  it("clamps above 1000 down to 1000", () => {
    expect(clampEfSearch(5000)).toBe(1000);
  });

  it("floors non-integers", () => {
    expect(clampEfSearch(40.9)).toBe(40);
  });

  it("passes through in-range integers", () => {
    expect(clampEfSearch(40)).toBe(40);
    expect(clampEfSearch(100)).toBe(100);
  });
});

describe("efSearchStatement", () => {
  it("produces a session-level SET hnsw.ef_search statement with the clamped value", () => {
    const stmt = efSearchStatement(40);
    // Drizzle SQL chunks expose the assembled query via .queryChunks; assert the
    // rendered SQL text contains the directive and the numeric literal.
    const text = JSON.stringify(stmt);
    expect(text).toContain("hnsw.ef_search");
    expect(text).toContain("40");
  });

  it("uses the clamped value in the statement", () => {
    const text = JSON.stringify(efSearchStatement(99999));
    expect(text).toContain("1000");
  });
});

describe("efSearchLocalStatement", () => {
  it("produces a SET LOCAL hnsw.ef_search statement with the clamped value", () => {
    const text = JSON.stringify(efSearchLocalStatement(40));
    expect(text).toContain("SET LOCAL");
    expect(text).toContain("hnsw.ef_search");
    expect(text).toContain("40");
  });
});

describe("withEfSearch", () => {
  beforeEach(() => {
    executedStatements.length = 0;
    mockTx.execute.mockClear();
  });

  it("executes SET LOCAL inside the transaction", async () => {
    await withEfSearch(100, async (_tx) => undefined);
    expect(executedStatements).toHaveLength(1);
    expect(executedStatements[0]).toContain("SET LOCAL");
    expect(executedStatements[0]).toContain("hnsw.ef_search");
    expect(executedStatements[0]).toContain("100");
  });

  it("returns the result of the callback", async () => {
    const result = await withEfSearch(40, async (_tx) => "sentinel");
    expect(result).toBe("sentinel");
  });

  it("uses the clamped ef_search value", async () => {
    await withEfSearch(99999, async (_tx) => undefined);
    expect(executedStatements[0]).toContain("1000");
    expect(executedStatements[0]).not.toContain("99999");
  });
});
