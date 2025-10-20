/**
 * renderer/dashboard/AITaskHistoryTray.tsx
 *
 * Collapsible tray showing recent AI actions, prompts, and diff summaries.
 * Syncs with AIContext for real-time updates.
 */

import React, { useState, useEffect } from "react";
import { useAI } from "../context/AIContext";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Clock, ChevronUp, ChevronDown, Brain } from "lucide-react";

interface HistoryEntry {
  id: string;
  prompt: string;
  diffCount: number;
  timestamp: number;
  feedback?: "up" | "down" | null;
}

const AITaskHistoryTray: React.FC = () => {
  const { lastPrompt, lastDiff, feedbackHistory } = useAI();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Track changes from AI context
  useEffect(() => {
    if (lastPrompt && lastDiff) {
      setHistory((prev) => [
        {
          id: crypto.randomUUID(),
          prompt: lastPrompt,
          diffCount: lastDiff.length,
          timestamp: Date.now(),
          feedback: null,
        },
        ...prev.slice(0, 49), // keep last 50 entries
      ]);
    }
  }, [lastPrompt, lastDiff]);

  // Merge feedback updates (if any)
  useEffect(() => {
    if (feedbackHistory && feedbackHistory.length > 0) {
      setHistory((prev) =>
        prev.map((entry) => {
          const match = feedbackHistory.find((f) => f.prompt === entry.prompt);
          return match ? { ...entry, feedback: match.rating } : entry;
        })
      );
    }
  }, [feedbackHistory]);

  const toggleOpen = () => setOpen((v) => !v);

  return (
    <div className="fixed bottom-0 left-0 w-full flex flex-col items-center z-40">
      {/* Handle Button */}
      <div className="mb-1">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleOpen}
          className="flex items-center gap-2 shadow-sm"
        >
          <Clock className="w-4 h-4" />
          <span className="text-xs">AI History</span>
          {open ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronUp className="w-3 h-3" />
          )}
        </Button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="ai-history-tray"
            initial={{ y: 150, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 150, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            className="w-[40rem] max-h-[50vh] overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-t-2xl shadow-xl p-4"
          >
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-500" /> AI Task History
            </h3>

            {history.length === 0 ? (
              <p className="text-xs text-gray-500">No tasks yet.</p>
            ) : (
              <ul className="space-y-3">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="border border-gray-100 dark:border-slate-800 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                  >
                    <p className="text-xs text-gray-700 dark:text-gray-300 truncate mb-1">
                      {entry.prompt}
                    </p>
                    <div className="flex justify-between items-center text-[10px] text-gray-500 dark:text-gray-400">
                      <span>
                        {new Date(entry.timestamp).toLocaleTimeString()} •{" "}
                        {entry.diffCount} changes
                      </span>
                      {entry.feedback === "up" && (
                        <span className="text-green-500 font-semibold">👍</span>
                      )}
                      {entry.feedback === "down" && (
                        <span className="text-red-500 font-semibold">👎</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AITaskHistoryTray;
