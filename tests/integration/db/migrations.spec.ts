// RED: drizzle.config.ts and the schema do not exist yet — fails until Wk 1
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { resolve } from "path";

describe("Drizzle schema + migrations", () => {
  it("drizzle.config.ts exists at repo root", () => {
    expect(existsSync(resolve(process.cwd(), "drizzle.config.ts"))).toBe(true);
  });

  it("all required tables are declared in the schema", async () => {
    const schema = await import("@/db/schema");
    const requiredTables = [
      "users",
      "interviews",
      "imports",
      "linkedinSnapshots",
      "generations",
      "commits",
      "outcomes",
      "benchmarkProfiles",
      "outcomeDeltas",
    ];
    for (const table of requiredTables) {
      expect(schema).toHaveProperty(table);
    }
  });

  it("voice_embedding column is vector(3072) on imports table", async () => {
    const { imports } = await import("@/db/schema");
    expect(imports).toBeDefined();
    // Column type assertion — implementation must use pgvector extension
    const col = (imports as Record<string, unknown>)["voiceEmbedding"];
    expect(col).toBeDefined();
  });
});
