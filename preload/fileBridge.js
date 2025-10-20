/**
 * preload/fileBridge.js
 *
 * Secure preload bridge exposing limited file-system browsing to the renderer.
 *
 * BATCH 5 MODIFICATION:
 * - [CORRECTION] Added 'voiceStart' and 'voiceStop' senders
 * (Renderer -> Main) for the UI to initiate commands.
 * - Renamed listeners for clarity (e.g., 'onVoiceStartRecognition').
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fileBridge", {
  // ... (all existing functions from Batch 1: pickFolder, readDirectory, archiveList, webFetch, runtimeRun, etc.) ...
  
  /** Opens a system folder picker and returns the selected path. */
  pickFolder: async () => {
    const result = await ipcRenderer.invoke("fileBridge:pick-folder");
    return result?.filePaths?.[0] || null;
  },

  /** Reads directory contents and returns a list of file entries. */
  readDirectory: async (dirPath) => {
    if (!dirPath) return [];
    const result = await ipcRenderer.invoke("fileBridge:read-directory", dirPath);
    return result || [];
  },

  /** Fetch metadata for a single file (size, modified, type). */
  statFile: async (filePath) => {
    if (!filePath) return null;
    return await ipcRenderer.invoke("fileBridge:stat-file", filePath);
  },

  /** Quick check to ensure the bridge is available. */
  ping: () => true,

  // ---------------------------------------------------
  // Batch 1: Archive Functions
  // ---------------------------------------------------
  archiveList: () => ipcRenderer.invoke("archive:list"),
  archiveCreate: (projectPath) => ipcRenderer.invoke("archive:create", projectPath),
  archiveExtract: (zipName, targetPath) => ipcRenderer.invoke("archive:extract", zipName, targetPath),

  // ---------------------------------------------------
  // Batch 1: Web Fetch Function
  // ---------------------------------------------------
  webFetch: (url, options, fetchConfig) => ipcRenderer.invoke("web:fetch", { url, options, fetchConfig }),

  // ---------------------------------------------------
  // Batch 1: Runtime Functions
  // ---------------------------------------------------
  runtimeRun: (lang, code, taskId) => ipcRenderer.send("runtime:run", { lang, code, taskId }),
  runtimeKill: (taskId) => ipcRenderer.send("runtime:kill", taskId),

  // ---------------------------------------------------
  // [NEW & CORRECTED] Batch 5: Voice Senders (Renderer -> Main)
  // ---------------------------------------------------

  /** [NEW] Tells the main process to start a voice session. */
  voiceStart: () => ipcRenderer.send('voice:start'),

  /** [NEW] Tells the main process to stop the voice session. */
  voiceStop: () => ipcRenderer.send('voice:stop'),
  
  /** Sends transcribed voice text to the main process. */
  voiceSendResult: (transcript) => ipcRenderer.send('voice:result', transcript),
  
  /** Sends a speech recognition error to the main process. */
  voiceSendError: (errorMsg) => ipcRenderer.send('voice:error', errorMsg),

  // ---------------------------------------------------
  // [NEW & CORRECTED] Batch 5: Voice Listeners (Main -> Renderer)
  // ---------------------------------------------------

  /**
   * Subscribes to the 'start recognition' event from the main process.
   * [RENAMED] for clarity.
   */
  onVoiceStartRecognition: (callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('voice:start-recognition', listener);
    return () => ipcRenderer.removeListener('voice:start-recognition', listener);
  },

  /**
   * Subscribes to the 'stop recognition' event from the main process.
   * [RENAMED] for clarity.
   */
  onVoiceStopRecognition: (callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('voice:stop-recognition', listener);
    return () => ipcRenderer.removeListener('voice:stop-recognition', listener);
  },
  
  /**
   * [NEW] Listens for the final transcript confirmed by the main process.
   */
  onVoiceFinalTranscript: (callback) => {
    const listener = (event, ...args) => callback(...args);
   ipcRenderer.on('voice:final-transcript', listener);
   return () => ipcRenderer.removeListener('voice:final-transcript', listener);
 }
});

// Ensure other preload bridges register alongside fileBridge.
require("./runtimeBridge.js");
require("./aiBridge.js");
require("./dragPreload.js");
require("./pluginBridge.js");
