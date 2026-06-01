import { vi, describe, it, expect } from "vitest";
import { strToU8 } from "fflate";
import { ParseError } from "@/lib/errors";
import { fixtureBytes, makeZip } from "./helpers";

// ---------------------------------------------------------------------------
// parseClaudeExport
// ---------------------------------------------------------------------------

describe("Claude export parser — parseClaudeExport", () => {
  it("parses conversations.json with chat_messages from the sample fixture zip", async () => {
    const { parseClaudeExport } = await import("@/lib/parsers/claude");
    const data = fixtureBytes("fixtures/claude-exports/sample-export.zip");

    const result = await parseClaudeExport(data);

    expect(result.source).toBe("claude");
    expect(result.totalConversations).toBe(2);
    expect(result.messages.length).toBeGreaterThan(0);

    const humanMsgs = result.messages.filter((m) => m.role === "user");
    const aiMsgs = result.messages.filter((m) => m.role === "assistant");
    expect(humanMsgs.length).toBe(5);
    expect(aiMsgs.length).toBe(3);

    // First message is from the first conversation
    expect(result.messages[0]?.conversationTitle).toBe("Career transition strategy");
    expect(result.messages[0]?.role).toBe("user");
    expect(result.messages[0]?.timestamp).toBe("2024-03-15T10:01:00Z");
    expect(result.messages[0]?.content).toContain("position myself");
  });

  it("extracts text from content array format (structured content)", async () => {
    const { parseClaudeExport } = await import("@/lib/parsers/claude");
    const conv = {
      uuid: "c1",
      name: "Array content",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      chat_messages: [
        {
          uuid: "m1",
          sender: "human",
          content: [
            { type: "text", text: "Hello from" },
            { type: "text", text: " content array" },
          ],
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
    };
    const zip = makeZip({ "conversations.json": JSON.stringify([conv]) });
    const result = await parseClaudeExport(zip);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content).toBe("Hello from content array");
  });

  it("extracts text from string content format", async () => {
    const { parseClaudeExport } = await import("@/lib/parsers/claude");
    const conv = {
      uuid: "c1",
      name: "String content",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      chat_messages: [
        {
          uuid: "m1",
          sender: "assistant",
          content: "Direct string response",
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
    };
    const zip = makeZip({ "conversations.json": JSON.stringify([conv]) });
    const result = await parseClaudeExport(zip);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content).toBe("Direct string response");
  });

  it("filters out messages with empty content", async () => {
    const { parseClaudeExport } = await import("@/lib/parsers/claude");
    const conv = {
      uuid: "c1",
      name: "Empty messages",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      chat_messages: [
        {
          uuid: "m1",
          sender: "human",
          text: "Valid message",
          created_at: "2024-01-01T00:00:00Z",
        },
        {
          uuid: "m2",
          sender: "assistant",
          text: "   ", // whitespace only
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
    };
    const zip = makeZip({ "conversations.json": JSON.stringify([conv]) });
    const result = await parseClaudeExport(zip);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content).toBe("Valid message");
  });

  it("throws ParseError for empty bytes", async () => {
    const { parseClaudeExport } = await import("@/lib/parsers/claude");
    await expect(parseClaudeExport(new Uint8Array())).rejects.toThrow(ParseError);
    await expect(parseClaudeExport(new Uint8Array())).rejects.toThrow("Empty zip data");
  });

  it("throws ParseError for non-zip bytes", async () => {
    const { parseClaudeExport } = await import("@/lib/parsers/claude");
    const notAZip = strToU8("this is not a zip file");
    await expect(parseClaudeExport(notAZip)).rejects.toThrow(ParseError);
  });

  it("throws ParseError when conversations.json is absent", async () => {
    const { parseClaudeExport } = await import("@/lib/parsers/claude");
    const zip = makeZip({ "readme.txt": "no conversations" });
    await expect(parseClaudeExport(zip)).rejects.toThrow(ParseError);
    await expect(parseClaudeExport(zip)).rejects.toThrow("No conversations.json");
  });

  it("throws ParseError when conversations.json is not valid JSON", async () => {
    const { parseClaudeExport } = await import("@/lib/parsers/claude");
    const zip = makeZip({ "conversations.json": "not json {{" });
    await expect(parseClaudeExport(zip)).rejects.toThrow(ParseError);
    await expect(parseClaudeExport(zip)).rejects.toThrow("not valid JSON");
  });

  it("throws ParseError when conversations.json is not an array", async () => {
    const { parseClaudeExport } = await import("@/lib/parsers/claude");
    const zip = makeZip({ "conversations.json": JSON.stringify({ notArray: true }) });
    await expect(parseClaudeExport(zip)).rejects.toThrow(ParseError);
    await expect(parseClaudeExport(zip)).rejects.toThrow("must be an array");
  });

  it("skips malformed conversations without throwing", async () => {
    const { parseClaudeExport } = await import("@/lib/parsers/claude");
    const conversations = [
      {
        uuid: "good",
        name: "Good conv",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        chat_messages: [
          { uuid: "m1", sender: "human", text: "Real message", created_at: "2024-01-01T00:00:00Z" },
        ],
      },
      null, // malformed
    ];
    const zip = makeZip({ "conversations.json": JSON.stringify(conversations) });
    const result = await parseClaudeExport(zip);
    expect(result.totalConversations).toBe(2);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("throws ParseError when decompressed size exceeds 500 MB cap", async () => {
    vi.resetModules();
    vi.doMock("fflate", () => ({
      unzipSync: (_data: Uint8Array): Record<string, Uint8Array> => ({
        "bomb.bin": { length: 501 * 1024 * 1024 } as unknown as Uint8Array,
      }),
      unzip: (
        _data: Uint8Array,
        cb: (err: null, data: Record<string, Uint8Array>) => void
      ) => {
        process.nextTick(() =>
          cb(null, { "bomb.bin": { length: 501 * 1024 * 1024 } as unknown as Uint8Array })
        );
      },
    }));
    try {
      const [{ parseClaudeExport }, { ParseError: PE }] = await Promise.all([
        import("@/lib/parsers/claude"),
        import("@/lib/errors"),
      ]);
      const zip = makeZip({ "readme.txt": "hello" });

      await expect(parseClaudeExport(zip)).rejects.toThrow(PE);
      await expect(parseClaudeExport(zip)).rejects.toThrow(/500 MB/);
    } finally {
      vi.doUnmock("fflate");
      vi.resetModules();
    }
  });
});

// ---------------------------------------------------------------------------
// parsePlainTextExport (re-exported from claude.ts → plaintext.ts)
// ---------------------------------------------------------------------------

describe("parsePlainTextExport", () => {
  it("parses Human:/Assistant: prefixed lines into structured messages", async () => {
    const { parsePlainTextExport } = await import("@/lib/parsers/claude");

    const text = [
      "Human: Hello, I need help with my resume.",
      "Assistant: I would be happy to help you with your resume.",
      "Human: Great, here is what I have so far.",
    ].join("\n");

    const result = parsePlainTextExport(text);

    expect(result.source).toBe("plain_text");
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toEqual({ role: "user", content: "Hello, I need help with my resume." });
    expect(result.messages[1]).toEqual({ role: "assistant", content: "I would be happy to help you with your resume." });
    expect(result.messages[2]).toEqual({ role: "user", content: "Great, here is what I have so far." });
  });

  it("supports User: and Claude: prefix variants", async () => {
    const { parsePlainTextExport } = await import("@/lib/parsers/claude");

    const text = [
      "User: What can you help with?",
      "Claude: I can help with many things.",
    ].join("\n");

    const result = parsePlainTextExport(text);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.role).toBe("user");
    expect(result.messages[1]?.role).toBe("assistant");
  });

  it("collects multi-line messages into a single content string", async () => {
    const { parsePlainTextExport } = await import("@/lib/parsers/claude");

    const text = [
      "Human: Line one",
      "Line two",
      "Line three",
      "Assistant: Short reply",
    ].join("\n");

    const result = parsePlainTextExport(text);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.content).toBe("Line one\nLine two\nLine three");
  });

  it("skips empty messages", async () => {
    const { parsePlainTextExport } = await import("@/lib/parsers/claude");
    // Text that starts with a prefix but has empty body
    const text = "Human: \nAssistant: Hello";
    const result = parsePlainTextExport(text);
    // "Human: " yields empty string → filtered out
    expect(result.messages.every((m) => m.content.length > 0)).toBe(true);
  });

  it("returns empty messages list for text with no recognised prefixes", async () => {
    const { parsePlainTextExport } = await import("@/lib/parsers/claude");
    const result = parsePlainTextExport("Some random text without any prefixes.");
    expect(result.source).toBe("plain_text");
    expect(result.messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractRecurringTopics
// ---------------------------------------------------------------------------

describe("extractRecurringTopics", () => {
  it("returns the top recurring words from user messages", async () => {
    const { extractRecurringTopics } = await import("@/lib/parsers/claude");
    const history = {
      source: "claude" as const,
      messages: [
        { role: "user" as const, content: "career transition strategy planning" },
        { role: "user" as const, content: "career transition skills development" },
        { role: "assistant" as const, content: "career career career" }, // should be ignored
        { role: "user" as const, content: "strategy planning execution" },
      ],
    };

    const result = extractRecurringTopics(history);

    // career, transition, strategy appear ≥2x in user messages
    expect(result).toContain("career");
    expect(result).toContain("transition");
    expect(result).toContain("strategy");
    // stop words excluded
    expect(result).not.toContain("with");
    // single-occurrence words excluded
    expect(result).not.toContain("execution");
  });

  it("returns empty array when no user messages contain repeated words", async () => {
    const { extractRecurringTopics } = await import("@/lib/parsers/claude");
    const history = {
      source: "claude" as const,
      messages: [
        { role: "user" as const, content: "hello there" },
        { role: "assistant" as const, content: "hello hello hello" },
      ],
    };
    // "hello" and "there" appear only once each in user messages
    expect(extractRecurringTopics(history)).toHaveLength(0);
  });
});
