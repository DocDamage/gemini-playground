/**
 * renderer/dashboard/AIFeedbackPanel.tsx
 *
 * Floating feedback widget for AI suggestions.
 * Appears after a successful AI injection.
 */

import React, { useState, useEffect } from "react";
import { useAI } from "../context/AIContext";
import { motion, AnimatePresence } from "framer-motion";
import { ThumbsUp, ThumbsDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const AIFeedbackPanel: React.FC = () => {
  const { lastPrompt, lastDiff, provideFeedback, loading } = useAI();
  const [visible, setVisible] = useState(false);
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (lastDiff && lastDiff.length > 0 && !loading) {
      setVisible(true);
    }
  }, [lastDiff, loading]);

  const handleSubmit = () => {
    if (rating) {
      provideFeedback(rating, comment);
      setVisible(false);
      setComment("");
      setRating(null);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-4 right-4 w-72 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-lg rounded-2xl p-4 z-50"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">AI Feedback</h3>
            <button onClick={() => setVisible(false)}>
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3 truncate">
            Based on prompt: <em>{lastPrompt?.slice(0, 60) || "N/A"}</em>
          </p>
          <div className="flex items-center justify-center gap-4 mb-3">
            <ThumbsUp
              className={`w-5 h-5 cursor-pointer ${
                rating === "up"
                  ? "text-green-600"
                  : "text-gray-400 hover:text-green-500"
              }`}
              onClick={() => setRating("up")}
            />
            <ThumbsDown
              className={`w-5 h-5 cursor-pointer ${
                rating === "down"
                  ? "text-red-600"
                  : "text-gray-400 hover:text-red-500"
              }`}
              onClick={() => setRating("down")}
            />
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment..."
            className="w-full text-sm bg-transparent border border-gray-200 dark:border-slate-700 rounded-lg p-2 mb-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={2}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSubmit} disabled={!rating}>
              Submit
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIFeedbackPanel;
