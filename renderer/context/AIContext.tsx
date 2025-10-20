/**
 * renderer/context/AIContext.tsx
 *
 * Central AI system controller for prompts and completions history.
 * Interacts with the backend aiService via the aiBridge.
 *
 * [REFACTORED VERSION - Verified]:
 * - Removed direct API fetch calls (runOpenAI, runGemini, etc.).
 * - Removed dependency on useCode context and related functions (injectAsset, etc.).
 * - Removed local provider/settings state management.
 * - Modified sendPrompt to use window.aiBridge.generate.
 * - Added messages state to store conversation history.
 * - Added addMessage function for external components (like ConsoleFeed)
 * to push messages into the chat history.
 * - Integrates with SettingsContext for configuration (provider, persona, etc.).
 */

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
} from "react";
// Removed: import { useCode } from "./CodeContext";
import { useSettings } from "./SettingsContext"; // Import useSettings
import mitt from "mitt";

// Re-use ChatMessage type potentially from AIPanel or define here
export type ChatMessage = { // Exporting for use in AIPanel
  role: "user" | "assistant" | "system";
  content: string;
};

// Simplified settings for temporary overrides if needed during a call
interface AIContextSettings {
  temperature?: number;
  maxTokens?: number;
  model?: string; // Allow overriding model temporarily
  provider?: string; // Allow overriding provider temporarily
}

interface AIContextType {
  messages: ChatMessage[];
  loading: boolean;
  sendPrompt: (prompt: string, options?: AIContextSettings) => Promise<void>;
  addMessage: (message: ChatMessage) => void; // Function to add messages externally
  clearMessages: () => void;
  onEvent: typeof emitter.on;
  offEvent: typeof emitter.off;
}

const emitter = mitt();
const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider = ({ children }: { children: ReactNode }) => {
  const { aiPersona, getPreference } = useSettings(); // Use settings context

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  /** Main AI prompt handler */
  const sendPrompt = useCallback(
    async (prompt: string, optionsOverride?: AIContextSettings) => {
      setLoading(true);
      const userMessage: ChatMessage = { role: "user", content: prompt };
      setMessages((prev) => [...prev, userMessage]);

      // Get base settings from SettingsContext
      const baseProvider = optionsOverride?.provider ?? getPreference("aiProvider") ?? "gemini";
      const baseModelOverride = optionsOverride?.model ?? getPreference("aiModel") ?? "";
      const baseTemperature = optionsOverride?.temperature ?? getPreference("temperature") ?? 0.7;
      const baseMaxTokens = optionsOverride?.maxTokens ?? getPreference("maxTokens") ?? 2048;

      // Prepend Persona
      const fullPrompt = `${aiPersona}\n\nUser Prompt: ${prompt}`;

      // Construct options for aiService.generate
      const options = {
        provider: baseProvider,
        model: baseModelOverride || undefined,
        temperature: baseTemperature,
        maxTokens: baseMaxTokens,
        source: 'aicontext', // Identify source for logging
      };

      try {
        // Use the aiBridge to call the backend aiService
        const result = await window.aiBridge.generate(fullPrompt, options);

        if (!result || typeof result.text === 'undefined') {
          throw new Error("Invalid response structure from AI bridge.");
        }

        const aiMessage: ChatMessage = {
          role: "assistant",
          content: result.text || `(No response text - Success: ${result.success})`,
        };
        setMessages((prev) => [...prev, aiMessage]);
        emitter.emit("prompt-finished", result); // Emit event
      } catch (err: any) {
        const errMsg = err?.message || "An unknown error occurred.";
        console.error("[AIContext] AI Bridge error:", errMsg);
        const errorMessage: ChatMessage = {
          role: "system",
          content: `Error: ${errMsg}`,
        };
        setMessages((prev) => [...prev, errorMessage]);
        emitter.emit("prompt-error", errMsg); // Emit error event
      } finally {
        setLoading(false);
      }
    },
    [aiPersona, getPreference] // Dependencies
  );

  /** Function to allow adding messages from outside (e.g., debug results) */
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
    // Optionally focus the AI panel or emit an event
    emitter.emit("message-added", message);
  }, []);

  /** Function to clear the chat history */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return (
    <AIContext.Provider
      value={{
        messages,
        loading,
        sendPrompt,
        addMessage,
        clearMessages,
        onEvent: emitter.on.bind(emitter),
        offEvent: emitter.off.bind(emitter),
      }}
    >
      {children}
    </AIContext.Provider>
  );
};

export const useAI = (): AIContextType => {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error("useAI must be used within AIProvider");
  return ctx;
};
