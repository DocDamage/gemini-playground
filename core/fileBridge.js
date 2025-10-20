/**
 * core/fileBridge.js
 *
 * Main-process implementation for fileBridge preload.
 * Provides folder selection and safe directory reading through IPC.
 */

import { dialog, ipcMain } from "electron";
import fs from "fs";
import path from "path";

const ALLOWED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".flac",
  ".mp4",
  ".mov",
];

/**
 * Registers IPC handlers for safe file browsing.
 * Should be called once in main.js after app ready.
 */
export function setupFileBridge() {
  /**
   * Pick a local folder.
   */
  ipcMain.handle("fileBridge:pick-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result;
  });

  /**
   * Read directory contents, filter allowed types.
   */
  ipcMain.handle("fileBridge:read-directory", async (_event, dirPath) => {
    try {
      if (!dirPath || !fs.existsSync(dirPath)) return [];
      const entries = fs.readdirSync(dirPath);
      const files = entries
        .filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return ALLOWED_EXTENSIONS.includes(ext);
        })
        .map((file) => {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);
          return {
            name: file,
            path: filePath,
            size: stat.size,
            modified: stat.mtimeMs,
            type: path.extname(file).substring(1),
          };
        });
      return files;
    } catch (err) {
      console.error("[fileBridge] Failed to read directory:", err);
      return [];
    }
  });

  /**
   * Return metadata for a single file.
   */
  ipcMain.handle("fileBridge:stat-file", async (_event, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null;
      const stat = fs.statSync(filePath);
      return {
        path: filePath,
        size: stat.size,
        modified: stat.mtimeMs,
        type: path.extname(filePath).substring(1),
      };
    } catch (err) {
      console.error("[fileBridge] stat-file failed:", err);
      return null;
    }
  });
}
