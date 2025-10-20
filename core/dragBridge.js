/**
 * core/dragBridge.js
 *
 * Electron bridge for drag-and-drop assets from system or web into Gemini Playground.
 * Handles asset file drops and forwards them to the renderer safely via IPC.
 */

import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import os from "os";

const TEMP_ASSET_PATH = path.join(os.homedir(), ".gemini_temp_assets");

// Ensure temp dir exists
if (!fs.existsSync(TEMP_ASSET_PATH)) {
  fs.mkdirSync(TEMP_ASSET_PATH, { recursive: true });
}

/**
 * Initializes drag-drop IPC bridge.
 * @param {BrowserWindow} win - Electron browser window instance.
 */
export function setupDragBridge(win) {
  ipcMain.on("asset-drop", async (_event, payload) => {
    try {
      if (payload.type === "file") {
        const { name, data } = payload;
        const filePath = path.join(TEMP_ASSET_PATH, name);
        fs.writeFileSync(filePath, Buffer.from(data));
        win.webContents.send("asset-received", {
          type: "file",
          path: filePath,
          name,
        });
      } else if (payload.type === "url") {
        const url = payload.url;
        const fileName = `imported-${Date.now()}.url`;
        const filePath = path.join(TEMP_ASSET_PATH, fileName);
        fs.writeFileSync(filePath, url);
        win.webContents.send("asset-received", {
          type: "url",
          path: filePath,
          url,
        });
      }
    } catch (err) {
      console.error("[DragBridge] Failed to process asset drop:", err);
    }
  });

  console.log("[DragBridge] Ready to receive asset drops.");
}
