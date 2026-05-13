// RED: @/lib/parsers/chatgpt does not exist yet — this test must fail until Wk 2
import { describe, it, expect } from "vitest";

describe("ChatGPT export parser", () => {
  it("parses conversations.json from a .zip export into structured messages", async () => {
    // Will import the real parser once implemented in Wk 2
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    expect(parseChatGPTExport).toBeDefined();
  });

  it("extracts vocabulary fingerprint from parsed messages", async () => {
    const { extractVocabularyFingerprint } = await import("@/lib/parsers/chatgpt");
    expect(extractVocabularyFingerprint).toBeDefined();
  });

  it("handles malformed or empty zip gracefully", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    await expect(parseChatGPTExport(new Uint8Array())).rejects.toThrow();
  });
});
