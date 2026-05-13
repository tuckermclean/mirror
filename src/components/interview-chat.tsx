"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatApiChunk =
  | { text: string }
  | { complete: true }
  | { error: string };

type Props = {
  userId: string;
};

export function InterviewChat({ userId: _userId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [hasExchanged, setHasExchanged] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || isComplete) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const outgoingMessages: Message[] = [...messages, userMessage];

    setMessages(outgoingMessages);
    setInput("");
    setIsStreaming(true);

    // Append empty assistant message placeholder
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: outgoingMessages }),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        const errorText =
          errBody.error === "interview_complete"
            ? "This interview has already been completed."
            : `Error: ${errBody.error ?? response.statusText}`;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: errorText,
          };
          return updated;
        });
        setIsStreaming(false);
        return;
      }

      if (!response.body) {
        setIsStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last potentially-incomplete line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") {
            setIsStreaming(false);
            setHasExchanged(true);
            continue;
          }
          try {
            const chunk = JSON.parse(raw) as ChatApiChunk;
            if ("text" in chunk) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: last.content + chunk.text,
                  };
                }
                return updated;
              });
            } else if ("complete" in chunk && chunk.complete) {
              setIsComplete(true);
              setHasExchanged(true);
            } else if ("error" in chunk) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: `Error: ${chunk.error}`,
                };
                return updated;
              });
            }
          } catch {
            // Malformed JSON chunk — skip
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      {/* Message list */}
      <div className="flex flex-col gap-3 min-h-[300px] max-h-[60vh] overflow-y-auto rounded-lg border border-gray-200 p-4 bg-white">
        {messages.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-8">
            Your conversation will appear here. Start by saying hello or sharing a little about yourself.
          </p>
        )}
        {messages.map((msg, idx) =>
          msg.role === "assistant" ? (
            <div
              key={idx}
              data-testid="assistant-message"
              className="self-start bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2 max-w-[85%] text-gray-800 text-sm leading-relaxed"
            >
              {msg.content}
              {isStreaming && idx === messages.length - 1 && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-gray-400 animate-pulse align-middle" />
              )}
            </div>
          ) : (
            <div
              key={idx}
              className="self-end bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%] text-sm leading-relaxed"
            >
              {msg.content}
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Completion banner */}
      <div
        data-testid="interview-complete"
        className={isComplete ? "block" : "hidden"}
      >
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-green-800 text-sm text-center">
          Your interview is complete. Mirror will now use your story to rewrite your LinkedIn profile.
        </div>
      </div>

      {/* Transcript saved indicator */}
      <div
        data-testid="save-transcript"
        className={hasExchanged ? "block" : "hidden"}
      >
        <p className="text-xs text-gray-400 text-center">
          Your responses are being saved securely.
        </p>
      </div>

      {/* Input area */}
      <div className="flex gap-2 items-end">
        <textarea
          data-testid="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming || isComplete}
          rows={2}
          placeholder={
            isComplete
              ? "Interview complete"
              : "Type your response and press Enter to send…"
          }
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          data-testid="send-button"
          onClick={() => void sendMessage()}
          disabled={isStreaming || isComplete || !input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isStreaming ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
