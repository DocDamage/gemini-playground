/**
 * renderer/dashboard/CommandPalette.tsx
 *
 * Universal quick-command overlay for Gemini Playground.
 * Accessible with Ctrl / Cmd + K. Executes actions across AI, Assets, and Code contexts.
 *
 * FEATURE 1 (AI Persona):
 * - Imported 'useSettings' hook.
 * - Retrieved 'aiPersona' from settings.
 * - Modified AI command actions ('ai-explain', 'ai-generate', 'asset-inject')
 * to prepend the 'aiPersona' to the prompt before sending.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAI } from "../context/AIContext";
import { useAssets } from "../context/AssetsContext";
import { useRuntime } from "../context/RuntimeContext";
import { useProjects } from "../context/ProjectsContext";
import { useSettings } from "../context/SettingsContext"; // [NEW] Feature 1
import { motion, AnimatePresence } from "framer-motion";
import { Search, Check, X, Play, Square, List, Mic, Brain } from "lucide-react"; // Added Brain icon

interface Command {
  id: string;
  label: string;
  action: () => Promise<void> | void;
  section: string;
  icon?: React.ReactElement;
}

const CommandPalette: React.FC = () => {
  const { syncAll: syncAssets, refreshAssets, selectedAsset } = useAssets();
  const { generate, explainCode, summarizeChanges } = useAI();
  const {
    runCode,
    stopCode,
    selectRuntime,
    availableRuntimes,
    code,
    setCode,
  } = useRuntime();
  const { saveProject } = useProjects();
  const { aiPersona } = useSettings(); // [NEW] Feature 1: Get persona

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState<Command[]>([]);
  const [highlight, setHighlight] = useState(0);

  /** --- command definitions --- **/
  const commands: Command[] = useMemo(() => {

    const runtimeSelectCommands: Command[] = availableRuntimes.map(rt => ({
      id: `runtime-select-${rt.id}`,
      label: `Switch runtime to: ${rt.label}`,
      section: "Runtime",
      icon: <List className="w-4 h-4" />,
      action: () => selectRuntime(rt.id),
    }));

    return [
      // Voice Command (Batch 5)
      {
        id: "voice-record",
        label: "🎤 Start voice command",
        section: "Voice",
        icon: <Mic className="w-4 h-4" />,
        action: () => window.fileBridge.voiceStart(),
      },
      // Runtime Commands (Batch 3)
      {
        id: "runtime-run",
        label: "🚀 Run current code",
        section: "Runtime",
        icon: <Play className="w-4 h-4" />,
        action: runCode,
      },
      {
        id: "runtime-stop",
        label: "⏹️ Stop execution",
        section: "Runtime",
        icon: <Square className="w-4 h-4" />,
        action: stopCode,
      },
      // AI Commands (Rewired, Persona Added)
      {
        id: "ai-explain",
        label: "🤖 Explain current code",
        section: "AI",
        icon: <Brain className="w-4 h-4" />,
        action: () => {
          // [CHANGED] Feature 1: Prepend persona
          const fullPrompt = `${aiPersona}\n\nExplain the following code:\n\`\`\`\n${code}\n\`\`\``;
          explainCode(fullPrompt); // Assuming explainCode passes the full prompt
        },
      },
      {
        id: "ai-summarize",
        label: "🧠 Summarize recent AI changes",
        section: "AI",
        icon: <Brain className="w-4 h-4" />, // Added icon
        action: () => summarizeChanges(), // Assuming this doesn't need persona directly
      },
      {
        id: "ai-generate",
        label: "⚙️ Generate improvement suggestion",
        section: "AI",
        icon: <Brain className="w-4 h-4" />, // Added icon
        action: () => {
          // [CHANGED] Feature 1: Prepend persona
          const userPrompt = `Suggest improvements for the following code:\n\`\`\`\n${code}\n\`\`\``;
          const fullPrompt = `${aiPersona}\n\n${userPrompt}`;
          generate(fullPrompt); // Assuming generate passes the full prompt
        },
      },
      // Code/Editor Commands
      {
        id: "code-clear",
        label: "🧹 Clear editor",
        section: "Code",
        action: () => setCode(""),
      },
      // Project Commands
      {
        id: "project-save",
        label: "💾 Save current project",
        section: "Project",
        action: saveProject,
      },
      // Asset Commands
      {
        id: "asset-sync",
        label: "🔄 Sync all assets",
        section: "Assets",
        action: syncAssets,
      },
      {
        id: "asset-refresh",
        label: "🗂 Refresh asset list",
        section: "Assets",
        action: refreshAssets,
      },
      {
        id: "asset-inject",
        label: "🎯 Inject selected asset into code",
        section: "Assets",
        action: () => {
          if (selectedAsset) {
            // [CHANGED] Feature 1: Prepend persona
            const userPrompt = `Insert the asset named '${selectedAsset.name}' (type: ${selectedAsset.type}) into the current code context.`;
            const fullPrompt = `${aiPersona}\n\n${userPrompt}\n\nCurrent Code:\n\`\`\`\n${code}\n\`\`\``;
            generate(fullPrompt); // Assuming generate passes the full prompt
          }
        },
      },
      ...runtimeSelectCommands,
    ];
  }, [
    availableRuntimes,
    selectRuntime,
    runCode,
    stopCode,
    code,
    setCode,
    explainCode,
    summarizeChanges,
    generate,
    saveProject,
    syncAssets,
    refreshAssets,
    selectedAsset,
    aiPersona, // [NEW] Feature 1: Added persona as dependency
  ]);

  /** --- keyboard listener --- **/
  const togglePalette = useCallback((e: KeyboardEvent) => {
    const mac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
    const meta = mac ? e.metaKey : e.ctrlKey;
    if (meta && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", togglePalette);
    return () => window.removeEventListener("keydown", togglePalette);
  }, [togglePalette]);

  /** --- search + navigation --- **/
  useEffect(() => {
    if (!open) {
       setQuery(""); // Clear query on close
       setHighlight(0); // Reset highlight
    }
    // Filter logic runs when query or commands change
    const q = query.toLowerCase();
    const results = query
      ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.section.toLowerCase().includes(q))
      : commands; // Show all if no query
    setFiltered(results);
    setHighlight(0); // Reset highlight on new filter results
  }, [query, commands, open]); // Added 'open' dependency

  const runCommand = async (cmd: Command) => {
    try {
      await cmd.action();
    } catch (err) {
       console.error(`Command ${cmd.id} failed:`, err)
    } finally {
      setOpen(false);
    }
  };

  /** --- keyboard nav within palette --- **/
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" && filtered.length > 0 && filtered[highlight]) {
      e.preventDefault(); // Prevent form submission if wrapped in form
      runCommand(filtered[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  /** --- UI --- **/
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cmd-palette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }} // Faster transition
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-start justify-center pt-20 md:pt-32" // Adjusted padding
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: -10 }} // Added slight Y offset
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: -10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }} // Slightly faster spring
            className="bg-panel w-[90vw] max-w-[36rem] rounded-lg shadow-2xl border border-border overflow-hidden" // Adjusted width/max-width
            onClick={(e) => e.stopPropagation()}
          >
            {/* search bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-text-muted" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type a command or search..."
                className="flex-1 bg-transparent outline-none text-sm text-text-main placeholder-text-muted"
              />
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-main p-1 -m-1 rounded">
                <X className="w-4 h-4"/>
              </button>
            </div>

            {/* command list */}
            <div className="max-h-[60vh] md:max-h-[24rem] overflow-y-auto">
              {filtered.map((cmd, i) => (
                <div
                  key={cmd.id}
                  onClick={() => runCommand(cmd)}
                  onMouseEnter={() => setHighlight(i)} // Highlight on hover
                  className={`flex justify-between items-center px-4 py-2 text-sm cursor-pointer border-b border-border last:border-b-0 ${
                    i === highlight
                      ? "bg-primary/10 text-primary" // Use theme color with opacity
                      : "hover:bg-bg" // Use theme background hover
                  }`}
                >
                  <span className="truncate flex items-center gap-2 text-text-main">
                    {cmd.icon && React.cloneElement(cmd.icon, { className: "w-4 h-4 text-text-muted" })}
                    <span className={i === highlight ? "text-primary" : ""}>{cmd.label}</span>
                  </span>
                  <span className="ml-2 text-[10px] text-text-muted uppercase tracking-wider">
                      {cmd.section}
                  </span>
                  {/* Removed checkmark for cleaner look, highlight is enough */}
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-text-muted text-center px-4 py-4">No results found.</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;