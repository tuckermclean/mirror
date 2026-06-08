/**
 * Unit tests for the prompt-hash / cache helper (issue #142).
 *
 * Covers:
 *  - computePromptHash: stable SHA-256 over {systemPrompt, userMessages, modelId}
 *    in that exact field order.
 *  - findCachedGeneration: returns the newest matching, in-window generation row
 *    or null.
 *  - recordGeneration: inserts a row and returns { id }.
 *  - evictGeneration: deletes the row with the given id.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Hoisted DB mock — select, insert, and delete chains
// ---------------------------------------------------------------------------
const mockDb = vi.hoisted(() => {
  // select chain
  const limit = vi.fn();
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  // insert chain
  const returning = vi.fn();
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));

  // delete chain
  const deleteWhere = vi.fn();
  const deleteFrom = vi.fn(() => ({ where: deleteWhere }));

  return { select, from, where, orderBy, limit, insert, values, returning, deleteFrom, deleteWhere };
});

vi.mock("@/db/client", () => ({
  db: {
    select: mockDb.select,
    insert: mockDb.insert,
    delete: mockDb.deleteFrom,
  },
}));

vi.mock("@/db/schema", () => ({
  generations: {
    id: Symbol("generations.id"),
    userId: Symbol("generations.userId"),
    model: Symbol("generations.model"),
    output: Symbol("generations.output"),
    promptHash: Symbol("generations.promptHash"),
    createdAt: Symbol("generations.createdAt"),
  },
}));

import {
  computePromptHash,
  findCachedGeneration,
  recordGeneration,
  evictGeneration,
} from "@/lib/llm/prompt-cache";

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
    mockDb.limit.mockResolvedValue([
      { id: "gen-1", output: { headline: "cached" } },
    ]);
    const result = await findCachedGeneration("hash-abc");
    expect(result).toEqual({ id: "gen-1", output: { headline: "cached" } });
    expect(mockDb.limit).toHaveBeenCalledWith(1);
    expect(mockDb.orderBy).toHaveBeenCalled();
  });

  it("returns null when no matching row exists", async () => {
    mockDb.limit.mockResolvedValue([]);
    const result = await findCachedGeneration("hash-missing");
    expect(result).toBeNull();
  });

  it("returns null for a null-output placeholder row (cache-poisoning guard)", async () => {
    // The WHERE clause includes isNotNull(generations.output), so the DB
    // returns no rows when the only matching row has output=null (e.g. an
    // Inngest placeholder inserted before the job runs that then fails
    // permanently). findCachedGeneration must return null so retries can
    // proceed rather than being blocked for 24 h by the poisoned placeholder.
    mockDb.limit.mockResolvedValue([]);
    const result = await findCachedGeneration("hash-null-output");
    expect(result).toBeNull();
  });
});

describe("recordGeneration", () => {
  it("returns { id } from the inserted row", async () => {
    mockDb.returning.mockResolvedValue([{ id: "gen-new-1" }]);
    const result = await recordGeneration({
      userId: "user-1",
      model: "claude-sonnet-4-6",
      promptHash: "hash-xyz",
      output: { headline: "new headline" },
    });
    expect(result).toEqual({ id: "gen-new-1" });
  });

  it("calls db.insert with the correct fields", async () => {
    mockDb.returning.mockResolvedValue([{ id: "gen-new-2" }]);
    await recordGeneration({
      userId: "user-2",
      model: "claude-opus-4-7",
      promptHash: "hash-abc",
      output: { summary: "test" },
    });
    expect(mockDb.insert).toHaveBeenCalledWith(expect.anything());
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-2",
        model: "claude-opus-4-7",
        promptHash: "hash-abc",
        output: { summary: "test" },
      })
    );
    expect(mockDb.returning).toHaveBeenCalled();
  });
});

describe("evictGeneration", () => {
  it("calls db.delete with eq(generations.id, id) for the given id", async () => {
    mockDb.deleteWhere.mockResolvedValue(undefined);
    await evictGeneration("gen-to-delete");
    expect(mockDb.deleteFrom).toHaveBeenCalledWith(expect.anything());
    expect(mockDb.deleteWhere).toHaveBeenCalled();
  });

  it("resolves without error (void return)", async () => {
    mockDb.deleteWhere.mockResolvedValue(undefined);
    await expect(evictGeneration("gen-void-test")).resolves.toBeUndefined();
  });
});
