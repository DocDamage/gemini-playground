/**
 * renderer/context/AssetsContext.tsx
 *
 * Manages all app assets: imported, synced, and browsed local files.
 * Adds support for local folder browsing + inline audio preview.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { Buffer } from "buffer";
import {
  listLocalAssets,
  addLocalAsset,
  deleteLocalAsset,
  listAssetSources,
  getAssetPreview,
  syncToFirebase,
  loadFromFirebase,
  syncToGitHub,
} from "../shims/assetsBridge";
import { useAuth } from "./AuthContext";

interface Asset {
  id: string;
  name: string;
  type: string;
  path?: string;
  source?: string;
  preview?: string | null;
  created?: number;
}

interface LocalFile {
  name: string;
  path: string;
  size: number;
  modified: number;
  type: string;
}

interface AssetsContextType {
  assets: Asset[];
  sources: { id: string; name: string; description: string }[];
  localFiles: LocalFile[];
  localFolderPath: string | null;
  loading: boolean;
  selectedAsset: Asset | null;
  selectAsset: (id: string | null) => void;
  importLocalAsset: (file: File | string) => Promise<void>;
  removeAsset: (id: string) => Promise<void>;
  refreshAssets: () => Promise<void>;
  syncAll: () => Promise<void>;
  pickLocalFolder: () => Promise<void>;
  refreshLocalFiles: () => Promise<void>;
}

const AssetsContext = createContext<AssetsContextType | undefined>(undefined);

export const AssetsProvider = ({ children }: { children: ReactNode }) => {
  const { user, backend } = useAuth();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [sources, setSources] = useState<AssetsContextType["sources"]>([]);
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [localFolderPath, setLocalFolderPath] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);

  /** Load all asset sources and local assets on mount. */
  useEffect(() => {
    refreshAssets();
    setSources(listAssetSources());
  }, []);

  /** Listen for dropped assets from Electron bridge. */
  useEffect(() => {
    if (!window.electronAPI?.onAssetReceived) return;

    const handler = async (data: any) => {
      try {
        if (data.type === "file" && data.path) {
          await addLocalAsset(data.path);
          await refreshAssets();
        }
      } catch (err) {
        console.error("[AssetsContext] Failed to import dropped asset:", err);
      }
    };

    const dispose = window.electronAPI.onAssetReceived(handler);
    return () => dispose && dispose();
  }, []);

  /** Refresh imported assets. */
  async function refreshAssets() {
    setLoading(true);
    try {
      const local = listLocalAssets().map((a) => ({
        ...a,
        preview: getAssetPreview(a.id),
      }));
      setAssets(local);
    } catch (err) {
      console.error("[AssetsContext] Failed to load assets:", err);
    } finally {
      setLoading(false);
    }
  }

  /** Import a local file (path string or File object). */
  async function importLocalAsset(input: File | string) {
    try {
      let filePath: string | null = null;
      if (typeof input === "string") {
        filePath = input;
      } else {
        const arrayBuffer = await input.arrayBuffer();
        const tempPath = `${window.electronAPI?.tempPath || "/tmp"}/${input.name}`;
        await window.electronAPI?.writeFile(tempPath, Buffer.from(arrayBuffer));
        filePath = tempPath;
      }

      if (filePath) {
        const meta = await addLocalAsset(filePath);
        setAssets((prev) => [
          ...prev,
          { ...meta, preview: getAssetPreview(meta.id) },
        ]);
      }
    } catch (err) {
      console.error("[AssetsContext] Import failed:", err);
    }
  }

  /** Remove an asset from local store. */
  async function removeAsset(id: string) {
    try {
      await deleteLocalAsset(id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
      if (selectedAsset?.id === id) setSelectedAsset(null);
    } catch (err) {
      console.error("[AssetsContext] Delete failed:", err);
    }
  }

  /** Sync assets to Firebase or GitHub. */
  async function syncAll() {
    try {
      if (backend === "firebase" && user?.uid) {
        await syncToFirebase(user.uid);
        await loadFromFirebase(user.uid);
      }
      if (backend === "github") {
        await syncToGitHub();
      }
      await refreshAssets();
    } catch (err) {
      console.error("[AssetsContext] Sync failed:", err);
    }
  }

  /** Select an imported asset. */
  const selectAsset = (id: string | null) => {
    if (!id) return setSelectedAsset(null);
    const asset = assets.find((a) => a.id === id) || null;
    setSelectedAsset(asset);
  };

  /** Pick a local folder from disk using fileBridge. */
  async function pickLocalFolder() {
    try {
      const folder = await window.fileBridge?.pickFolder();
      if (folder) {
        setLocalFolderPath(folder);
        localStorage.setItem("gemini_last_folder", folder);
        await refreshLocalFiles(folder);
      }
    } catch (err) {
      console.error("[AssetsContext] pickLocalFolder failed:", err);
    }
  }

  /** Read the folder again (refresh local files). */
  async function refreshLocalFiles(folder?: string) {
    try {
      const target = folder || localFolderPath || localStorage.getItem("gemini_last_folder");
      if (!target) return;
      const files = await window.fileBridge?.readDirectory(target);
      setLocalFiles(files || []);
    } catch (err) {
      console.error("[AssetsContext] refreshLocalFiles failed:", err);
    }
  }

  return (
    <AssetsContext.Provider
      value={{
        assets,
        sources,
        localFiles,
        localFolderPath,
        loading,
        selectedAsset,
        selectAsset,
        importLocalAsset,
        removeAsset,
        refreshAssets,
        syncAll,
        pickLocalFolder,
        refreshLocalFiles,
      }}
    >
      {children}
    </AssetsContext.Provider>
  );
};

/** Hook for accessing asset data anywhere. */
export const useAssets = (): AssetsContextType => {
  const ctx = useContext(AssetsContext);
  if (!ctx) throw new Error("useAssets must be used within AssetsProvider");
  return ctx;
};
