// RED: @/lib/parsers/claude does not exist yet — this test must fail until Wk 2
import { describe, it, expect } from "vitest";

describe("Claude export parser", () => {
  it("parses Claude export zip JSON into structured messages", async () => {
    const { parseClaudeExport } = await import("@/lib/parsers/claude");
    expect(parseClaudeExport).toBeDefined();
  });

  it("falls back to plain-text parsing when JSON is absent", async () => {
    const { parsePlainTextExport } = await import("@/lib/parsers/claude");
    expect(parsePlainTextExport).toBeDefined();
  });

  it("extracts recurring topics from parsed messages", async () => {
    const { extractRecurringTopics } = await import("@/lib/parsers/claude");
    expect(extractRecurringTopics).toBeDefined();
  });
});
