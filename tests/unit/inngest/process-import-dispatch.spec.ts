/**
 * Unit tests for the parser dispatch logic inside process-import.
 *
 * Only the source-dispatch branching is tested here (no DB, no Inngest step).
 * Integration-level tests live in tests/integration/inngest/process-import.spec.ts.
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted before any imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/parsers/chatgpt", () => ({
  parseChatGPTExport: vi.fn().mockResolvedValue({ source: "chatgpt", messages: [] }),
}));

vi.mock("@/lib/parsers/claude", () => ({
  parseClaudeExport: vi.fn().mockResolvedValue({ source: "claude_zip", messages: [] }),
  parsePlainTextExport: vi.fn().mockReturnValue({ source: "plain_text", messages: [] }),
}));

vi.mock("@/lib/parsers/linkedin-pdf", () => ({
  parseLinkedInPdf: vi.fn().mockResolvedValue({ snapshot: { name: "", headline: "", experience: [], education: [], skills: [] }, partial: true }),
  linkedInSnapshotToHistory: vi.fn().mockReturnValue({ source: "linkedin_pdf", messages: [] }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("selectParser — dispatch by import source", () => {
  it("throws ConfigurationError for an unknown import source", async () => {
    const { selectParser } = await import("@/inngest/functions/process-import");
    const { ConfigurationError } = await import("@/lib/errors");

    const rejection = selectParser(
      "unknown_source" as Parameters<typeof selectParser>[0],
      new Uint8Array(),
      "user-1",
      "import-1"
    );

    await expect(rejection).rejects.toThrow(ConfigurationError);
    await rejection.catch((err) => {
      expect(err).toBeInstanceOf(ConfigurationError);
      expect(err.name).toBe("ConfigurationError");
      expect(err.message).toContain("unknown_source");
    });
  });

  it("returns parsed history for chatgpt_zip source", async () => {
    const { selectParser } = await import("@/inngest/functions/process-import");
    const result = await selectParser("chatgpt_zip", new Uint8Array(), "user-1", "import-1");
    expect(result.source).toBe("chatgpt");
  });

  it("returns parsed history for plain_text source", async () => {
    const { selectParser } = await import("@/inngest/functions/process-import");
    const result = await selectParser("plain_text", new Uint8Array(), "user-1", "import-1");
    expect(result.source).toBe("plain_text");
  });
});
