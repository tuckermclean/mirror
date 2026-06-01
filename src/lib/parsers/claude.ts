import { unzipSync } from "fflate";
import { ParseError } from "@/lib/errors";
import type { ParsedChatHistory, ParsedMessage } from "./types";

export { parsePlainTextExport } from "./plaintext";

// ---------------------------------------------------------------------------
// Claude export format types
// ---------------------------------------------------------------------------

type ClaudeMessageContent =
  | string
  | Array<{ type: string; text?: string }>;

type ClaudeMessage = {
  uuid: string;
  sender: "human" | "assistant";
  text?: string;
  content?: ClaudeMessageContent;
  created_at: string;
  updated_at?: string;
};

type ClaudeConversation = {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  chat_messages: ClaudeMessage[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractClaudeMessageText(msg: ClaudeMessage): string {
  if (typeof msg.text === "string" && msg.text.trim()) {
    return msg.text.trim();
  }
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
  }
  if (typeof msg.content === "string") {
    return msg.content.trim();
  }
  return "";
}

function claudeConversationToMessages(conv: ClaudeConversation): ParsedMessage[] {
  return conv.chat_messages
    .filter((m) => m.sender === "human" || m.sender === "assistant")
    .map((m): ParsedMessage | null => {
      const role = m.sender === "human" ? "user" : "assistant";
      const content = extractClaudeMessageText(m);
      if (!content) return null;
      // Use conditional assignment to satisfy exactOptionalPropertyTypes
      const msgObj: ParsedMessage = {
        role,
        content,
        conversationId: conv.uuid,
        conversationTitle: conv.name,
      };
      if (m.created_at) msgObj.timestamp = m.created_at;
      return msgObj;
    })
    .filter((m): m is ParsedMessage => m !== null);
}

// ---------------------------------------------------------------------------
// Internal: accepts already-unzipped files map (avoids double-unzip in index)
// ---------------------------------------------------------------------------

export function parseClaudeFiles(
  files: Record<string, Uint8Array>
): ParsedChatHistory {
  const convoKey = Object.keys(files).find(
    (k) => k === "conversations.json" || k.endsWith("/conversations.json")
  );

  if (!convoKey) {
    throw new ParseError("No conversations.json found in Claude export zip");
  }

  const raw = files[convoKey];
  if (!raw) throw new ParseError("Failed to read conversations.json from zip");

  let conversations: unknown;
  try {
    conversations = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new ParseError("conversations.json is not valid JSON");
  }

  if (!Array.isArray(conversations)) {
    throw new ParseError("Claude conversations.json must be an array");
  }

  const allMessages: ParsedMessage[] = [];
  for (const conv of conversations) {
    try {
      allMessages.push(...claudeConversationToMessages(conv as ClaudeConversation));
    } catch {
      // Skip malformed conversations
    }
  }

  return {
    source: "claude",
    messages: allMessages,
    totalConversations: conversations.length,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a Claude export ZIP file into a structured chat history.
 * Throws ParseError if the zip is invalid or contains no recognizable Claude data.
 */
export async function parseClaudeExport(
  data: Uint8Array
): Promise<ParsedChatHistory> {
  if (data.length === 0) {
    throw new ParseError("Empty zip data — cannot parse Claude export");
  }

  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(data);
  } catch (err) {
    throw new ParseError(
      `Invalid zip archive: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return parseClaudeFiles(files);
}

/**
 * Extract recurring topics from a parsed chat history.
 * Returns the top topic words sorted by frequency.
 */
export function extractRecurringTopics(history: ParsedChatHistory): string[] {
  const freq = new Map<string, number>();
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "is", "it", "i", "you", "we", "they", "how", "can",
    "what", "this", "that", "do", "my", "your", "help", "me", "need",
    "want", "would", "like", "know", "could", "should", "have", "about",
  ]);

  const userMessages = history.messages.filter((m) => m.role === "user");
  for (const msg of userMessages) {
    const words = msg.content.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
    for (const word of words) {
      if (!stopWords.has(word)) {
        freq.set(word, (freq.get(word) ?? 0) + 1);
      }
    }
  }

  return Array.from(freq.entries())
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([word]) => word);
}
