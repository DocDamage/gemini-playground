// /preload/pluginBridge.js
/**
 * Purpose: Secure preload bridge exposing plugin IPC helpers
 * to the renderer process.
 *
 * Provides a curated surface for invoking plugin-related commands
 * and listening for plugin lifecycle events without enabling the
 * renderer to access the full ipcRenderer API.
 */

const { contextBridge, ipcRenderer } = require("electron");

// Whitelists help guard against arbitrary IPC usage from the renderer.
const INVOKE_CHANNELS = new Set([
  "plugin-command",
  "plugin:list",
  "plugin:activate",
  "plugin:deactivate",
  "plugin:reload",
  "plugin:install",
  "plugin:remove",
  "plugin:history",
  "plugin:restore",
]);

const EVENT_CHANNELS = new Set([
  "plugin-activated",
  "plugin-deactivated",
  "plugin-reloaded",
  "plugin-error",
]);

function wrapListener(listener) {
  return (_event, ...args) => listener(...args);
}

contextBridge.exposeInMainWorld("pluginBridge", {
  /**
   * Invoke a plugin-related IPC handler in the main process.
   */
  invoke(channel, ...args) {
    if (!INVOKE_CHANNELS.has(channel)) {
      console.warn(`[pluginBridge] Blocked invoke on unsupported channel: ${channel}`);
      return Promise.reject(new Error(`Unsupported plugin channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Send a fire-and-forget plugin message.
   */
  send(channel, ...args) {
    if (!INVOKE_CHANNELS.has(channel)) {
      console.warn(`[pluginBridge] Blocked send on unsupported channel: ${channel}`);
      return;
    }
    ipcRenderer.send(channel, ...args);
  },

  /**
   * Subscribe to a plugin lifecycle event.
   */
  on(channel, listener) {
    if (!EVENT_CHANNELS.has(channel)) {
      console.warn(`[pluginBridge] Blocked listener on unsupported channel: ${channel}`);
      return () => {};
    }
    const wrapped = wrapListener(listener);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },

  /**
   * Remove all listeners for a channel (used by cleanup routines).
   */
  removeAllListeners(channel) {
    if (!EVENT_CHANNELS.has(channel)) return;
    ipcRenderer.removeAllListeners(channel);
  },
});
