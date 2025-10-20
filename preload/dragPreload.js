/**
 * preload/dragPreload.js
 *
 * Runs in Electron's preload context.
 * Intercepts drag/drop events for image or SVG files and forwards them
 * to the main process via IPC. Only accepts visual/media assets.
 */

const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TEMP_PATH = path.join(os.homedir(), ".gemini_temp_assets");

if (!fs.existsSync(TEMP_PATH)) {
  fs.mkdirSync(TEMP_PATH, { recursive: true });
}

contextBridge.exposeInMainWorld("electronAPI", {
  sendAssetDrop: (payload) => ipcRenderer.send("asset-drop", payload),
  onAssetReceived: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("asset-received", listener);
    return () => ipcRenderer.removeListener("asset-received", listener);
  },
  tempPath: TEMP_PATH,
  writeFile: (filePath, data) => fs.writeFileSync(filePath, data),
});

// Handle drag/drop events on the document
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", async (e) => {
  e.preventDefault();

  const files = e.dataTransfer.files;
  const items = e.dataTransfer.items;

  // --- Handle local file drops ---
  if (files.length > 0) {
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      // Only accept image asset types
      if (!["png", "jpg", "jpeg", "svg", "gif", "webp"].includes(ext)) continue;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      window.electronAPI.sendAssetDrop({
        type: "file",
        name: file.name,
        data: buffer,
      });
    }
    return;
  }

  // --- Handle URL drops (images only) ---
  for (const item of items) {
    const url = item.getAsString
      ? await new Promise((resolve) => item.getAsString(resolve))
      : null;
    if (url && /\.(png|jpg|jpeg|svg|gif|webp)$/.test(url)) {
      window.electronAPI.sendAssetDrop({
        type: "url",
        url,
      });
    }
  }
});
