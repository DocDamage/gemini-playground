/**
 * core/pluginManager.js
 *
 * Central plugin orchestrator.
 * Handles discovery, validation, sandboxed execution, and lifecycle.
 *
 * BATCH 6 MODIFICATION (HIGH RISK):
 * - Replaced the core 'loadPlugins' and 'unloadPlugins' functions to
 * implement the new secure sandbox architecture (Spec 4.2.9, 10.6).
 * - Plugins are NO LONGER dynamically imported. They are read from
 * disk and executed inside a 'vm2' sandbox.
 * - [NEW] Added dependency on 'vm2' for sandboxing.
 * - [NEW] Added dependency on 'ajv' for schema validation.
 * - [NEW] loadPlugins now validates a 'meta' export against
 * '/config/pluginSchema.json'.
 * - [NEW] loadPlugins now creates a limited 'ctx' object for each
 * plugin, passing in proxied core APIs (ai, runtime, events, ui).
 * - [CHANGED] loadPlugins now calls 'register(ctx)' instead of 'init()'.
 * This is a breaking change for old plugins.
 * - [PRESERVED] All existing file/remote/history functions
 * (syncManifest, installFromURL, removePlugin, etc.) are untouched.
 */

import fs from "fs";
import path from "path";
import EventEmitter from "events";
import { VM, VMScript } from 'vm2'; // [NEW] Batch 6
import Ajv from 'ajv'; // [NEW] Batch 6

// [NEW] Import core services to proxy them to plugins
import * as aiService from './aiService.js';
import * as runtimeManager from './runtimeManager.js';
// VERIFY_BEFORE_COMMIT: Need to import a config service
// import * as config from './config.js'; 
import { tryGetFetch } from "./httpClient.js";

const ROOT_DIR = process.cwd();

// ──────────────────────────────────────────────────────────────
// Core constants
// ──────────────────────────────────────────────────────────────
const PLUGIN_DIR = path.resolve(ROOT_DIR, "plugins");
const MANIFEST_PATH = path.join(PLUGIN_DIR, "manifest.json");
const HISTORY_DIR = path.join(PLUGIN_DIR, ".history");
// [NEW] Batch 6
const PLUGIN_SCHEMA_PATH = path.resolve(ROOT_DIR, "config/pluginSchema.json"); 
const DEFAULT_VM_TIMEOUT = 5000; // 5 seconds

// ──────────────────────────────────────────────────────────────
// Event Bus
// ──────────────────────────────────────────────────────────────
export const pluginEvents = new EventEmitter();

// [NEW] Batch 6: Store for loaded plugin sandboxes
const loadedPlugins = new Map();

// ──────────────────────────────────────────────────────────────
// Utility functions
// ──────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(PLUGIN_DIR);
ensureDir(HISTORY_DIR);

function ensureFetch() {
  const impl = tryGetFetch();
  if (!impl) {
    throw new Error("Fetch API unavailable for plugin manager HTTP calls.");
  }
  return impl;
}

// Safe JSON read/write
function safeReadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
function safeWriteJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// [NEW] Batch 6: Schema validator
let schemaValidator = null;
function getValidator() {
  if (schemaValidator) return schemaValidator;
  try {
    const schema = safeReadJSON(PLUGIN_SCHEMA_PATH);
    if (!schema) {
      console.error("[PluginManager] FATAL: Could not load pluginSchema.json. Plugins will not load.");
      return null;
    }
    const ajv = new Ajv();
    schemaValidator = ajv.compile(schema);
    return schemaValidator;
  } catch (err) {
    console.error("[PluginManager] FATAL: Failed to compile plugin schema.", err);
    return null;
  }
}

// [NEW] Batch 6: Create the sandboxed context for a plugin
function createPluginContext(meta) {
  const { permissions = [] } = meta;
  
  // Build the limited 'ctx' object
  const ctx = {
    // 1. AI Context (proxied)
    ai: permissions.includes('ai') ? {
      generate: aiService.generate,
      // VERIFY_BEFORE_COMMIT: Add other aiService functions as needed
    } : {
      generate: () => Promise.reject(new Error(`Plugin "${meta.id}" does not have 'ai' permission.`))
    },

    // 2. Runtime Context (proxied)
    runtime: permissions.includes('runtime') ? {
      run: runtimeManager.run,
      listRuntimes: runtimeManager.listRuntimes,
    } : {
      run: () => Promise.reject(new Error(`Plugin "${meta.id}" does not have 'runtime' permission.`)),
      listRuntimes: () => []
    },
    
    // 3. UI Context (event-based)
    ui: {
      addButton: (label) => {
        // We can't pass a function, so we register the action and
        // emit an event. The UI layer must listen for this.
        // This is a complex wiring, for now, just emit.
        pluginEvents.emit('ui:add-button', { pluginId: meta.id, label });
        // VERIFY_BEFORE_COMMIT: Need a way to map 'action' back to the VM.
      },
      addPanel: (id, component) => {
        pluginEvents.emit('ui:add-panel', { pluginId: meta.id, id, component });
      }
    },
    
    // 4. Events Context
    events: {
      on: pluginEvents.on.bind(pluginEvents),
      off: pluginEvents.off.bind(pluginEvents),
      emit: pluginEvents.emit.bind(pluginEvents),
    },
    
    // 5. Config Context (proxied)
    config: {
      // VERIFY_BEFORE_COMMIT: Wire up config service
      get: () => undefined,
      set: () => { /* config.set(key, value) */ }
    }
  };
  
  return ctx;
}


// ──────────────────────────────────────────────────────────────
// Original core discovery (kept exactly as you built it)
// ──────────────────────────────────────────────────────────────
export function discover() {
  const plugins = fs
    .readdirSync(PLUGIN_DIR)
    .filter((f) => f.endsWith(".js"))
    .map((file) => {
      const filePath = path.join(PLUGIN_DIR, file);
      const stat = fs.statSync(filePath);
      return {
        name: file.replace(".js", ""),
        path: filePath,
        size: stat.size,
        modified: stat.mtime,
      };
    });
  pluginEvents.emit("discovered", plugins);
  return plugins;
}

// ──────────────────────────────────────────────────────────────
// [REPLACED] Load plugin modules dynamically (new sandbox logic)
// ──────────────────────────────────────────────────────────────
export async function loadPlugins() {
  const list = discover();
  const validator = getValidator();
  const loaded = [];
  
  if (!validator) {
    console.error("[PluginManager] Cannot load plugins: Schema validator failed to init.");
    return [];
  }

  // Clear previous session
  await unloadPlugins(); 

  for (const plugin of list) {
    let meta;
    try {
      const code = fs.readFileSync(plugin.path, 'utf8');
      
      // 1. Pre-load to get meta
      // We run in a simple VM just to extract the 'meta' export.
      const metaVM = new VM({ timeout: 1000, sandbox: { exports: {} } });
      metaVM.run(code + '; exports.meta = meta;');
      meta = metaVM.run('exports.meta');
      
      if (!meta || !meta.id) {
        throw new Error(`Plugin ${plugin.name} does not export a valid 'meta' object with an 'id'.`);
      }

      // 2. Validate meta against schema
      const valid = validator(meta);
      if (!valid) {
        const errors = validator.errors.map(e => e.message).join(', ');
        throw new Error(`Plugin ${meta.id} has invalid 'meta' block: ${errors}`);
      }
      
      // 3. Create secure context and sandbox
      const ctx = createPluginContext(meta);
      const sandbox = {
        ctx, // The limited context object
        console: { // A sandboxed console
          log: (...args) => console.log(`[Plugin:${meta.id}]`, ...args),
          warn: (...args) => console.warn(`[Plugin:${meta.id}]`, ...args),
          error: (...args) => console.error(`[Plugin:${meta.id}]`, ...args),
        },
      };

      // 4. Create the main VM with resource caps
      const pluginVM = new VM({
        timeout: meta.timeout || DEFAULT_VM_TIMEOUT,
        sandbox,
        require: {
          external: meta.permissions?.includes('require:external') || false,
          builtin: meta.permissions?.filter(p => p.startsWith('require:'))
                             .map(p => p.split(':')[1]) || [],
          // VERIFY_BEFORE_COMMIT: 'fs' and 'path' should be proxied
          // to a jailed file system, not given directly.
        },
        // mem: DEFAULT_VM_MEMORY // vm2 mem option is experimental
      });

      // 5. Compile and run the register function
      const script = new VMScript(code, plugin.path);
      pluginVM.run(script); // This defines 'register' in the VM
      pluginVM.run('if (typeof register === "function") { register(ctx); } else { throw new Error("Plugin does not export a register function."); }');

      // 6. Store and report success
      loadedPlugins.set(meta.id, { vm: pluginVM, meta, ctx });
      loaded.push({ name: meta.name || plugin.name, status: "loaded" });
      console.log(`[PluginManager] Successfully loaded plugin: ${meta.id}`);

    } catch (err) {
      console.error(`[PluginManager] Failed to load ${plugin.name}:`, err);
      loaded.push({ name: plugin.name, status: "error", error: err.message });
    }
  }
  pluginEvents.emit("loaded", loaded);
  return loaded;
}

// ──────────────────────────────────────────────────────────────
// [REPLACED] Unload plugins (graceful disable)
// ──────────────────────────────────────────────────────────────
export async function unloadPlugins() {
  for (const [id, plugin] of loadedPlugins.entries()) {
    try {
      // Call the unregister function inside the plugin's own VM
      plugin.vm.run('if (typeof unregister === "function") { unregister(ctx); }');
      console.log(`[PluginManager] Unregistered plugin: ${id}`);
    } catch (err) {
      console.error(`[PluginManager] Error unregistering plugin ${id}:`, err);
    }
  }
  loadedPlugins.clear();
  pluginEvents.emit("unloaded");
  return true;
}

// ──────────────────────────────────────────────────────────────
// Reload sequence (Unchanged, now uses new load/unload)
// ──────────────────────────────────────────────────────────────
export async function reloadAll() {
  await unloadPlugins();
  return await loadPlugins();
}

// ──────────────────────────────────────────────────────────────
// Manifest synchronization (Preserved from original)
// ──────────────────────────────────────────────────────────────
export async function syncManifest() {
  try {
    const fetchImpl = ensureFetch();
    const res = await fetchImpl("http://localhost:5478/plugins/manifest", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch manifest");
    const data = await res.json();
    safeWriteJSON(MANIFEST_PATH, data);
    pluginEvents.emit("manifestUpdated", data.plugins || []);
    return data.plugins || [];
  } catch (err) {
    console.error("[PluginManager] Manifest sync failed:", err);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────
// Plugin installation from URL (Preserved from original)
// ──────────────────────────────────────────────────────────────
export async function installFromURL(url) {
  if (!url || !url.endsWith(".js"))
    throw new Error("URL must end with .js");

  try {
    const fetchImpl = ensureFetch();
    const res = await fetchImpl("http://localhost:5478/plugins/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (data.ok) {
      pluginEvents.emit("installed", data.result);
      await syncManifest();
      return data.result;
    }
    throw new Error(data.error || "Install failed");
  } catch (err) {
    console.error("[PluginManager] Install error:", err);
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────
// Plugin removal / disable (Preserved from original)
// ──────────────────────────────────────────────────────────────
export async function removePlugin(name) {
  try {
    const file = path.join(PLUGIN_DIR, `${name}.js`);
    if (!fs.existsSync(file)) throw new Error("Plugin not found");
    const backupDir = path.join(HISTORY_DIR, name);
    ensureDir(backupDir);
    const backupFile = path.join(backupDir, `${Date.now()}.js`);
    fs.copyFileSync(file, backupFile);
    fs.unlinkSync(file);
    await syncManifest();
    pluginEvents.emit("removed", name);
    return true;
  } catch (err) {
    console.error("[PluginManager] Remove failed:", err);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// Plugin history + restore API (Preserved from original)
// ──────────────────────────────────────────────────────────────
export async function getHistory(name) {
  try {
    const fetchImpl = ensureFetch();
    const res = await fetchImpl(`http://localhost:5478/plugins/history/${name}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.backups || [];
  } catch {
    return [];
  }
}

export async function restoreVersion(name, file) {
  try {
    const fetchImpl = ensureFetch();
    const res = await fetchImpl("http://localhost:5478/plugins/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, file }),
    });
    const data = await res.json();
    if (data.ok) {
      pluginEvents.emit("restored", name);
      await syncManifest();
      return true;
    }
    throw new Error(data.error);
  } catch (err) {
    console.error("[PluginManager] Restore failed:", err);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// Watch local plugin directory (Preserved from original)
// ──────────────────────────────────────────────────────────────
fs.watch(PLUGIN_DIR, { recursive: false }, async (eventType, fileName) => {
  if (!fileName || !fileName.endsWith(".js")) return;
  console.log(`[PluginManager] ${eventType}: ${fileName}`);
  // [CHANGED] Batch 6: Reload all plugins on change, not just sync manifest
  // This enables hot-reloading for local dev.
  await reloadAll(); 
  pluginEvents.emit("changed", fileName);
});

// ──────────────────────────────────────────────────────────────
// Expose a unified API (Preserved and extended)
// ──────────────────────────────────────────────────────────────
export default {
  discover,
  loadPlugins,
  unloadPlugins,
  reloadAll,
  syncManifest,
  installFromURL,
  removePlugin,
  getHistory,
  restoreVersion,
  pluginEvents,
};
