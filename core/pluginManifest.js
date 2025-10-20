// core/pluginManifest.js
// Maintains the plugin manifest file used by the dashboard and plugin manager

import fs from "fs";
import path from "path";

const PLUGIN_DIR = path.join(process.cwd(), "plugins");
const MANIFEST_FILE = path.join(PLUGIN_DIR, "manifest.json");

/**
 * Loads the current manifest if it exists.
 */
export function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
  } catch {
    return { generated: new Date().toISOString(), plugins: [] };
  }
}

/**
 * Saves a manifest object back to disk.
 */
export function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
}

/**
 * Rebuilds the manifest from discovered plugin files and metadata.
 * Called by the PluginManager after each discovery pass.
 */
export function rebuildManifest(metaCache) {
  const plugins = Object.entries(metaCache).map(([name, meta]) => ({
    name,
    version: meta.version || "1.0.0",
    description: meta.description || "",
    author: meta.author || "unknown",
    path: meta.path,
    active: !!meta.active,
    updated: new Date().toISOString(),
  }));

  const manifest = {
    generated: new Date().toISOString(),
    count: plugins.length,
    plugins,
  };

  saveManifest(manifest);
  return manifest;
}
