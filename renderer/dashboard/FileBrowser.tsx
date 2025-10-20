/**
 * renderer/dashboard/FileBrowser.tsx
 *
 * Lightweight file browser panel for Gemini Playground.
 * Uses the Electron fileBridge preload API to pick a folder,
 * list directory contents, and drill into sub-directories.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type FileEntry = {
  name: string;
  isDirectory: boolean;
  path: string;
};

declare global {
  interface Window {
    fileBridge?: {
      pickFolder: () => Promise<string | null>;
      readDirectory: (dirPath: string) => Promise<{ name: string; isDirectory: boolean; path: string; }[]>;
      statFile: (filePath: string) => Promise<any>;
    };
  }
}

const FALLBACK_ROOT = "/";

const FileBrowser: React.FC = () => {
  const [currentPath, setCurrentPath] = useState(FALLBACK_ROOT);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBridge = useMemo(() => Boolean(window.fileBridge?.readDirectory), []);

  const loadDirectory = useCallback(
    async (pathToLoad: string) => {
      if (!hasBridge) return;
      setLoading(true);
      setError(null);
      try {
        const results = await window.fileBridge!.readDirectory(pathToLoad);
        const mapped: FileEntry[] = (results || []).map((entry) => ({
          name: entry.name,
          isDirectory: Boolean(entry.isDirectory),
          path: entry.path ?? `${pathToLoad}/${entry.name}`,
        }));
        setEntries(mapped.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name)));
        setCurrentPath(pathToLoad);
      } catch (err: any) {
        setError(err?.message ?? "Failed to read directory");
      } finally {
        setLoading(false);
      }
    },
    [hasBridge]
  );

  const handlePickFolder = useCallback(async () => {
    if (!hasBridge) return;
    const picked = await window.fileBridge!.pickFolder();
    if (picked) {
      loadDirectory(picked);
    }
  }, [hasBridge, loadDirectory]);

  const handleEnter = useCallback(
    (entry: FileEntry) => {
      if (!entry.isDirectory) return;
      loadDirectory(entry.path);
    },
    [loadDirectory]
  );

  const handleUp = useCallback(() => {
    if (currentPath === FALLBACK_ROOT) return;
    const parts = currentPath.replace(/\\/g, "/").split("/").filter(Boolean);
    parts.pop();
    const next = parts.length ? `/${parts.join("/")}` : FALLBACK_ROOT;
    loadDirectory(next);
  }, [currentPath, loadDirectory]);

  useEffect(() => {
    if (!hasBridge) return;
    loadDirectory(currentPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBridge]);

  if (!hasBridge) {
    return (
      <div className="p-4 h-full flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-200">File Browser</h2>
        <p className="text-sm text-gray-400">
          File access bridge is unavailable in this environment.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 gap-3 bg-panel text-text-main overflow-hidden">
      <header className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={handlePickFolder} disabled={loading}>
          Choose Folder
        </Button>
        <Button size="sm" variant="ghost" onClick={handleUp} disabled={loading || currentPath === FALLBACK_ROOT}>
          Up
        </Button>
        <span className="text-xs text-text-muted truncate flex-1">{currentPath}</span>
      </header>

      {error && (
        <div className="text-xs text-error bg-error/10 border border-error/40 rounded px-2 py-1">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto rounded border border-border bg-surface">
        {loading ? (
          <div className="p-4 text-sm text-text-muted">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-sm text-text-muted">Folder is empty.</div>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li
                key={entry.path}
                className="flex items-center justify-between px-3 py-2 hover:bg-surface-hover cursor-pointer text-sm"
                onClick={() => handleEnter(entry)}
              >
                <span className="font-medium text-text-main">{entry.name}</span>
                <span className="text-xs text-text-muted">
                  {entry.isDirectory ? "Folder" : "File"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default FileBrowser;
