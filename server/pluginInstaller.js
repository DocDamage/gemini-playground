// server/pluginInstaller.js
// Handles remote plugin installation via URL fetch

import fs from "fs";
import path from "path";
import { rebuildManifest } from "../core/pluginManifest.js";
import { pluginManager } from "../core/pluginManager.js";
import fetch from "node-fetch";

const PLUGIN_DIR = path.join(process.cwd(), "plugins");

/**
 * Downloads a plugin file from a remote URL and saves it into /plugins
 * Returns the plugin name and path if successful.
 */
export async function installPluginFromUrl(url) {
  if (!url.endsWith(".js")) {
    throw new Error("Only .js plugins are supported.");
  }

  const name = path.basename(url).replace(".js", "");
  const dest = path.join(PLUGIN_DIR, `${name}.js`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);

  const code = await res.text();
  if (!code.includes("export") && !code.includes("module.exports")) {
    throw new Error("File does not look like a valid plugin module.");
  }

  fs.writeFileSync(dest, code);
  console.log(`[Installer] Plugin saved: ${dest}`);

  // Refresh manifest and cache
  await pluginManager.discover();
  rebuildManifest(pluginManager.meta);

  return { name, path: dest };
}
