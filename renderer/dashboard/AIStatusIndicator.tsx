/**
 * renderer/dashboard/AIStatusIndicator.tsx
 *
 * Subtle footer indicator showing current AI system state.
 * Pulses while AI is processing; steady when idle.
 */

import React, { useEffect, useState } from "react";
import { useAI } from "../context/AIContext";
import { motion } from "framer-motion";
import { Brain, Zap } from "lucide-react";

const AIStatusIndicator: React.FC = () => {
  const { loading, lastPrompt } = useAI();
  const [visible, setVisible] = useState(false);
  const [recentPrompt, setRecentPrompt] = useState<string | null>(null);

  useEffect(() => {
    if (loading) {
      setVisible(true);
    } else if (lastPrompt) {
      setRecentPrompt(lastPrompt);
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, lastPrompt]);

  const pulseVariants = {
    idle: { scale: 1, opacity: 0.5 },
    active: {
      scale: [1, 1.2, 1],
      opacity: [0.5, 1, 0.5],
      transition: { duration: 1.5, repeat: Infinity },
    },
  };

  return (
    <motion.div
      className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0.5 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className={`w-3 h-3 rounded-full ${
          loading ? "bg-blue-500" : "bg-green-500"
        }`}
        variants={pulseVariants}
        animate={loading ? "active" : "idle"}
      />
      {loading ? (
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3 text-blue-500" />
          <span>AI Thinking...</span>
        </div>
      ) : recentPrompt ? (
        <div className="flex items-center gap-1">
          <Brain className="w-3 h-3 text-green-500" />
          <span>AI Ready</span>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Brain className="w-3 h-3 text-gray-500" />
          <span>Idle</span>
        </div>
      )}
    </motion.div>
  );
};

export default AIStatusIndicator;
