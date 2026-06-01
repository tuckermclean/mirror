import { unzipSync } from "fflate";
import { ParseError } from "@/lib/errors";
import type { ParsedChatHistory, ParsedMessage } from "./types";

// ---------------------------------------------------------------------------
// ChatGPT export format types (conversations.json)
// ---------------------------------------------------------------------------

type ChatGPTMessageContent =
  | { content_type: "text"; parts: (string | null)[] }
  | { content_type: string; parts?: unknown[] };

type ChatGPTMessage = {
  id: string;
  author: { role: "user" | "assistant" | "system" | "tool" };
  content: ChatGPTMessageContent;
  create_time: number | null;
};

type ChatGPTNode = {
  id: string;
  message: ChatGPTMessage | null;
  parent: string | null;
  children: string[];
};

type ChatGPTConversation = {
  id: string;
  title: string;
  create_time: number;
  update_time: number;
  mapping: Record<string, ChatGPTNode>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTextParts(content: ChatGPTMessageContent): string {
  if (content.content_type !== "text" || !Array.isArray(content.parts)) {
    return "";
  }
  return content.parts
    .filter((p): p is string => typeof p === "string")
    .join("")
    .trim();
}

function isTextRole(role: string): role is "user" | "assistant" {
  return role === "user" || role === "assistant";
}

function conversationToMessages(conv: ChatGPTConversation): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  const mapping = conv.mapping;

  const visited = new Set<string>();
  function walk(nodeId: string): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = mapping[nodeId];
    if (!node) return;

    const msg = node.message;
    if (msg && isTextRole(msg.author.role) && msg.content) {
      const text = extractTextParts(msg.content);
      if (text) {
        // Use conditional assignment to satisfy exactOptionalPropertyTypes
        const msgObj: ParsedMessage = {
          role: msg.author.role,
          content: text,
          conversationId: conv.id,
          conversationTitle: conv.title,
        };
        if (msg.create_time != null) {
          msgObj.timestamp = new Date(msg.create_time * 1000).toISOString();
        }
        messages.push(msgObj);
      }
    }

    for (const childId of node.children) {
      walk(childId);
    }
  }

  // Find root nodes (no parent or parent not in mapping)
  for (const nodeId of Object.keys(mapping)) {
    const node = mapping[nodeId];
    if (node && (node.parent === null || !mapping[node.parent])) {
      walk(nodeId);
    }
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Internal: accepts already-unzipped files map (avoids double-unzip in index)
// ---------------------------------------------------------------------------

export function parseChatGPTFiles(
  files: Record<string, Uint8Array>
): ParsedChatHistory {
  const convoKey = Object.keys(files).find(
    (k) => k === "conversations.json" || k.endsWith("/conversations.json")
  );

  if (!convoKey) {
    throw new ParseError("No conversations.json found in ChatGPT export zip");
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
    throw new ParseError("conversations.json must be an array");
  }

  const allMessages: ParsedMessage[] = [];
  for (const conv of conversations) {
    try {
      allMessages.push(...conversationToMessages(conv as ChatGPTConversation));
    } catch {
      // Skip malformed conversations rather than failing the whole export
    }
  }

  return {
    source: "chatgpt",
    messages: allMessages,
    totalConversations: conversations.length,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a ChatGPT export ZIP file into a structured chat history.
 * Throws ParseError if the zip is invalid or contains no conversations.json.
 */
export async function parseChatGPTExport(
  data: Uint8Array
): Promise<ParsedChatHistory> {
  if (data.length === 0) {
    throw new ParseError("Empty zip data — cannot parse ChatGPT export");
  }

  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(data);
  } catch (err) {
    throw new ParseError(
      `Invalid zip archive: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return parseChatGPTFiles(files);
}

/**
 * Extract vocabulary fingerprint — the most distinctive words used by the
 * user across all messages. Returns words sorted by frequency descending.
 */
export function extractVocabularyFingerprint(history: ParsedChatHistory): string[] {
  const freq = new Map<string, number>();
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "is", "it", "i", "you", "we", "they", "he", "she",
    "this", "that", "was", "are", "be", "have", "had", "has", "do", "did",
    "can", "will", "would", "could", "should", "not", "so", "as", "by",
    "from", "up", "about", "into", "through", "during", "more", "also",
    "my", "your", "our", "their", "its", "his", "her", "if", "then",
    "just", "like", "what", "how", "when", "where", "which", "there",
  ]);

  const userMessages = history.messages.filter((m) => m.role === "user");
  for (const msg of userMessages) {
    const words = msg.content.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
    for (const word of words) {
      if (!stopWords.has(word)) {
        freq.set(word, (freq.get(word) ?? 0) + 1);
      }
    }
  }

  return Array.from(freq.entries())
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 50)
    .map(([word]) => word);
}
