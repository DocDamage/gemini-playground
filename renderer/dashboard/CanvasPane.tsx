// /renderer/dashboard/CanvasPane.tsx
/**
 * Purpose: Main execution viewport for any language.
 *
 * FEATURE 4 (Test Generation):
 * - Added "Generate Tests" button.
 * - Implemented handler to call AI for test generation and display
 * the result in AIContext/AIPanel.
 */

import React, { useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import OutputRenderer from './OutputRenderer';
import ConsoleFeed from './ConsoleFeed';
import { useRuntime } from '../context/RuntimeContext';
import { useSettings } from '../context/SettingsContext'; // [NEW] Feature 4
import { useAI } from '../context/AIContext';       // [NEW] Feature 4
import { Button } from '@/components/ui/button';
import { FlaskConical, Play, RefreshCcw } from 'lucide-react';

/**
 * The main pane for code editing and viewing output.
 */
const CanvasPane: React.FC = () => {
  const {
    runCode,
    status,
    logs,
    output,
    code,
    setCode,
    selectedRuntime,
  } = useRuntime();
  const { aiPersona, getPreference } = useSettings(); // [NEW] Feature 4
  const { addMessage } = useAI();                 // [NEW] Feature 4

  // State for test generation loading
  const [isGeneratingTests, setIsGeneratingTests] = useState(false);

  const handleEditorChange = (value: string | undefined) => {
    setCode(value || '');
  };

  const handleRun = () => {
    runCode();
  };

  /**
   * [MODIFIED] Feature 4: Handler for test generation.
   */
  const handleGenerateTests = useCallback(async () => {
    if (!code.trim() || isGeneratingTests) return;

    setIsGeneratingTests(true);
    addMessage({ role: 'system', content: 'Generating unit tests...' }); // Inform user

    // 1. Get code, runtime from context (already available).
    // 2. Determine test framework.
    const testFramework = selectedRuntime === 'python' ? 'pytest' : 'vitest'; // or 'jest'
    const languageName = selectedRuntime === 'python' ? 'Python' : 'JavaScript/TypeScript';

    // 3. Construct prompt.
    const testGenPrompt = `
Generate comprehensive unit tests for the following ${languageName} code using the ${testFramework} framework.
Include necessary imports, setup, mock objects (if applicable), and cover edge cases where possible.
Ensure the tests are runnable and follow standard conventions for ${testFramework}.

Code to test:
\`\`\`${selectedRuntime === 'python' ? 'python' : 'javascript'}
${code}
\`\`\`
`;
    // Prepend persona
    const fullPrompt = `${aiPersona}\n\n${testGenPrompt}`;

    // 4. Call aiBridge.generate.
    // Retrieve AI config
    const aiProvider = getPreference("aiProvider") ?? "gemini";
    const aiModelOverride = getPreference("aiModel") ?? "";
    const temperature = getPreference("temperature") ?? 0.5; // Lower temp for tests?
    const maxTokens = getPreference("maxTokens") ?? 4096; // Increase for tests

    const options = {
      provider: aiProvider,
      model: aiModelOverride || undefined,
      temperature,
      maxTokens,
    };

    try {
      const result = await window.aiBridge.generate(fullPrompt, options);

      // 5. Display result (in AIPanel via AIContext).
      if (result && result.text) {
        // Format the output nicely in markdown code block
        const testCodeResult = `🧪 **Generated Tests (${testFramework}):**\n\n\`\`\`${selectedRuntime === 'python' ? 'python' : 'javascript'}\n${result.text}\n\`\`\``;
        addMessage({
          role: 'assistant',
          content: testCodeResult
        });
        addMessage({ role: 'system', content: 'Test generation complete.' });
      } else {
        throw new Error("AI returned an empty or invalid response for test generation.");
      }

    } catch (err: any) {
      console.error("[CanvasPane] AI Test Generation failed:", err);
      addMessage({
        role: 'system',
        content: `⚠️ Test generation failed: ${err.message}`
      });
    } finally {
      setIsGeneratingTests(false);
    }
  }, [code, selectedRuntime, aiPersona, getPreference, addMessage, isGeneratingTests]); // Updated dependencies


  return (
    // Updated styling using pane class
    <div className="canvas-pane grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
      {/* Left Side: Code Editor */}
      <div className="editor-container flex flex-col h-full pane"> {/* Use pane class */}
        <div className="editor-toolbar flex justify-between items-center px-3 py-2 border-b border-border bg-panel-secondary">
          <span className="text-sm font-semibold text-text-muted">Editor</span>
          <div className="flex items-center gap-2">
            {/* Generate Tests Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateTests}
              disabled={status === 'running' || isGeneratingTests || !code.trim()}
              title="Generate unit tests for the current code (AI)"
            >
              {isGeneratingTests ? (
                 <RefreshCcw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                 <FlaskConical className="w-4 h-4 mr-1" />
              )}
              Tests
            </Button>

            {/* Run Button */}
            <Button
              size="sm"
              variant="default" // Use default variant for primary action
              onClick={handleRun}
              disabled={status === 'running' || isGeneratingTests || !code.trim()}
              className="bg-primary hover:bg-primary/90 text-white"
              title="Run code (Ctrl+Enter)"
            >
              {status === 'running' ? (
                 <RefreshCcw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                 <Play className="w-4 h-4 mr-1" />
              )}
              Run
            </Button>
          </div>
        </div>
        <div className="editor-wrapper flex-grow relative"> {/* Added relative for potential overlays */}
          <Editor
            // Ensure editor fills the container
            wrapperProps={{ style: { height: '100%', width: '100%' } }}
            height="100%" // Monaco specific height prop
            language={selectedRuntime === 'python' ? 'python' : 'javascript'}
            value={code}
            onChange={handleEditorChange}
            theme={ 'vs-dark'} // TODO: Sync with theme context
            options={{
              minimap: { enabled: false },
              fontSize: 14, // TODO: Sync with settings context
              fontFamily: 'JetBrains Mono, monospace', // Use theme font stack
              lineNumbers: 'on', // Default to on
              automaticLayout: true, // Ensures editor resizes correctly
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      </div>

      {/* Right Side: Output and Console */}
      <div className="output-container flex flex-col h-full gap-4">
        {/* Top-Right: Visual Output */}
        <div className="output-renderer-wrapper flex-grow flex flex-col pane"> {/* Use pane class */}
          <div className="output-toolbar px-3 py-2 border-b border-border bg-panel-secondary">
            <span className="text-sm font-semibold text-text-muted">Output</span>
          </div>
          <div className="output-content p-4 overflow-auto flex-grow">
            <OutputRenderer output={output} />
          </div>
        </div>

        {/* Bottom-Right: Console Feed */}
        <div className="console-feed-wrapper h-1/3 flex flex-col border border-border rounded-lg shadow-sm overflow-hidden">
           <ConsoleFeed logs={logs} />
        </div>
      </div>
    </div>
  );
};

export default CanvasPane;