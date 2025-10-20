/**
 * server/pluginServer.js
 *
 * Stand-alone plugin service. Handles plugin uploads, manifest generation,
 * install from URL, overwrite, history, restore, and plugin discovery.
 * Runs alongside the main Electron/Express server on port 5478.
 */

import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PLUGIN_DIR = path.resolve(__dirname, "../plugins");
const HISTORY_DIR = path.resolve(__dirname, "../plugins/.history");
const MANIFEST_FILE = path.resolve(__dirname, "../plugins/manifest.json");

if (!fs.existsSync(PLUGIN_DIR)) fs.mkdirSync(PLUGIN_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

// Multer for uploads
const upload = multer({ dest: path.join(__dirname, "../plugins/.tmp") });

// Utility helpers
function safeWrite(filePath, data) {
  fs.writeFileSync(filePath, data, "utf8");
}
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
function listPlugins() {
  const files = fs.readdirSync(PLUGIN_DIR).filter((f) => f.endsWith(".js"));
  return files.map((name) => {
    const stat = fs.statSync(path.join(PLUGIN_DIR, name));
    return { name, size: stat.size, modified: stat.mtime };
  });
}

// ──────────────────────────────────────────────────────────────
// Manifest generation and persistence
// ──────────────────────────────────────────────────────────────
function generateManifest() {
  const plugins = listPlugins().map((p) => ({
    name: p.name.replace(".js", ""),
    version: "1.0.0",
    description: "Local plugin",
    author: "local",
    path: path.join(PLUGIN_DIR, p.name),
    active: true,
    updated: p.modified,
  }));
  safeWrite(MANIFEST_FILE, JSON.stringify({ plugins }, null, 2));
  return plugins;
}

// ──────────────────────────────────────────────────────────────
// GET /plugins/manifest
// ──────────────────────────────────────────────────────────────
app.get("/plugins/manifest", (_req, res) => {
  try {
    if (fs.existsSync(MANIFEST_FILE)) {
      const json = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
      return res.json(json);
    }
    const plugins = generateManifest();
    return res.json({ plugins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /plugins/upload
// ──────────────────────────────────────────────────────────────
app.post("/plugins/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const name = req.file.originalname.replace(/\.js$/i, "");
    const dest = path.join(PLUGIN_DIR, `${name}.js`);
    if (fs.existsSync(dest)) {
      // Conflict – stash temp path and warn
      return res.json({
        conflict: true,
        message: `Plugin ${name} already exists.`,
        tempPath: req.file.path,
      });
    }
    fs.renameSync(req.file.path, dest);
    generateManifest();
    return res.json({ ok: true, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /plugins/overwrite
// ──────────────────────────────────────────────────────────────
app.post("/plugins/overwrite", express.json(), (req, res) => {
  try {
    const { tempPath, name } = req.body;
    if (!tempPath || !name) return res.status(400).json({ error: "Missing params" });
    const dest = path.join(PLUGIN_DIR, `${name}.js`);
    // Backup old
    if (fs.existsSync(dest)) {
      const backupDir = path.join(HISTORY_DIR, name);
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const backupName = `${timestamp()}.js`;
      fs.copyFileSync(dest, path.join(backupDir, backupName));
    }
    fs.renameSync(tempPath, dest);
    generateManifest();
    res.json({ ok: true, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /plugins/install – from URL
// ──────────────────────────────────────────────────────────────
app.post("/plugins/install", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.endsWith(".js"))
      return res.status(400).json({ error: "URL must point to .js file" });

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const code = await response.text();
    const hash = crypto.createHash("sha1").update(code).digest("hex").slice(0, 6);
    const name = path.basename(url).replace(/\.js$/, "");
    const filePath = path.join(PLUGIN_DIR, `${name}-${hash}.js`);
    fs.writeFileSync(filePath, code);
    generateManifest();
    res.json({ ok: true, result: { name, file: filePath } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /plugins/history/:name
// ──────────────────────────────────────────────────────────────
app.get("/plugins/history/:name", (req, res) => {
  try {
    const { name } = req.params;
    const folder = path.join(HISTORY_DIR, name);
    if (!fs.existsSync(folder)) return res.json({ name, backups: [] });
    const files = fs.readdirSync(folder);
    const backups = files.map((f) => {
      const stat = fs.statSync(path.join(folder, f));
      return { file: f, timestamp: f.replace(".js", ""), size: stat.size };
    });
    res.json({ name, backups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /plugins/restore
// ──────────────────────────────────────────────────────────────
app.post("/plugins/restore", express.json(), (req, res) => {
  try {
    const { name, file } = req.body;
    const src = path.join(HISTORY_DIR, name, file);
    const dest = path.join(PLUGIN_DIR, `${name}.js`);
    if (!fs.existsSync(src)) return res.status(404).json({ error: "Backup not found" });
    fs.copyFileSync(src, dest);
    generateManifest();
    res.json({ ok: true, message: `Restored ${name} from ${file}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// Background watcher for live manifest regeneration
// ──────────────────────────────────────────────────────────────
fs.watch(PLUGIN_DIR, { recursive: false }, (eventType, filename) => {
  if (filename && filename.endsWith(".js")) {
    console.log(`[PluginServer] ${eventType}: ${filename}`);
    generateManifest();
  }
});

// ──────────────────────────────────────────────────────────────
// Start function (called by main server)
// ──────────────────────────────────────────────────────────────
export function startPluginServer(port = 5478) {
  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`[PluginServer] running at http://localhost:${port}`);
      generateManifest();
      resolve(true);
    });
  });
}

export default app;
