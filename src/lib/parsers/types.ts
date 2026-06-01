/** A single message from an AI chat history export. */
export type ParsedMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  conversationId?: string;
  conversationTitle?: string;
};

/** The structured output from any AI history parser. */
export type ParsedChatHistory = {
  source: "chatgpt" | "claude" | "plain_text";
  messages: ParsedMessage[];
  exportedAt?: string;
  totalConversations?: number;
};
