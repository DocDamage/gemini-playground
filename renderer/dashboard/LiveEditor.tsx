/**
 * renderer/dashboard/LiveEditor.tsx
 *
 * Interactive code + preview environment.
 * Features:
 * - Smooth code-to-preview transitions
 * - Animated asset injection overlays
 * - Ripple & glow feedback
 * - Optional sound feedback w/ volume control
 * - Theme-aware motion + haptic feel
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useCode } from "../context/CodeContext";
import { useAI } from "../context/AIContext";
import { useAssets } from "../context/AssetsContext";
import { useSettings } from "../context/SettingsContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlayCircle,
  Save,
  FileCode2,
  Loader2,
  Volume2,
  VolumeX,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const LiveEditor: React.FC = () => {
  const { code, updateCode, language, setLanguage, compiledHTML } = useCode();
  const { onEvent } = useAI();
  const { selectedAsset } = useAssets();
  const { soundEnabled, soundVolume } = useSettings();

  const [previewVisible, setPreviewVisible] = useState(true);
  const [iframeKey, setIframeKey] = useState(() => Date.now());
  const [isCompiling, setIsCompiling] = useState(false);
  const [showRipple, setShowRipple] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [overlaySnippets, setOverlaySnippets] = useState<
    { id: number; snippet: string; time: number }[]
  >([]);

  /** Load sounds once */
  const soundPop = useRef<HTMLAudioElement | null>(null);
  const soundWoosh = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    try {
      soundPop.current = new Audio("/sounds/pop.mp3");
      soundWoosh.current = new Audio("/sounds/woosh.mp3");
    } catch {
      // silent fail if missing
    }
  }, []);

  /** Safe play helper */
  const playSound = useCallback(
    (audioRef: React.MutableRefObject<HTMLAudioElement | null>) => {
      if (!soundEnabled || !audioRef.current) return;
      const el = audioRef.current;
      el.volume = soundVolume;
      el.currentTime = 0;
      el.play().catch(() => null);
    },
    [soundEnabled, soundVolume]
  );

  /** Listen for asset preview injections */
  useEffect(() => {
    const handler = (payload: any) => {
      if (!payload?.snippet) return;

      setOverlaySnippets((prev) => [
        ...prev,
        { id: Date.now(), snippet: payload.snippet, time: 10 },
      ]);
      playSound(soundPop);
    };

    onEvent("asset-injected", handler);
  }, [onEvent, playSound]);

  /** Countdown + cleanup overlays */
  useEffect(() => {
    const timer = setInterval(() => {
      setOverlaySnippets((prev) =>
        prev
          .map((s) => ({ ...s, time: s.time - 1 }))
          .filter((s) => s.time > 0)
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  /** Recompile animation */
  const handleCompile = () => {
    setIsCompiling(true);
    setShowRipple(true);
    playSound(soundWoosh);

    setTimeout(() => {
      setIframeKey(Date.now());
      setIsCompiling(false);
    }, 400);

    setTimeout(() => setShowRipple(false), 800);
  };

  /** Manual asset insert into code */
  const handleInsertAsset = () => {
    if (!selectedAsset) return;
    const ext = selectedAsset.type.toLowerCase();
    let snippet = "";

    if (ext.match(/png|jpg|jpeg|webp|gif|svg/)) {
      snippet = `<img src="${selectedAsset.path}" alt="${selectedAsset.name}" />`;
    } else if (ext.match(/mp3|wav|ogg|m4a|flac/)) {
      snippet = `<audio controls src="${selectedAsset.path}"></audio>`;
    } else if (ext.match(/mp4|mov|webm/)) {
      snippet = `<video controls src="${selectedAsset.path}"></video>`;
    } else {
      snippet = `<!-- Unsupported asset: ${selectedAsset.name} -->`;
    }

    updateCode(snippet, "append");
    playSound(soundPop);
  };

  /** Fade preview on HTML change */
  useEffect(() => {
    const timeout = setTimeout(() => setIframeKey(Date.now()), 400);
    return () => clearTimeout(timeout);
  }, [compiledHTML]);

  return (
    <div className="w-full h-full grid grid-cols-2 border-t border-gray-200 dark:border-slate-800 relative">
      {/* Ripple feedback when compiling */}
      <AnimatePresence>
        {showRipple && (
          <motion.div
            key="ripple"
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0.3, scale: 0.9 }}
            animate={{ opacity: 0, scale: 2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(circle at center, rgba(59,130,246,0.2) 0%, transparent 70%)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Editor panel */}
      <div className="relative flex flex-col bg-gray-50 dark:bg-slate-900">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-slate-700">
          <div className="flex gap-2 items-center">
            <FileCode2 className="w-4 h-4 text-blue-500" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              className="bg-transparent text-xs border border-gray-200 dark:border-slate-700 rounded p-1"
            >
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="javascript">JavaScript</option>
            </select>
          </div>

          <div className="flex gap-2 items-center">
            <Button size="sm" onClick={handleCompile}>
              {isCompiling ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1 }}
                >
                  <Loader2 className="w-3 h-3" />
                </motion.div>
              ) : (
                <PlayCircle className="w-3 h-3 mr-1" />
              )}
              Run
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleInsertAsset}
              disabled={!selectedAsset}
            >
              <Save className="w-3 h-3 mr-1" />
              Insert Asset
            </Button>

            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-blue-500" />
            ) : (
              <VolumeX className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </div>

        {/* Code Editor */}
        <div className="flex-1 overflow-hidden relative">
          <Editor
            height="100%"
            language={language}
            theme="vs-dark"
            value={code[language]}
            onChange={(val) => updateCode(val || "", "replace")}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
          {/* Glow pulse when code updated */}
          <AnimatePresence>
            {isCompiling && (
              <motion.div
                key="glow"
                initial={{ opacity: 0.15 }}
                animate={{ opacity: [0.15, 0.4, 0.15] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 bg-blue-500/10 pointer-events-none"
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Preview panel */}
      <div className="relative bg-white dark:bg-slate-950 border-l border-gray-200 dark:border-slate-800 overflow-hidden">
        <div className="absolute top-2 right-2 z-10 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPreviewVisible((v) => !v)}
          >
            {previewVisible ? "Hide" : "Show"} Preview
          </Button>
        </div>

        <AnimatePresence>
          {previewVisible && (
            <motion.div
              key={iframeKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="w-full h-full relative"
            >
              <iframe
                ref={iframeRef}
                title="Live Preview"
                srcDoc={compiledHTML}
                sandbox="allow-scripts allow-same-origin allow-popups"
                className="w-full h-full"
              />

              {/* Floating injected assets */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {overlaySnippets.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.8, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ type: "spring", stiffness: 200, damping: 18 }}
                    className="absolute top-4 left-4 bg-white/90 dark:bg-slate-900/90 border border-blue-300 rounded-xl p-3 shadow-lg backdrop-blur-sm"
                    dangerouslySetInnerHTML={{ __html: item.snippet }}
                  />
                ))}

                {/* Countdown badges */}
                {overlaySnippets.map((item, idx) => (
                  <motion.div
                    key={`timer-${item.id}`}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ delay: idx * 0.1 }}
                    className="absolute top-2 right-2 text-[10px] bg-blue-500 text-white rounded-full px-2 py-[1px] font-semibold shadow"
                  >
                    Preview {item.time}s
                  </motion.div>
                ))}
              </div>

              {/* Visual shimmer when new render completes */}
              <motion.div
                key={`shimmer-${iframeKey}`}
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
                className="absolute top-0 left-0 w-[120%] h-[2px] bg-gradient-to-r from-transparent via-blue-400/60 to-transparent"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LiveEditor;
