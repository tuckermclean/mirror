import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { zipSync, strToU8 } from "fflate";
import { ParseError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fixtureBytes(rel: string): Uint8Array {
  return Uint8Array.from(readFileSync(resolve(process.cwd(), rel)));
}

function makeZip(files: Record<string, string>): Uint8Array {
  const input: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    input[name] = strToU8(content);
  }
  return zipSync(input);
}

// ---------------------------------------------------------------------------
// detectSourceFromBytes
// ---------------------------------------------------------------------------

describe("detectSourceFromBytes", () => {
  it("detects ChatGPT zip by presence of chat.html", async () => {
    const { detectSourceFromBytes } = await import("@/lib/parsers/index");
    const data = fixtureBytes("fixtures/chatgpt-exports/sample-export.zip");
    expect(detectSourceFromBytes(data)).toBe("chatgpt");
  });

  it("detects Claude zip by presence of profile.json", async () => {
    const { detectSourceFromBytes } = await import("@/lib/parsers/index");
    const data = fixtureBytes("fixtures/claude-exports/sample-export.zip");
    expect(detectSourceFromBytes(data)).toBe("claude");
  });

  it("detects ChatGPT from conversations.json content with mapping key", async () => {
    const { detectSourceFromBytes } = await import("@/lib/parsers/index");
    const conv = [{ id: "c1", title: "t", mapping: {} }];
    const zip = makeZip({ "conversations.json": JSON.stringify(conv) });
    expect(detectSourceFromBytes(zip)).toBe("chatgpt");
  });

  it("detects Claude from conversations.json content with chat_messages key", async () => {
    const { detectSourceFromBytes } = await import("@/lib/parsers/index");
    const conv = [{ uuid: "c1", name: "t", chat_messages: [] }];
    const zip = makeZip({ "conversations.json": JSON.stringify(conv) });
    expect(detectSourceFromBytes(zip)).toBe("claude");
  });

  it("returns unknown for invalid (non-zip) bytes", async () => {
    const { detectSourceFromBytes } = await import("@/lib/parsers/index");
    expect(detectSourceFromBytes(strToU8("not a zip"))).toBe("unknown");
  });

  it("returns unknown for empty bytes", async () => {
    const { detectSourceFromBytes } = await import("@/lib/parsers/index");
    expect(detectSourceFromBytes(new Uint8Array())).toBe("unknown");
  });

  it("returns unknown for zip with no recognizable marker", async () => {
    const { detectSourceFromBytes } = await import("@/lib/parsers/index");
    const zip = makeZip({ "readme.txt": "no marker files here" });
    expect(detectSourceFromBytes(zip)).toBe("unknown");
  });

  it("returns unknown for zip where conversations.json is an empty array", async () => {
    const { detectSourceFromBytes } = await import("@/lib/parsers/index");
    const zip = makeZip({ "conversations.json": "[]" });
    expect(detectSourceFromBytes(zip)).toBe("unknown");
  });

  it("returns unknown for zip where conversations.json has neither mapping nor chat_messages", async () => {
    const { detectSourceFromBytes } = await import("@/lib/parsers/index");
    const zip = makeZip({ "conversations.json": JSON.stringify([{ unexpected: "key" }]) });
    expect(detectSourceFromBytes(zip)).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// parseAiHistory
// ---------------------------------------------------------------------------

describe("parseAiHistory", () => {
  it("auto-detects and parses a ChatGPT export zip", async () => {
    const { parseAiHistory } = await import("@/lib/parsers/index");
    const data = fixtureBytes("fixtures/chatgpt-exports/sample-export.zip");

    const result = await parseAiHistory(data);

    expect(result.source).toBe("chatgpt");
    expect(result.totalConversations).toBe(2);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("auto-detects and parses a Claude export zip", async () => {
    const { parseAiHistory } = await import("@/lib/parsers/index");
    const data = fixtureBytes("fixtures/claude-exports/sample-export.zip");

    const result = await parseAiHistory(data);

    expect(result.source).toBe("claude");
    expect(result.totalConversations).toBe(2);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("accepts a File object and parses it correctly", async () => {
    const { parseAiHistory } = await import("@/lib/parsers/index");
    const bytes = fixtureBytes("fixtures/chatgpt-exports/sample-export.zip");
    // Simulate File-like object with arrayBuffer()
    const file = new File([bytes], "export.zip", { type: "application/zip" });

    const result = await parseAiHistory(file);

    expect(result.source).toBe("chatgpt");
  });

  it("falls back to ChatGPT parser for unknown zip with mapping key", async () => {
    const { parseAiHistory } = await import("@/lib/parsers/index");
    // zip with conversations.json containing mapping key but no chat.html/profile.json marker
    const conv = {
      id: "c1",
      title: "Fallback test",
      create_time: 1,
      update_time: 2,
      mapping: {
        n1: {
          id: "n1",
          message: {
            id: "m1",
            author: { role: "user" },
            content: { content_type: "text", parts: ["Test message"] },
            create_time: 1,
          },
          parent: null,
          children: [],
        },
      },
    };
    // Include conversations.json with mapping key → detectZipFormat returns "chatgpt"
    const zip = makeZip({ "conversations.json": JSON.stringify([conv]) });
    const result = await parseAiHistory(zip);
    expect(result.source).toBe("chatgpt");
    expect(result.messages).toHaveLength(1);
  });

  it("falls back to Claude parser for unknown zip with chat_messages key", async () => {
    const { parseAiHistory } = await import("@/lib/parsers/index");
    const conv = {
      uuid: "c1",
      name: "Fallback Claude",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      chat_messages: [
        { uuid: "m1", sender: "human", text: "Hello", created_at: "2024-01-01T00:00:00Z" },
      ],
    };
    // conversations.json with chat_messages → detectZipFormat returns "claude"
    const zip = makeZip({ "conversations.json": JSON.stringify([conv]) });
    const result = await parseAiHistory(zip);
    expect(result.source).toBe("claude");
    expect(result.messages).toHaveLength(1);
  });

  it("throws ParseError when both parsers fail on unknown format zip", async () => {
    const { parseAiHistory } = await import("@/lib/parsers/index");
    // zip with conversations.json that is not an array → both parsers fail
    const zip = makeZip({ "conversations.json": JSON.stringify({ notArray: true }) });
    await expect(parseAiHistory(zip)).rejects.toThrow(ParseError);
    await expect(parseAiHistory(zip)).rejects.toThrow(/chatgpt.*claude|claude.*chatgpt/i);
  });

  it("throws ParseError for empty input bytes", async () => {
    const { parseAiHistory } = await import("@/lib/parsers/index");
    await expect(parseAiHistory(new Uint8Array())).rejects.toThrow(ParseError);
    await expect(parseAiHistory(new Uint8Array())).rejects.toThrow("Empty input");
  });

  it("throws ParseError for non-zip bytes", async () => {
    const { parseAiHistory } = await import("@/lib/parsers/index");
    await expect(parseAiHistory(strToU8("not a zip"))).rejects.toThrow(ParseError);
  });
});
