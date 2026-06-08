/**
 * Unit tests for the prompt-hash / cache helper (issue #142).
 *
 * Covers:
 *  - computePromptHash: stable SHA-256 over {systemPrompt, userMessages, modelId}
 *    in that exact field order.
 *  - findCachedGeneration: returns the newest matching, in-window generation row
 *    or null.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Hoisted DB mock — newest-first, limit 1 select chain
// ---------------------------------------------------------------------------
const mockDbSelectChain = vi.hoisted(() => {
  const limit = vi.fn();
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, orderBy, limit };
});

vi.mock("@/db/client", () => ({
  db: { select: mockDbSelectChain.select },
}));

vi.mock("@/db/schema", () => ({
  generations: {
    id: Symbol("generations.id"),
    output: Symbol("generations.output"),
    promptHash: Symbol("generations.promptHash"),
    createdAt: Symbol("generations.createdAt"),
  },
}));

import { computePromptHash, findCachedGeneration } from "@/lib/llm/prompt-cache";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computePromptHash", () => {
  it("returns the SHA-256 of {systemPrompt, userMessages, modelId} in that order", () => {
    const input = {
      systemPrompt: "you are a rewriter",
      userMessages: [{ role: "user", content: "snapshot-123" }],
      modelId: "claude-sonnet-4-6",
    };
    const expected = createHash("sha256")
      .update(
        JSON.stringify({
          systemPrompt: input.systemPrompt,
          userMessages: input.userMessages,
          modelId: input.modelId,
        })
      )
      .digest("hex");
    expect(computePromptHash(input)).toBe(expected);
  });

  it("is deterministic for identical input", () => {
    const input = {
      systemPrompt: "sp",
      userMessages: { snapshotId: "abc" },
      modelId: "claude-sonnet-4-6",
    };
    expect(computePromptHash(input)).toBe(computePromptHash(input));
  });

  it("changes when any field changes", () => {
    const base = {
      systemPrompt: "sp",
      userMessages: { snapshotId: "abc" },
      modelId: "claude-sonnet-4-6",
    };
    expect(computePromptHash(base)).not.toBe(
      computePromptHash({ ...base, systemPrompt: "different" })
    );
    expect(computePromptHash(base)).not.toBe(
      computePromptHash({ ...base, modelId: "claude-opus-4-7" })
    );
    expect(computePromptHash(base)).not.toBe(
      computePromptHash({ ...base, userMessages: { snapshotId: "xyz" } })
    );
  });
});

describe("findCachedGeneration", () => {
  it("returns {id, output} for the newest matching in-window row", async () => {
    mockDbSelectChain.limit.mockResolvedValue([
      { id: "gen-1", output: { headline: "cached" } },
    ]);
    const result = await findCachedGeneration("hash-abc");
    expect(result).toEqual({ id: "gen-1", output: { headline: "cached" } });
    expect(mockDbSelectChain.limit).toHaveBeenCalledWith(1);
    expect(mockDbSelectChain.orderBy).toHaveBeenCalled();
  });

  it("returns null when no matching row exists", async () => {
    mockDbSelectChain.limit.mockResolvedValue([]);
    const result = await findCachedGeneration("hash-missing");
    expect(result).toBeNull();
  });

  it("returns null for a null-output placeholder row (cache-poisoning guard)", async () => {
    // The WHERE clause includes isNotNull(generations.output), so the DB
    // returns no rows when the only matching row has output=null (e.g. an
    // Inngest placeholder inserted before the job runs that then fails
    // permanently). findCachedGeneration must return null so retries can
    // proceed rather than being blocked for 24 h by the poisoned placeholder.
    mockDbSelectChain.limit.mockResolvedValue([]);
    const result = await findCachedGeneration("hash-null-output");
    expect(result).toBeNull();
  });
});
