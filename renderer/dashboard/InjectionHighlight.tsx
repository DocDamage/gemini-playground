/**
 * renderer/dashboard/InjectionHighlight.tsx
 *
 * Displays a brief visual highlight overlay in the live preview area
 * whenever AI injects a new asset or snippet into the code.
 */

import React, { useEffect, useState } from "react";
import { useAI } from "../context/AIContext";
import { motion, AnimatePresence } from "framer-motion";

/**
 * A transient overlay that flashes a border around the live preview
 * whenever an AI edit or injection occurs.
 */
const InjectionHighlight: React.FC = () => {
  const { lastDiff, loading } = useAI();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!loading && lastDiff && lastDiff.length > 0) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [lastDiff, loading]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="ai-injection-highlight"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.05, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            className="absolute inset-0 border-[3px] border-blue-400 dark:border-blue-600 rounded-lg shadow-lg"
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-blue-400/10 dark:bg-blue-500/10 rounded-lg"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InjectionHighlight;
