// /preload/aiBridge.js
/**
 * Purpose: Secure preload bridge exposing AI service functions
 * to the renderer process.
 *
 * Conforms to Feature 1 Plan & general architecture (Spec 4.3).
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiBridge", {
  /**
   * Sends a prompt to the main process's aiService for generation.
   * @param {string} prompt - The full prompt text.
   * @param {object} options - Generation options (model, temperature, etc.).
   * @returns {Promise<any>} Resolves with the AI's response object.
   */
  generate: (prompt, options) => ipcRenderer.invoke("ai:generate", { prompt, options }),

  // Add listeners for streaming if needed later
  // onStreamChunk: (callback) => { ... }
});

// Need to add 'ai:generate' handler in main process (index.js / main.js)
// similar to how 'runtime:run' is handled, calling aiService.generate.