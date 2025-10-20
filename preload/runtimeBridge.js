// /preload/runtimeBridge.js
/**
 * Purpose: Secure preload bridge for streaming runtime events.
 * Exposes safe listeners for the renderer to subscribe to
 * stdout, stderr, and status events sent from the main process.
 *
 * Conforms to Batch 2 of MASTER_BUILD_GUIDE.md.
 * Note: Spec Section 3 & 4.3 list this as /preload/runtimeBridge.js.
 * Spec Section 5 (Batch 2) lists /core/runtimeBridge.js.
 * This implementation assumes /preload/ as it bridges to the renderer.
 */

const { contextBridge, ipcRenderer } = require("electron");

// A whitelist of channels that the runtimeManager can send.
// This ensures we only expose listeners for these specific events.
const CHANNELS = [
  'runtime:start',  // { lang }
  'runtime:stdout', // { chunk }
  'runtime:stderr', // { chunk }
  'runtime:error',  // { error, stdout, stderr }
  'runtime:done',   // { lang, duration, stdout, stderr, ... }
];

contextBridge.exposeInMainWorld("runtimeBridge", {
  /**
   * Subscribes to a runtime event channel.
   * @param {string} channel - The channel name (e.g., 'runtime:stdout').
   * @param {function} callback - The function to call with event data.
   * Example: (event, data) => { ... }
   */
  on: (channel, callback) => {
    if (CHANNELS.includes(channel)) {
      // Create a new listener that wraps the callback
      const listener = (event, ...args) => callback(...args);
      // Register the new listener with ipcRenderer
      ipcRenderer.on(channel, listener);
      
      // Return an "off" function to allow cleanup
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    } else {
      console.warn(`[runtimeBridge] Blocked attempt to listen on invalid channel: ${channel}`);
      // Return a no-op function
      return () => {};
    }
  },

  /**
   * Removes all listeners for all whitelisted runtime channels.
   * This is a cleanup utility for when a component unmounts.
   */
  removeAllListeners: () => {
    for (const channel of CHANNELS) {
      ipcRenderer.removeAllListeners(channel);
    }
    console.log('[runtimeBridge] All runtime listeners removed.');
  }
});