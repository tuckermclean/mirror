import { vi, describe, it, expect } from "vitest";
import { strToU8 } from "fflate";
import { ParseError } from "@/lib/errors";
import { fixtureBytes, makeZip } from "./helpers";

// ---------------------------------------------------------------------------
// parseChatGPTExport
// ---------------------------------------------------------------------------

describe("ChatGPT export parser — parseChatGPTExport", () => {
  it("parses conversations.json from the sample fixture zip", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    const data = fixtureBytes("fixtures/chatgpt-exports/sample-export.zip");

    const result = await parseChatGPTExport(data);

    expect(result.source).toBe("chatgpt");
    expect(result.totalConversations).toBe(2);
    expect(result.messages.length).toBeGreaterThan(0);

    const userMsgs = result.messages.filter((m) => m.role === "user");
    const assistantMsgs = result.messages.filter((m) => m.role === "assistant");
    expect(userMsgs.length).toBe(4);
    expect(assistantMsgs.length).toBe(2);

    // Each message has required fields
    for (const msg of result.messages) {
      expect(["user", "assistant"]).toContain(msg.role);
      expect(typeof msg.content).toBe("string");
      expect(msg.content.length).toBeGreaterThan(0);
      expect(msg.conversationId).toBeDefined();
      expect(msg.conversationTitle).toBeDefined();
    }

    // First message is from the first conversation
    expect(result.messages[0]?.conversationTitle).toBe("Career planning and strategy");
    expect(result.messages[0]?.content).toContain("career transition");
  });

  it("populates timestamp when create_time is present", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    const data = fixtureBytes("fixtures/chatgpt-exports/sample-export.zip");
    const result = await parseChatGPTExport(data);

    const msgWithTimestamp = result.messages[0];
    expect(msgWithTimestamp?.timestamp).toBeDefined();
    // create_time 1700000100 → 2023-11-14T...
    expect(msgWithTimestamp?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("omits timestamp when create_time is null", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    const conv = {
      id: "c1",
      title: "No timestamp",
      create_time: 1,
      update_time: 2,
      mapping: {
        n1: {
          id: "n1",
          message: {
            id: "m1",
            author: { role: "user" },
            content: { content_type: "text", parts: ["Hello world"] },
            create_time: null,
          },
          parent: null,
          children: [],
        },
      },
    };
    const zip = makeZip({ "conversations.json": JSON.stringify([conv]) });
    const result = await parseChatGPTExport(zip);

    expect(result.messages).toHaveLength(1);
    // exactOptionalPropertyTypes: the property must be absent (not undefined)
    expect(Object.prototype.hasOwnProperty.call(result.messages[0], "timestamp")).toBe(false);
  });

  it("filters out messages with non-text content_type", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    const conv = {
      id: "c1",
      title: "Mixed content",
      create_time: 1,
      update_time: 2,
      mapping: {
        n1: {
          id: "n1",
          message: {
            id: "m1",
            author: { role: "user" },
            content: { content_type: "text", parts: ["Visible text message"] },
            create_time: 1,
          },
          parent: null,
          children: ["n2"],
        },
        n2: {
          id: "n2",
          message: {
            id: "m2",
            author: { role: "assistant" },
            // tether_quote is not "text" — should be ignored
            content: { content_type: "tether_quote", parts: [] },
            create_time: 2,
          },
          parent: "n1",
          children: [],
        },
      },
    };
    const zip = makeZip({ "conversations.json": JSON.stringify([conv]) });
    const result = await parseChatGPTExport(zip);

    // Only the user text message should survive
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content).toBe("Visible text message");
  });

  it("guards against circular mapping references (cycle guard)", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    const conv = {
      id: "c1",
      title: "Cyclic",
      create_time: 1,
      update_time: 2,
      mapping: {
        nodeA: {
          id: "nodeA",
          message: {
            id: "mA",
            author: { role: "user" },
            content: { content_type: "text", parts: ["Root message"] },
            create_time: 1,
          },
          parent: null,
          children: ["nodeB"],
        },
        nodeB: {
          id: "nodeB",
          message: null,
          parent: "nodeA",
          // Back-edge to nodeA creates a cycle
          children: ["nodeA"],
        },
      },
    };
    const zip = makeZip({ "conversations.json": JSON.stringify([conv]) });
    // Must complete without hanging/stack overflow
    const result = await parseChatGPTExport(zip);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content).toBe("Root message");
  });

  it("throws ParseError for empty bytes", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    await expect(parseChatGPTExport(new Uint8Array())).rejects.toThrow(ParseError);
    await expect(parseChatGPTExport(new Uint8Array())).rejects.toThrow("Empty zip data");
  });

  it("throws ParseError for non-zip bytes", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    const notAZip = strToU8("this is not a zip file");
    await expect(parseChatGPTExport(notAZip)).rejects.toThrow(ParseError);
  });

  it("throws ParseError when conversations.json is absent from zip", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    const zip = makeZip({ "readme.txt": "no conversations here" });
    await expect(parseChatGPTExport(zip)).rejects.toThrow(ParseError);
    await expect(parseChatGPTExport(zip)).rejects.toThrow("No conversations.json");
  });

  it("throws ParseError when conversations.json is not valid JSON", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    const zip = makeZip({ "conversations.json": "not json {{" });
    await expect(parseChatGPTExport(zip)).rejects.toThrow(ParseError);
    await expect(parseChatGPTExport(zip)).rejects.toThrow("not valid JSON");
  });

  it("throws ParseError when conversations.json is not an array", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    const zip = makeZip({ "conversations.json": JSON.stringify({ notAnArray: true }) });
    await expect(parseChatGPTExport(zip)).rejects.toThrow(ParseError);
    await expect(parseChatGPTExport(zip)).rejects.toThrow("must be an array");
  });

  it("skips malformed conversations instead of throwing", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");
    // One valid conversation and one that's completely broken (no mapping)
    const conversations = [
      {
        id: "good",
        title: "Good conv",
        create_time: 1,
        update_time: 2,
        mapping: {
          n1: {
            id: "n1",
            message: {
              id: "m1",
              author: { role: "user" },
              content: { content_type: "text", parts: ["Valid message"] },
              create_time: 1,
            },
            parent: null,
            children: [],
          },
        },
      },
      null, // malformed — will throw in conversationToMessages
    ];
    const zip = makeZip({ "conversations.json": JSON.stringify(conversations) });
    const result = await parseChatGPTExport(zip);
    // Should not throw; good conversation should still be parsed
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
      // Re-import ParseError from the same module context as the parser (after resetModules)
      const [{ parseChatGPTExport }, { ParseError: PE }] = await Promise.all([
        import("@/lib/parsers/chatgpt"),
        import("@/lib/errors"),
      ]);
      const zip = makeZip({ "readme.txt": "hello" });

      await expect(parseChatGPTExport(zip)).rejects.toThrow(PE);
      await expect(parseChatGPTExport(zip)).rejects.toThrow(/500 MB/);
    } finally {
      vi.doUnmock("fflate");
      vi.resetModules();
    }
  });
});

// ---------------------------------------------------------------------------
// conversationToMessages — iterative DFS
// ---------------------------------------------------------------------------

describe("ChatGPT export parser — deep conversation DFS", () => {
  it("handles very deep conversation trees without stack overflow", async () => {
    const { parseChatGPTExport } = await import("@/lib/parsers/chatgpt");

    const DEPTH = 20_000;
    const mapping: Record<string, object> = {};
    for (let i = 0; i < DEPTH; i++) {
      mapping[`n${i}`] = {
        id: `n${i}`,
        message: {
          id: `m${i}`,
          author: { role: i % 2 === 0 ? "user" : "assistant" },
          content: { content_type: "text", parts: [`Msg ${i}`] },
          create_time: i + 1,
        },
        parent: i === 0 ? null : `n${i - 1}`,
        children: i < DEPTH - 1 ? [`n${i + 1}`] : [],
      };
    }

    const conv = { id: "deep", title: "Deep", create_time: 1, update_time: 2, mapping };
    const zip = makeZip({ "conversations.json": JSON.stringify([conv]) });

    const result = await parseChatGPTExport(zip);
    expect(result.messages).toHaveLength(DEPTH);
    expect(result.messages[0]?.content).toBe("Msg 0");
    expect(result.messages[DEPTH - 1]?.content).toBe(`Msg ${DEPTH - 1}`);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// extractVocabularyFingerprint
// ---------------------------------------------------------------------------

describe("extractVocabularyFingerprint", () => {
  it("returns words sorted by frequency, filtered to user messages only", async () => {
    const { extractVocabularyFingerprint } = await import("@/lib/parsers/chatgpt");
    const history = {
      source: "chatgpt" as const,
      messages: [
        { role: "user" as const, content: "typescript typescript typescript is great" },
        { role: "user" as const, content: "typescript is awesome engineering" },
        { role: "assistant" as const, content: "typescript typescript typescript" }, // should be ignored
        { role: "user" as const, content: "engineering engineering" },
      ],
    };

    const result = extractVocabularyFingerprint(history);

    // typescript appears 3x in user msgs, engineering 3x, great 1x, awesome 1x
    expect(result).toContain("typescript");
    expect(result).toContain("engineering");
    // "is" is a stop word — should not appear
    expect(result).not.toContain("is");
    // words that appear only once are excluded (count < 2)
    expect(result).not.toContain("great");
    expect(result).not.toContain("awesome");
  });

  it("returns words in descending frequency order", async () => {
    const { extractVocabularyFingerprint } = await import("@/lib/parsers/chatgpt");
    const history = {
      source: "chatgpt" as const,
      messages: [
        { role: "user" as const, content: "product product product" },
        { role: "user" as const, content: "strategy strategy" },
        { role: "user" as const, content: "product" },
      ],
    };

    const result = extractVocabularyFingerprint(history);
    const productIdx = result.indexOf("product");
    const strategyIdx = result.indexOf("strategy");
    expect(productIdx).toBeLessThan(strategyIdx);
  });

  it("returns empty array when there are no user messages", async () => {
    const { extractVocabularyFingerprint } = await import("@/lib/parsers/chatgpt");
    const history = {
      source: "chatgpt" as const,
      messages: [
        { role: "assistant" as const, content: "I can help you with that." },
      ],
    };
    expect(extractVocabularyFingerprint(history)).toEqual([]);
  });
});
