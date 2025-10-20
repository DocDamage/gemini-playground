/**
 * renderer/dashboard/AIPanel.tsx
 *
 * Dual-purpose AI panel for interacting with LLMs.
 *
 * [REFACTORED VERSION 2]:
 * - Integrated fully with the refactored AIContext.
 * - Removed local state for messages, loading, error.
 * - Uses context.sendPrompt, context.addMessage, context.clearMessages.
 * - Renders messages directly from context.messages.
 * - Listens for 'message-added' event from context to scroll on external adds.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSettings } from "../context/SettingsContext";
import { useAI, ChatMessage } from "../context/AIContext"; // [CHANGED] Import useAI and ChatMessage
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Send, Trash2, RefreshCcw } from "lucide-react"; // Added RefreshCcw for loading

// Available models (could eventually come from context/config)
const AVAILABLE_MODELS = [
  "gemini",
  "openai",
  "ollama",
  "custom-endpoint", // Assuming this corresponds to a specific provider config
];

const AIPanel: React.FC = () => {
  const { settings, setPreference } = useSettings(); // Keep for provider selection
  const { messages, loading, sendPrompt, clearMessages, onEvent, offEvent } = useAI(); // [CHANGED] Use AIContext

  const [input, setInput] = useState("");
  // Removed local: messages, loading, error state
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  // Get relevant AI settings from context (used for display/control only now)
  const aiProvider = settings.getPreference("aiProvider") ?? "gemini";

  // Scroll chat to bottom when context messages change or are added externally
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // [NEW] Listen for external message additions to ensure scroll
  useEffect(() => {
    const handleExternalAdd = () => {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    onEvent('message-added', handleExternalAdd);
    return () => {
      offEvent('message-added', handleExternalAdd);
    };
  }, [onEvent, offEvent]);


  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    const currentInput = input;
    setInput(""); // Clear input immediately
    await sendPrompt(currentInput); // [CHANGED] Call context function
  }, [input, loading, sendPrompt]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleModelChange = (newProvider: string) => {
    setPreference("aiProvider", newProvider);
    // Context handles adding system message if needed, or add here via addMessage
  };

  // [CHANGED] Use clearMessages from context
  const handleClearChat = () => clearMessages();

  return (
    <div className="h-full flex flex-col bg-bg text-text-main">
      {/* Header */}
      <header className="flex items-center justify-between bg-panel shadow px-4 py-2 border-b border-border">
        <h1 className="text-lg font-semibold">AI Panel</h1>
        <div className="flex items-center gap-3">
          <select
            value={aiProvider}
            onChange={(e) => handleModelChange(e.target.value)}
            className="border border-border rounded-md text-sm px-2 py-1 bg-panel focus:ring-1 focus:ring-primary focus:outline-none"
            disabled={loading} // Disable while loading
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={handleClearChat} className="text-text-muted hover:text-text-main" disabled={loading}>
            <Trash2 className="w-4 h-4 mr-1" /> Clear
          </Button>
        </div>
      </header>

      {/* Chat Display */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-bg">
        {/* [CHANGED] Render messages from context */}
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex ${
              msg.role === "assistant" ? "justify-start" : msg.role === "user" ? "justify-end" : "justify-center"
            }`}
          >
            {msg.role === 'system' ? (
              <div className="text-xs text-text-muted italic px-4 py-1 max-w-[90%] break-words">
                {msg.content}
              </div>
            ) : (
              <Card
                className={`max-w-[80%] md:max-w-[70%] shadow-md rounded-lg ${
                  msg.role === "assistant"
                    ? "bg-panel border border-border" // Assistant uses panel bg
                    : "bg-primary text-white" // User uses primary bg
                }`}
              >
                <CardContent className="p-3 text-sm whitespace-pre-wrap break-words">
                  {msg.content}
                </CardContent>
              </Card>
            )}
          </motion.div>
        ))}

        {/* Loading indicator uses context state */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start text-text-muted text-sm mt-2 items-center gap-2 px-4" // Align left like assistant message
          >
            <RefreshCcw className="w-4 h-4 animate-spin text-primary"/>
            <span>Thinking...</span>
          </motion.div>
        )}

        {/* Removed local error display, context handles errors by adding system messages */}

        <div ref={messageEndRef} />
      </main>

      {/* Input Bar */}
      <footer className="bg-panel border-t border-border px-4 py-2 flex gap-2 items-start">
        <textarea
          rows={1}
          value={input}
          placeholder="Ask AI..."
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`; // Limit height
          }}
          onKeyDown={handleKeyPress}
          className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-bg resize-none overflow-y-auto max-h-32 focus:outline-none focus:ring-1 focus:ring-primary"
          style={{ height: '40px' }} // Initial height
          disabled={loading} // Disable input while loading
        />
        <Button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="bg-primary hover:bg-primary/90 text-white px-3 py-2 rounded-md h-[40px] disabled:opacity-50"
          title="Send message (Enter)"
        >
          <Send className="w-4 h-4" />
        </Button>
      </footer>
    </div>
  );
};

export default AIPanel;