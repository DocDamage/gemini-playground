/**
 * renderer/dashboard/AudioPreview.tsx
 *
 * Lightweight reusable component for inline audio playback.
 * Handles local file URLs or imported asset URLs.
 */

import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2 } from "lucide-react";

interface AudioPreviewProps {
  src: string;
  name?: string;
  compact?: boolean;
}

const AudioPreview: React.FC<AudioPreviewProps> = ({
  src,
  name,
  compact = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  /** Setup event listeners for time updates. */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
    };
  }, []);

  /** Toggle play/pause. */
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => null);
      setIsPlaying(true);
    }
  };

  /** Format time nicely (mm:ss). */
  const fmt = (s: number) => {
    if (!s || Number.isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div
      className={`flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-700 p-2 ${
        compact ? "gap-2" : "gap-3"
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          className="p-1 rounded-full bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 text-blue-500" />
          ) : (
            <Play className="w-4 h-4 text-blue-500" />
          )}
        </button>
        <div className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[10rem]">
          {name || "audio file"}
        </div>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
        <Volume2 className="w-3 h-3" />
        <span>
          {fmt(currentTime)} / {fmt(duration)}
        </span>
      </div>
      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
};

export default AudioPreview;
