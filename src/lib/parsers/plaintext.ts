import type { ParsedChatHistory, ParsedMessage } from "./types";

/**
 * Parse a plain-text chat history (no zip, raw text).
 * Lines starting with "Human:" or "User:" are user messages;
 * lines starting with "Assistant:" or "Claude:" are assistant messages.
 */
export function parsePlainTextExport(text: string): ParsedChatHistory {
  const messages: ParsedMessage[] = [];
  const lines = text.split(/\r?\n/);

  let currentRole: "user" | "assistant" | null = null;
  let currentLines: string[] = [];

  function flush(): void {
    if (currentRole && currentLines.length > 0) {
      const content = currentLines.join("\n").trim();
      if (content) messages.push({ role: currentRole, content });
    }
    currentLines = [];
  }

  for (const line of lines) {
    const userMatch = /^(Human|User):\s*/i.exec(line);
    const assistantMatch = /^(Assistant|Claude):\s*/i.exec(line);

    if (userMatch) {
      flush();
      currentRole = "user";
      currentLines = [line.slice(userMatch[0].length)];
    } else if (assistantMatch) {
      flush();
      currentRole = "assistant";
      currentLines = [line.slice(assistantMatch[0].length)];
    } else if (currentRole !== null) {
      currentLines.push(line);
    }
  }
  flush();

  return { source: "plain_text", messages };
}
