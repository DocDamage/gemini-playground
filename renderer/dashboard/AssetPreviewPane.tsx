/**
 * renderer/dashboard/AssetPreviewPane.tsx
 *
 * Displays preview and metadata for the currently selected asset.
 * Integrates with AssetsContext and provides actions to open or remove assets.
 */

import React from "react";
import { useAssets } from "../context/AssetsContext";
import { Button } from "@/components/ui/button";
import { ExternalLink, Trash2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const AssetPreviewPane: React.FC = () => {
  const { selectedAsset, removeAsset, refreshAssets } = useAssets();

  if (!selectedAsset) return null;

  const { id, name, type, source, path, preview, created } = selectedAsset;

  const handleOpen = () => {
    if (!path) return;
    if (window?.electronAPI) {
      window.electronAPI?.openExternal?.(`file://${path}`);
    } else {
      window.open(`file://${path}`, "_blank");
    }
  };

  const handleDelete = async () => {
    await removeAsset(id);
  };

  const handleRefresh = async () => {
    await refreshAssets();
  };

  return (
    <AnimatePresence>
      {selectedAsset && (
        <motion.div
          key={id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-4 right-4 w-96 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-xl rounded-2xl z-40 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold truncate">{name}</h3>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" onClick={handleRefresh}>
                <RefreshCw className="w-4 h-4 text-gray-500" />
              </Button>
              <Button size="icon" variant="ghost" onClick={handleOpen}>
                <ExternalLink className="w-4 h-4 text-gray-500" />
              </Button>
              <Button size="icon" variant="ghost" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          </div>

          {/* Asset preview */}
          <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-slate-800 mb-3">
            {preview ? (
              <img
                src={preview}
                alt={name}
                className="w-full h-56 object-contain bg-gray-50 dark:bg-slate-800"
              />
            ) : (
              <div className="flex items-center justify-center h-56 bg-gray-50 dark:bg-slate-800 text-gray-500 text-xs">
                No Preview
              </div>
            )}
          </div>

          {/* Asset metadata */}
          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <p>
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                Type:
              </span>{" "}
              {type.toUpperCase()}
            </p>
            {source && (
              <p>
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  Source:
                </span>{" "}
                {source}
              </p>
            )}
            {path && (
              <p className="truncate">
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  Path:
                </span>{" "}
                {path}
              </p>
            )}
            {created && (
              <p>
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  Added:
                </span>{" "}
                {new Date(created).toLocaleString()}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AssetPreviewPane;
