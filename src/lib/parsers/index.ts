import { unzip, unzipSync } from "fflate";
import { ParseError } from "@/lib/errors";
import { parseChatGPTFiles } from "./chatgpt";
import { parseClaudeFiles } from "./claude";
import type { ParsedChatHistory } from "./types";

const MAX_DECOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MB

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, (err, result) => {
      if (err) reject(err);
      else resolve(result as Record<string, Uint8Array>);
    });
  });
}

export type { ParsedChatHistory, ParsedMessage } from "./types";
export { parseChatGPTExport, extractVocabularyFingerprint } from "./chatgpt";
export { parseClaudeExport, parsePlainTextExport, extractRecurringTopics } from "./claude";

type ZipFormat = "chatgpt" | "claude" | "unknown";

function detectZipFormat(files: Record<string, Uint8Array>): ZipFormat {
  const keys = Object.keys(files);

  // ChatGPT exports have distinct marker files
  const hasChatGPTFiles = keys.some(
    (k) => k === "chat.html" || k.endsWith("/chat.html") || k === "message_feedback.json"
  );
  if (hasChatGPTFiles) return "chatgpt";

  // Claude exports may have profile.json
  const hasClaudeFiles = keys.some(
    (k) => k === "profile.json" || k.endsWith("/profile.json")
  );
  if (hasClaudeFiles) return "claude";

  // Fall back to conversations.json content inspection
  const convoKey = keys.find(
    (k) => k === "conversations.json" || k.endsWith("/conversations.json")
  );
  if (!convoKey) return "unknown";

  try {
    const raw = files[convoKey];
    if (!raw) return "unknown";
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return "unknown";
    const first = parsed[0] as Record<string, unknown>;
    if (first["chat_messages"] != null) return "claude";
    if (first["mapping"] != null) return "chatgpt";
  } catch {
    // ignore parse errors during detection
  }

  return "unknown";
}

/**
 * Detect the source format of an AI chat export from raw bytes.
 * Inspects ZIP contents — never uses filename heuristics.
 * Returns "unknown" for non-zip or unrecognised inputs.
 */
export function detectSourceFromBytes(
  bytes: Uint8Array
): "chatgpt" | "claude" | "unknown" {
  if (bytes.length === 0) return "unknown";
  try {
    const files = unzipSync(bytes);
    return detectZipFormat(files);
  } catch {
    return "unknown";
  }
}

/**
 * Auto-detect the format of an AI chat export zip and parse it.
 * Accepts either a File object or raw Uint8Array bytes.
 * Throws ParseError if the format cannot be detected or parsing fails.
 * The zip is decompressed only once regardless of which parser is invoked.
 */
export async function parseAiHistory(
  input: File | Uint8Array
): Promise<ParsedChatHistory> {
  let bytes: Uint8Array;

  if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    const buffer = await input.arrayBuffer();
    bytes = new Uint8Array(buffer);
  }

  if (bytes.length === 0) {
    throw new ParseError("Empty input — cannot detect AI export format");
  }

  let files: Record<string, Uint8Array>;
  try {
    files = await unzipAsync(bytes);
  } catch (err) {
    throw new ParseError(
      `Invalid zip archive: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const totalBytes = Object.values(files).reduce((sum, f) => sum + f.length, 0);
  if (totalBytes > MAX_DECOMPRESSED_BYTES) {
    throw new ParseError(`Export decompresses to more than 500 MB — rejecting`);
  }

  const format = detectZipFormat(files);

  // Pass the already-decoded files map — no second unzipSync call
  if (format === "chatgpt") return parseChatGPTFiles(files);
  if (format === "claude") return parseClaudeFiles(files);

  // Last resort: try each files-based parser in sequence
  const errors: string[] = [];
  try {
    return parseChatGPTFiles(files);
  } catch (e) {
    errors.push(`chatgpt: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    return parseClaudeFiles(files);
  } catch (e) {
    errors.push(`claude: ${e instanceof Error ? e.message : String(e)}`);
  }

  throw new ParseError(
    `Could not parse export as ChatGPT or Claude format. Errors: ${errors.join("; ")}`
  );
}
