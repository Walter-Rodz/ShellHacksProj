"use client";

import { useEffect, useRef, useState } from "react";
import { sendChat, type ChatMessage, type ChatReply } from "../lib/api";
import styles from "./ChatPanel.module.css";

// A message in the window. AI replies can carry recommended consoles.
type ShownMessage = ChatMessage & { consoles?: ChatReply["consoles"] };

const GREETING: ShownMessage = {
  role: "assistant",
  content:
    "Hi! Tell me what you'd like to play and I'll help you find a handheld. For example: \"something pocketable for GBA and PS1 under $80\".",
};

/**
 * The "Ask AI" chat: a button in the corner that opens a chat window.
 * The whole conversation is sent to the backend each time (it keeps no history of its own).
 * Clicking a recommended console calls onSelectConsole with its slug.
 */
export default function ChatPanel({ onSelectConsole }: { onSelectConsole: (slug: string) => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ShownMessage[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, waiting, open]);

  const send = async () => {
    const text = draft.trim();
    if (!text || waiting) return;

    const conversation: ShownMessage[] = [...messages, { role: "user", content: text }];
    setMessages(conversation);
    setDraft("");
    setWaiting(true);
    try {
      // The greeting is only for show; the backend gets the real conversation
      const history = conversation
        .filter((m) => m !== GREETING)
        .map(({ role, content }) => ({ role, content }));
      const reply = await sendChat(history);
      setMessages((prev) => [...prev, { role: "assistant", content: reply.reply, consoles: reply.consoles }]);
    } catch (err) {
      console.error("Chat request failed:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I couldn't reach the server. Is the backend running?" },
      ]);
    } finally {
      setWaiting(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className={styles.launcher} onClick={() => setOpen(true)}>
        <span aria-hidden="true">✦</span> Ask AI
      </button>
    );
  }

  return (
    <section className={styles.panel} role="dialog" aria-label="Ask AI chat">
      <header className={styles.header}>
        <span className={styles.title}>
          <span aria-hidden="true">✦</span> Ask AI
        </span>
        <div className={styles.headerButtons}>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setMessages([GREETING])}
            disabled={waiting || messages.length === 1}
          >
            New chat
          </button>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close chat">
            &times;
          </button>
        </div>
      </header>

      <div className={styles.messages} aria-live="polite">
        {messages.map((message, i) => (
          <div key={i} className={message.role === "user" ? styles.userMessage : styles.aiMessage}>
            <p className={styles.bubble}>{message.content}</p>
            {message.consoles && message.consoles.length > 0 && (
              <div className={styles.consoles}>
                {message.consoles.map((device) => (
                  <button
                    type="button"
                    key={device.id}
                    className={styles.consoleChip}
                    onClick={() => onSelectConsole(device.slug)}
                    title="Show this console"
                  >
                    {device.name}
                    {device.startingPriceUsd !== null && (
                      <span className={styles.chipPrice}> · ${device.startingPriceUsd}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {waiting && (
          <div className={styles.aiMessage}>
            <p className={`${styles.bubble} ${styles.typing}`}>Thinking…</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className={styles.inputRow}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about consoles…"
          maxLength={1000}
          aria-label="Your message"
          autoFocus
        />
        <button type="submit" className={styles.send} disabled={!draft.trim() || waiting}>
          Send
        </button>
      </form>
    </section>
  );
}
