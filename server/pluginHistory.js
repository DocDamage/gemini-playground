// server/pluginHistory.js
// Provides access to plugin version history and restore actions

import fs from "fs";
import path from "path";
import express from "express";
import { rebuildManifest } from "../core/pluginManifest.js";
import { pluginManager } from "../core/pluginManager.js";

const PLUGIN_DIR = path.join(process.cwd(), "plugins");
const HISTORY_DIR = path.join(PLUGIN_DIR, "_history");
export const historyRouter = express.Router();

// --- List available backups for a plugin -----------------------------------
historyRouter.get("/history/:name", (req, res) => {
  const name = req.params.name;
  const dir = path.join(HISTORY_DIR, name);
  if (!fs.existsSync(dir)) return res.json({ backups: [] });

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .sort()
    .reverse()
    .map((file) => ({
      file,
      timestamp: file.replace(".js", ""),
      size: fs.statSync(path.join(dir, file)).size,
    }));

  res.json({ name, backups: files });
});

// --- Restore a specific backup ---------------------------------------------
historyRouter.post("/restore", express.json(), async (req, res) => {
  try {
    const { name, file } = req.body;
    if (!name || !file) throw new Error("Missing name or file");

    const src = path.join(HISTORY_DIR, name, file);
    const dest = path.join(PLUGIN_DIR, `${name}.js`);
    if (!fs.existsSync(src)) throw new Error("Backup not found");

    const now = new Date().toISOString().replace(/[:.]/g, "-");
    const currentDest = path.join(HISTORY_DIR, name, `${now}-current.js`);
    if (fs.existsSync(dest)) {
      fs.copyFileSync(dest, currentDest);
      console.log(`[History] Archived current before restore: ${currentDest}`);
    }

    fs.copyFileSync(src, dest);
    console.log(`[History] Restored plugin: ${name} from ${file}`);

    await pluginManager.discover();
    rebuildManifest(pluginManager.meta);

    res.json({ ok: true, message: `Restored ${name} from ${file}` });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
