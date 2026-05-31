// Integration tests — requires DATABASE_URL pointing at a migrated postgres+pgvector instance.
// Run with: pnpm test:integration
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { checkMonthlyCap, recordLlmSpend, computeCostUsd } from "@/lib/llm/cost-guard";

let sql: ReturnType<typeof postgres>;

// We override the db singleton via the DATABASE_URL env var (already set for
// integration tests) rather than injecting a separate client. The functions
// under test import `db` from `@/db/client` which reads DATABASE_URL lazily.

const TEST_USER_ID = "00000000-0000-0000-0000-000000000099";

beforeAll(async () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is required for integration tests");
  sql = postgres(url);
  await sql`SELECT 1`; // connectivity check

  // Ensure a test user row exists (foreign key requirement)
  await sql`
    INSERT INTO users (id, clerk_id, email, plan)
    VALUES (${TEST_USER_ID}, 'clerk_integration_cost_test', 'cost-test@mirror.test', 'free')
    ON CONFLICT (id) DO NOTHING
  `;
});

afterAll(async () => {
  // Clean up all spend rows written by this test run
  await sql`DELETE FROM llm_spend_ledger WHERE user_id = ${TEST_USER_ID}`;
  await sql`DELETE FROM users WHERE id = ${TEST_USER_ID}`;
  await sql?.end();
});

describe("recordLlmSpend + checkMonthlyCap integration", () => {
  it("cap check returns allowed=true for a fresh user with no spend", async () => {
    const result = await checkMonthlyCap(TEST_USER_ID);
    expect(result.allowed).toBe(true);
  });

  it("recordLlmSpend inserts a row that the cap check reads correctly", async () => {
    const inputTokens = 100_000;
    const outputTokens = 10_000;
    const costUsd = computeCostUsd("claude-sonnet-4-6", inputTokens, outputTokens);

    await recordLlmSpend({
      userId: TEST_USER_ID,
      model: "claude-sonnet-4-6",
      inputTokens,
      outputTokens,
      costUsd,
    });

    const rows = await sql`
      SELECT cost_usd FROM llm_spend_ledger WHERE user_id = ${TEST_USER_ID}
    `;
    expect(rows.length).toBeGreaterThan(0);

    // Verify cost was stored correctly (numeric comparison with tolerance)
    const storedCost = Number(rows[0]?.cost_usd);
    expect(storedCost).toBeCloseTo(costUsd, 4);
  });

  it("cap check returns allowed=false after inserting spend exceeding the cap", async () => {
    // Save original cap, override to a tiny value so we can exceed it cheaply
    const originalCap = process.env["LLM_MONTHLY_CAP_USD"];
    process.env["LLM_MONTHLY_CAP_USD"] = "0.0001";

    try {
      const result = await checkMonthlyCap(TEST_USER_ID);
      // The ~$0.45 spend from the previous test should exceed $0.0001
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.resets_at).toBeDefined();
        const parsed = new Date(result.resets_at);
        expect(Number.isNaN(parsed.getTime())).toBe(false);
        expect(parsed.getUTCDate()).toBe(1);
      }
    } finally {
      if (originalCap === undefined) {
        delete process.env["LLM_MONTHLY_CAP_USD"];
      } else {
        process.env["LLM_MONTHLY_CAP_USD"] = originalCap;
      }
    }
  });
});
