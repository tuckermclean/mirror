import { unzipSync } from "fflate";
import { parseChatGPTExport } from "./chatgpt";
import { parseClaudeExport } from "./claude";
import type { ParsedChatHistory } from "./types";

export type { ParsedChatHistory, ParsedMessage } from "./types";
export { parseChatGPTExport, extractVocabularyFingerprint } from "./chatgpt";
export { parseClaudeExport, parsePlainTextExport, extractRecurringTopics } from "./claude";

type ZipFormat = "chatgpt" | "claude" | "unknown";

function detectZipFormat(files: Record<string, Uint8Array>): ZipFormat {
  const keys = Object.keys(files);

  // ChatGPT exports always have conversations.json at root with ChatGPT-specific structure
  // Claude exports also have conversations.json but different structure
  // Differentiate by checking for ChatGPT-specific files
  const hasChatGPTFiles = keys.some(
    (k) => k === "chat.html" || k.endsWith("/chat.html") || k === "message_feedback.json"
  );
  if (hasChatGPTFiles) return "chatgpt";

  // Claude exports may have profile.json
  const hasClaudeFiles = keys.some(
    (k) => k === "profile.json" || k.endsWith("/profile.json")
  );
  if (hasClaudeFiles) return "claude";

  // Fall back to conversations.json presence and try to detect from content
  const convoKey = keys.find(
    (k) => k === "conversations.json" || k.endsWith("/conversations.json")
  );
  if (!convoKey) return "unknown";

  try {
    const raw = files[convoKey];
    if (!raw) return "unknown";
    const parsed = JSON.parse(new TextDecoder().decode(raw));
    if (!Array.isArray(parsed) || parsed.length === 0) return "unknown";
    const first = parsed[0] as Record<string, unknown>;
    // Claude conversations have chat_messages; ChatGPT has mapping
    if (first["chat_messages"] != null) return "claude";
    if (first["mapping"] != null) return "chatgpt";
  } catch {
    // ignore parse errors during detection
  }

  return "unknown";
}

/**
 * Auto-detect the format of an AI chat export zip and parse it.
 * Accepts either a File object or raw Uint8Array bytes.
 * Throws if the format cannot be detected or parsing fails.
 */
export async function parseAiHistory(input: File | Uint8Array): Promise<ParsedChatHistory> {
  let bytes: Uint8Array;

  if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    const buffer = await input.arrayBuffer();
    bytes = new Uint8Array(buffer);
  }

  if (bytes.length === 0) {
    throw new Error("Empty input — cannot detect AI export format");
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (err) {
    throw new Error(`Invalid zip archive: ${err instanceof Error ? err.message : String(err)}`);
  }

  const format = detectZipFormat(files);

  if (format === "chatgpt") return parseChatGPTExport(bytes);
  if (format === "claude") return parseClaudeExport(bytes);

  // Last resort: try each parser in sequence
  const errors: string[] = [];
  try {
    return await parseChatGPTExport(bytes);
  } catch (e) {
    errors.push(`chatgpt: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    return await parseClaudeExport(bytes);
  } catch (e) {
    errors.push(`claude: ${e instanceof Error ? e.message : String(e)}`);
  }

  throw new Error(`Could not parse export as ChatGPT or Claude format. Errors: ${errors.join("; ")}`);
}
