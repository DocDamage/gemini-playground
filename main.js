/**
 * main.js
 *
 * Main entry point for the Gemini Playground Electron application.
 * Handles window creation, app lifecycle, preload setup, and drag/drop bridge.
 *
 * FEATURE 2 (Ollama): Registered Ollama provider. Fixed preload path.
 * FEATURE 5 (Project Context) - Phase 2: Added codeIndex IPC handler.
 */

import { app, BrowserWindow, shell, ipcMain, dialog } from "electron";
import fs from "fs";
import path from "path";
import url from "url";
import { fileURLToPath } from "url"; // Added for __dirname alternative
import { setupDragBridge } from "./core/dragBridge.js";

// --- Feature 2 Imports ---
import * as aiService from './core/aiService.js';
import ollamaProviderGenerate from './core/ai/ollamaProvider.js';
// --- End Imports ---

// --- Imports for bridge handlers ---
import * as archive from './core/archive.js';
import { fetchURL } from './core/webFetch.js';
import * as runtimeManager from './core/runtimeManager.js';
import * as sandbox from './core/sandbox.js';
import * as voice from './core/voice.js'; // Batch 5
import codeIndex from './core/codeIndex.js'; // [NEW] Feature 5, Phase 2
import {
  discover as discoverPlugins,
  loadPlugins as loadAllPlugins,
  reloadAll as reloadPlugins,
  installFromURL as installPluginFromURL,
  removePlugin as removePluginByName,
  getHistory as getPluginHistory,
  restoreVersion as restorePluginVersion,
  pluginEvents,
} from "./core/pluginManager.js";
import { startPluginServer } from "./server/pluginServer.js";
// --- End Bridge Imports ---

// --- Setup __dirname ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// --- End Setup ---


let mainWindow;

// Flag for development mode
const isDev = !app.isPackaged;
let pluginServerStarted = false;

/**
 * Create the main application window.
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    backgroundColor: "#1e1e1e", // Consider theme var later
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Be cautious with this setting
      // [CRITICAL FIX] Updated preload to fileBridge which contains all bridges
      preload: path.join(__dirname, "preload/fileBridge.js"),
    },
    title: "Gemini Playground",
  });

  // Load the Vite dev server during development, or built files in production
  const startUrl = isDev
    ? "http://localhost:5173" // Vite dev server URL
    : url.format({
        pathname: path.join(__dirname, "../renderer/dist/index.html"), // Correct path to renderer build output
        protocol: "file:",
        slashes: true,
      });
  mainWindow.loadURL(startUrl);


  // Open dev tools automatically in dev mode
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // External links open in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
     if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url);
     }
    return { action: "deny" };
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Pass mainWindow to modules that need it
  runtimeManager.setMainWindow(mainWindow);
  voice.setMainWindow(mainWindow); // Batch 5

  return mainWindow;
}

/**
 * Broadcast helper to renderer when plugin events fire.
 */
function emitPluginEvent(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send(channel, payload);
  } catch (err) {
    console.error(`[Main Process] Failed to emit plugin event "${channel}":`, err);
  }
}

// Forward core plugin events to renderer-friendly channels
pluginEvents.on("installed", (payload) => {
  const name = payload?.name || payload?.id || payload?.pluginId;
  emitPluginEvent("plugin-activated", name);
});
pluginEvents.on("removed", (name) => {
  emitPluginEvent("plugin-deactivated", name);
});
pluginEvents.on("restored", (name) => {
  emitPluginEvent("plugin-reloaded", name);
});
pluginEvents.on("loaded", () => {
  emitPluginEvent("plugin-reloaded", null);
});
pluginEvents.on("changed", () => {
  emitPluginEvent("plugin-reloaded", null);
});
pluginEvents.on("error", (error) => {
  emitPluginEvent("plugin-error", error);
});

async function ensurePluginServer() {
  if (pluginServerStarted) return;
  try {
    await startPluginServer();
    pluginServerStarted = true;
    console.log("[Main Process] Plugin server started.");
  } catch (err) {
    console.error("[Main Process] Failed to start plugin server:", err);
  }
}

async function bootstrapPlugins() {
  await ensurePluginServer();
  try {
    await loadAllPlugins();
    console.log("[Main Process] Plugins loaded.");
  } catch (err) {
    console.error("[Main Process] Failed to load plugins:", err);
  }
}

/**
 * Setup IPC Handlers for bridges.
 */
function setupIpcHandlers() {
  // File Bridge Handlers (Originals from your preload)
    ipcMain.handle('fileBridge:pick-folder', async () => {
    const browserWindow = mainWindow ?? BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(browserWindow ?? undefined, {
      properties: ['openDirectory']
    });
    return result;
  });
  ipcMain.handle('fileBridge:read-directory', async (_event, dirPath) => {
    if (!dirPath) return [];
    void _event;
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path.join(dirPath, entry.name),
      }));
    } catch (err) {
      console.error("[Main Process] read-directory failed:", err);
      return [];
    }
  });

  ipcMain.handle('fileBridge:stat-file', async (_event, filePath) => {
    void _event;
    if (!filePath) return null;
    try {
      const stats = await fs.promises.stat(filePath);
      return {
        path: filePath,
        size: stats.size,
        modified: stats.mtimeMs,
        isDirectory: stats.isDirectory(),
      };
    } catch (err) {
      console.error("[Main Process] stat-file failed:", err);
      return null;
    }
  });

  // Archive Bridge Handlers (Batch 1)
  ipcMain.handle('archive:list', () => archive.listArchives());
  ipcMain.handle('archive:create', (event, projectPath) => archive.createArchive(projectPath));
  ipcMain.handle('archive:extract', (event, zipName, targetPath) => archive.extractArchive(zipName, targetPath));

  // Web Fetch Bridge Handler (Batch 1 / Batch 4)
  ipcMain.handle('web:fetch', (event, { url, options, fetchConfig }) => fetchURL(url, options, fetchConfig));

  // Runtime Bridge Handlers (Batch 1)
  // Note: runtimeManager sends events back, doesn't use handle
  ipcMain.on('runtime:run', (_event, { lang, code, taskId }) => runtimeManager.run(code, { lang, taskId }));
  ipcMain.on('runtime:kill', (_event, taskId) => sandbox.kill(taskId));

  // AI Bridge Handler (Feature 1 / Correction)
  ipcMain.handle('ai:generate', (event, { prompt, options }) => aiService.generate(prompt, options));

  // Voice Bridge Handlers (Batch 5 / Correction)
  voice.initializeVoiceService(); // Sets up listeners like 'voice:result'
  // Handlers for voice:start and voice:stop are inside initializeVoiceService now.

  // [NEW] Feature 5, Phase 2: Code Index Handler
  ipcMain.handle('codeIndex:getFileData', async (event, { projectPath, relativeFilePath }) => {
    try {
      // Use process.cwd() as a fallback if projectPath isn't provided by renderer
      const resolvedProjectPath = projectPath || process.cwd();
      const data = await codeIndex.getFileIndexData(resolvedProjectPath, relativeFilePath);
      return data; // Returns the index data object or null
    } catch (err) {
      console.error(`[IPC Handler] Error getting file index data for ${relativeFilePath}:`, err);
      return null; // Return null on error to the renderer
    }
  });

  // Plugin Bridge Handlers
  ipcMain.handle('plugin:list', async () => {
    return discoverPlugins();
  });

  ipcMain.handle('plugin:reload', async () => {
    await reloadPlugins();
    emitPluginEvent('plugin-reloaded', null);
    return { ok: true };
  });

  ipcMain.handle('plugin:install', async (_event, payload) => {
    const url = typeof payload === "string" ? payload : payload?.url;
    if (!url) throw new Error("plugin:install requires a URL.");
    try {
      const result = await installPluginFromURL(url);
      emitPluginEvent('plugin-activated', result?.name || null);
      return result;
    } catch (err) {
      emitPluginEvent('plugin-error', err.message);
      throw err;
    }
  });

  ipcMain.handle('plugin:remove', async (_event, name) => {
    if (!name) throw new Error("plugin:remove requires a plugin name.");
    try {
      const success = await removePluginByName(name);
      if (success) emitPluginEvent('plugin-deactivated', name);
      return { ok: success };
    } catch (err) {
      emitPluginEvent('plugin-error', err.message);
      throw err;
    }
  });

  ipcMain.handle('plugin:history', async (_event, name) => {
    if (!name) throw new Error("plugin:history requires a plugin name.");
    return getPluginHistory(name);
  });

  ipcMain.handle('plugin:restore', async (_event, payload) => {
    const { name, file } = payload || {};
    if (!name || !file) throw new Error("plugin:restore requires { name, file }.");
    try {
      const ok = await restorePluginVersion(name, file);
      if (ok) emitPluginEvent('plugin-activated', name);
      return { ok };
    } catch (err) {
      emitPluginEvent('plugin-error', err.message);
      throw err;
    }
  });

  ipcMain.handle('plugin:activate', async (_event, name) => {
    return { ok: false, error: `Plugin activation toggling is not supported yet (requested "${name ?? "unknown"}").` };
  });

  ipcMain.handle('plugin:deactivate', async (_event, name) => {
    return { ok: false, error: `Plugin activation toggling is not supported yet (requested "${name ?? "unknown"}").` };
  });

  ipcMain.handle('plugin-command', async (_event, command, ...args) => {
    switch (command) {
      case "listPlugins":
        return discoverPlugins();
      case "reloadAll":
        await reloadPlugins();
        emitPluginEvent('plugin-reloaded', null);
        return { ok: true };
      default:
        console.warn(`[Main Process] Unknown plugin command "${command}"`, args);
        return `Command "${command}" is not implemented.`;
    }
  });

  console.log('[Main Process] IPC Handlers Initialized.');
}


/**
 * Application lifecycle.
 */
app.whenReady().then(() => {
  const win = createMainWindow();
  setupDragBridge(win); // Keep drag bridge if needed separately
  setupIpcHandlers(); // Initialize all preload bridge handlers
  bootstrapPlugins();

  // --- Register Ollama Provider ---
  try {
    aiService.registerProvider('ollama', ollamaProviderGenerate);
    console.log('[Main Process] Registered Ollama AI provider.');
  } catch (err) {
    console.error('[Main Process] Failed to register Ollama provider:', err);
    // You might want to show an error dialog to the user here
  }
  // --- End Registration ---

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

/**
 * Optional: handle second-instance behavior (avoid multiple windows).
 */
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

/**
 * Global exception logging.
 */
process.on("uncaughtException", (err) => {
  console.error("[Main] Uncaught exception:", err);
  // Consider logging to a file or reporting service
});

process.on("unhandledRejection", (reason) => {
  console.error("[Main] Unhandled promise rejection:", reason);
  // Consider logging to a file or reporting service
});
