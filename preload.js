/**
 * preload.js
 *
 * Secure bridge between Electron (main) and the renderer.
 * Used to expose limited IPC access to React safely.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Allow renderer to call plugin commands
  runPluginCommand: (name, ...args) => ipcRenderer.invoke("plugin-command", name, ...args),

  // Send logs to main console (optional)
  log: (message) => ipcRenderer.send("renderer-log", message),

  // Listen for messages from main
  onMessage: (channel, callback) => {
    ipcRenderer.on(channel, (_, data) => callback(data));
  },
});
