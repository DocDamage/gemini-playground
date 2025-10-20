// /renderer/dashboard/ConsoleFeed.tsx
/**
 * Purpose: Live scrolling terminal feed for stdout/stderr.
 * Color-codes log levels and auto-scrolls on new messages.
 *
 * FEATURE 3 (Debugging):
 * - Added a header with a "Debug with AI" button.
 * - Button appears only when runtime status is 'error'.
 * - Button click retrieves code, stderr, runtime info, and persona,
 * then constructs a prompt and calls aiBridge.generate.
 * - [MODIFIED] Sends the AI's debug analysis to AIContext using addMessage.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useRuntime } from '../context/RuntimeContext';
import { useSettings } from '../context/SettingsContext';
import { useAI } from '../context/AIContext'; // [NEW] Feature 3 Step 3
import { Button } from '@/components/ui/button';
import { Bug, RefreshCcw } from 'lucide-react';

/**
 * Defines the structure for a single log entry.
 */
export interface LogEntry {
  type: 'stdout' | 'stderr' | 'info' | 'error' | 'system';
  message: string;
  timestamp?: string;
}

interface ConsoleFeedProps {
  logs: LogEntry[];
}

/**
 * Gets the appropriate text color class based on the log type.
 */
function getLogColorClass(type: LogEntry['type']): string {
  switch (type) {
    case 'stdout':
      return 'text-text-main';
    case 'stderr':
    case 'error':
      return 'text-error';
    case 'info':
    case 'system':
      return 'text-primary';
    default:
      return 'text-text-muted';
  }
}

/**
 * A live-updating console feed that displays logs and auto-scrolls.
 */
export const ConsoleFeed: React.FC<ConsoleFeedProps> = ({ logs }) => {
  const feedEndRef = useRef<HTMLDivElement>(null);
  const { status, code, selectedRuntime, stderrOutput } = useRuntime();
  const { aiPersona, getPreference } = useSettings();
  const { addMessage } = useAI(); // [NEW] Feature 3 Step 3: Get addMessage
  const [isDebugging, setIsDebugging] = useState(false);

  /**
   * Effect to scroll to the bottom of the feed whenever 'logs' changes.
   */
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  /**
   * Handler for the "Debug with AI" button.
   */
  const handleAIDebug = useCallback(async () => {
    if (status !== 'error' || !stderrOutput || isDebugging) return;

    setIsDebugging(true);
    addMessage({ role: 'system', content: 'Requesting AI debug analysis...' }); // Inform user

    const debugPrompt = `
Analyze the following ${selectedRuntime} code and the error/stderr output it produced.
Explain the likely root cause of the error and suggest specific code fixes or debugging steps. Provide concise explanations and code examples where appropriate.

Code:
\`\`\`${selectedRuntime === 'python' ? 'python' : 'javascript'}
${code}
\`\`\`

Stderr Output:
\`\`\`
${stderrOutput}
\`\`\`
`;
    const fullPrompt = `${aiPersona}\n\n${debugPrompt}`;

    const aiProvider = getPreference("aiProvider") ?? "gemini";
    const aiModelOverride = getPreference("aiModel") ?? "";
    const temperature = getPreference("temperature") ?? 0.7;
    const maxTokens = getPreference("maxTokens") ?? 4096; // Increase tokens for analysis

     const options = {
      provider: aiProvider,
      model: aiModelOverride || undefined,
      temperature,
      maxTokens,
    };

    try {
      const result = await window.aiBridge.generate(fullPrompt, options);

      // [CHANGED] Feature 3 Step 3: Add the response to AIContext
      if (result && result.text) {
        addMessage({
          role: 'assistant',
          content: `🔎 **AI Debug Analysis:**\n\n${result.text}` // Add context prefix
        });
      } else {
        throw new Error("AI returned an empty or invalid response.");
      }
      // Inform user in AI Panel that analysis is complete
      addMessage({ role: 'system', content: 'Debug analysis added.' });

    } catch (err: any) {
      console.error("[ConsoleFeed] AI Debug request failed:", err);
      // [CHANGED] Feature 3 Step 3: Add error to AIContext messages
      addMessage({
        role: 'system',
        content: `⚠️ AI Debug request failed: ${err.message}`
      });
    } finally {
      setIsDebugging(false);
    }

  }, [status, code, selectedRuntime, stderrOutput, aiPersona, getPreference, isDebugging, addMessage]); // Added addMessage dependency


  return (
    <div className="console-feed h-full w-full flex flex-col bg-panel">
       {/* Header with Debug Button */}
       <div className="console-header flex items-center justify-between px-3 py-1 border-b border-border bg-panel-secondary sticky top-0 z-10">
         <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Console Output</span>
         {status === 'error' && (
           <Button
             size="sm"
             variant="destructive_outline" // Needs definition in Button component
             onClick={handleAIDebug}
             disabled={isDebugging || !stderrOutput}
             className="text-xs"
             title="Ask AI to analyze the error in the console output"
           >
             {isDebugging ? (
               <RefreshCcw className="w-3 h-3 mr-1 animate-spin" />
             ) : (
               <Bug className="w-3 h-3 mr-1" />
             )}
             Debug with AI
           </Button>
         )}
       </div>

      {/* Log Entries Area */}
      <div className="flex-grow overflow-y-auto">
        {logs.map((log, index) => (
          <div
            key={index}
            className={`log-entry font-mono text-sm px-3 py-1 border-b border-border last:border-b-0 ${getLogColorClass(log.type)}`}
          >
            <span className="whitespace-pre-wrap break-all">
              {log.message}
            </span>
          </div>
        ))}
        {logs.length === 0 && (
           <div className="text-center text-xs text-text-muted py-4 italic">Console is empty.</div>
        )}
        <div ref={feedEndRef} />
      </div>
    </div>
  );
};

export default ConsoleFeed;