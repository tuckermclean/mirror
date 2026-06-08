/**
 * Unit tests for the hnsw.ef_search tuning helper (src/lib/rag/ef-search).
 *
 * Pure SQL-builder logic — no DB. `hnsw.ef_search` controls the HNSW search
 * breadth: higher = better recall, slower; lower = faster, lower recall. The
 * helper guards the value to pgvector's supported range (1..1000).
 */
import { describe, it, expect } from "vitest";
import { efSearchStatement, clampEfSearch } from "@/lib/rag/ef-search";

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
  it("produces a SET LOCAL hnsw.ef_search statement with the clamped value", () => {
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
