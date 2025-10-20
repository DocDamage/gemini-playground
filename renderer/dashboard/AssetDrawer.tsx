/**
 * renderer/dashboard/AssetDrawer.tsx
 *
 * Slide-out pane for managing and browsing assets.
 * Now fully animated — behaves like a physical drawer with weight and depth.
 */

import React, { useState } from "react";
import { useAssets } from "../context/AssetsContext";
import {
  FolderOpen,
  Music2,
  Image as ImageIcon,
  RefreshCcw,
  Upload,
  HardDrive,
  Library,
  ArrowRightCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import AudioPreview from "./AudioPreview";

const AssetDrawer: React.FC = () => {
  const {
    assets,
    localFiles,
    localFolderPath,
    pickLocalFolder,
    refreshLocalFiles,
    importLocalAsset,
    selectAsset,
    selectedAsset,
    loading,
  } = useAssets();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"library" | "local">("library");

  const handleImport = async (filePath: string) => {
    await importLocalAsset(filePath);
  };

  const handlePreview = (filePath: string) => {
    if (!filePath) return;
    window.open(`file://${filePath}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* Dim backdrop when drawer open */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35, backdropFilter: "blur(2px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 bg-black/40 pointer-events-auto"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Drawer toggle */}
      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 pointer-events-auto">
        <motion.button
          onClick={() => setOpen((v) => !v)}
          className="bg-blue-500 hover:bg-blue-600 text-white rounded-l-lg p-2 shadow-md flex items-center justify-center"
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
        >
          <Library className="w-5 h-5" />
        </motion.button>
      </div>

      {/* Drawer body */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="asset-drawer"
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            transition={{
              type: "spring",
              stiffness: 180,
              damping: 22,
              mass: 0.8,
            }}
            className="absolute right-0 top-0 h-full w-[23rem] bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-700 shadow-2xl rounded-l-2xl overflow-hidden pointer-events-auto flex flex-col"
            style={{
              boxShadow:
                "rgba(0,0,0,0.25) -8px 0px 30px -5px, rgba(0,0,0,0.1) -4px 0px 12px -4px",
            }}
          >
            {/* Header */}
            <motion.div
              className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 p-3"
              initial={{ y: -15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center gap-2">
                <Library className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-semibold">Assets</h2>
              </div>

              <div className="relative">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setTab(tab === "library" ? "local" : "library")
                  }
                  className="relative flex items-center"
                >
                  {tab === "library" ? (
                    <>
                      <HardDrive className="w-4 h-4 mr-1" /> Local
                    </>
                  ) : (
                    <>
                      <Library className="w-4 h-4 mr-1" /> Library
                    </>
                  )}
                  <motion.span
                    layoutId="tab-underline"
                    className="absolute -bottom-[1px] left-0 h-[2px] bg-blue-500 w-full"
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  />
                </Button>
              </div>
            </motion.div>

            {/* Drawer content */}
            <motion.div
              className="flex-1 overflow-y-auto p-3 space-y-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              {loading && (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Loading...
                </div>
              )}

              {!loading && tab === "library" && (
                <div>
                  {assets.length === 0 && (
                    <p className="text-xs text-gray-500">
                      No imported assets yet.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {assets.map((asset) => (
                      <motion.div
                        key={asset.id}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => selectAsset(asset.id)}
                        className={`border rounded-lg overflow-hidden cursor-pointer relative transition-all ${
                          selectedAsset?.id === asset.id
                            ? "border-blue-500 ring-1 ring-blue-300 shadow-md"
                            : "border-gray-200 dark:border-slate-700"
                        }`}
                      >
                        {asset.type.startsWith("image") ? (
                          <motion.img
                            src={asset.preview || asset.path}
                            alt={asset.name}
                            className="w-full h-24 object-cover"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                          />
                        ) : asset.type.startsWith("audio") ? (
                          <AudioPreview
                            src={asset.path || ""}
                            name={asset.name}
                            compact
                          />
                        ) : (
                          <div className="flex items-center justify-center h-24 text-gray-400">
                            <FileTypeIcon type={asset.type} />
                          </div>
                        )}
                        <div className="p-2 text-[10px] truncate text-center">
                          {asset.name}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {!loading && tab === "local" && (
                <motion.div
                  key="local-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-blue-500" />
                      <h3 className="text-sm font-medium truncate max-w-[10rem]">
                        {localFolderPath
                          ? localFolderPath.split(/[\\/]/).pop()
                          : "No folder selected"}
                      </h3>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={pickLocalFolder}
                        whileTap={{ scale: 0.95 }}
                      >
                        Choose
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!localFolderPath}
                        onClick={() => refreshLocalFiles()}
                        whileTap={{ scale: 0.95 }}
                      >
                        <RefreshCcw className="w-3 h-3 mr-1" /> Refresh
                      </Button>
                    </div>
                  </div>

                  {localFiles.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      {localFolderPath
                        ? "No compatible files in this folder."
                        : "Select a folder to view local files."}
                    </p>
                  ) : (
                    <motion.div
                      layout
                      className="space-y-3"
                      transition={{ layout: { duration: 0.2 } }}
                    >
                      {localFiles.map((file) => (
                        <motion.div
                          key={file.path}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.2 }}
                          className="border border-gray-200 dark:border-slate-700 rounded-lg p-2 hover:shadow-md hover:border-blue-400 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 truncate">
                              <FileTypeIcon type={file.type} />
                              <span className="text-xs truncate max-w-[10rem]">
                                {file.name}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <MotionButton
                                icon={<ArrowRightCircle className="w-3 h-3" />}
                                onClick={() => handlePreview(file.path)}
                              />
                              <MotionButton
                                icon={<Upload className="w-3 h-3" />}
                                color="blue"
                                onClick={() => handleImport(file.path)}
                              />
                            </div>
                          </div>

                          {file.type.match(/mp3|wav|ogg|m4a|flac/) && (
                            <div className="mt-2">
                              <AudioPreview
                                src={`file://${file.path}`}
                                name={file.name}
                                compact
                              />
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** Icon component for file type preview */
function FileTypeIcon({ type }: { type: string }) {
  if (type.match(/png|jpg|jpeg|webp|gif|svg/))
    return <ImageIcon className="w-4 h-4 text-blue-400" />;
  if (type.match(/mp3|wav|ogg|m4a|flac/))
    return <Music2 className="w-4 h-4 text-pink-400" />;
  return <HardDrive className="w-4 h-4 text-gray-400" />;
}

/** Small motion wrapper for icon buttons */
const MotionButton = ({
  icon,
  onClick,
  color,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  color?: "blue" | "gray";
}) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.1 }}
    whileTap={{ scale: 0.9 }}
    className={`p-1 rounded-md border border-transparent hover:border-${
      color === "blue" ? "blue-400" : "gray-300"
    }`}
  >
    {icon}
  </motion.button>
);

export default AssetDrawer;
