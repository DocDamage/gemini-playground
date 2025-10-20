/**
 * renderer/dashboard/DiffViewer.tsx
 *
 * Displays a line-by-line diff of the last AI-generated code change.
 * Pulls from AIContext (lastDiff) for context.
 */

import React, { useState, useEffect } from "react";
import { useAI } from "../context/AIContext";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Code, X } from "lucide-react";

const DiffViewer: React.FC = () => {
  const { lastDiff, lastPrompt } = useAI();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (lastDiff && lastDiff.length > 0) {
      setVisible(true);
    }
  }, [lastDiff]);

  if (!lastDiff || lastDiff.length === 0) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-4 left-4 w-[32rem] max-h-[50vh] overflow-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold">AI Code Changes</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setVisible(false)}
            >
              <X className="w-4 h-4 text-gray-400" />
            </Button>
          </div>

          {lastPrompt && (
            <p className="text-xs text-gray-500 mb-3 truncate">
              Prompt: <em>{lastPrompt}</em>
            </p>
          )}

          <div className="font-mono text-xs space-y-1">
            {lastDiff.map((line) => (
              <div key={line.line} className="flex gap-2">
                <span className="text-gray-400 w-8 text-right">
                  {line.line}
                </span>
                {line.before !== "" && line.after !== "" && (
                  <div className="flex-1">
                    <div className="text-red-500 line-through">
                      {line.before}
                    </div>
                    <div className="text-green-600">{line.after}</div>
                  </div>
                )}
                {line.before === "" && (
                  <div className="flex-1 text-green-600">{line.after}</div>
                )}
                {line.after === "" && (
                  <div className="flex-1 text-red-500 line-through">
                    {line.before}
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DiffViewer;
