// server/pluginUploader.js
// Drag-and-drop upload handler with version conflict detection + automatic version history

import fs from "fs";
import path from "path";
import multer from "multer";
import express from "express";
import { pluginManager } from "../core/pluginManager.js";
import { rebuildManifest, loadManifest } from "../core/pluginManifest.js";

const PLUGIN_DIR = path.join(process.cwd(), "plugins");
const HISTORY_DIR = path.join(PLUGIN_DIR, "_history");
const upload = multer({ dest: path.join(process.cwd(), "tmp_uploads") });
export const uploaderRouter = express.Router();

/**
 * Compare semantic versions roughly (ignores prerelease tags)
 */
function compareVersions(a = "0.0.0", b = "0.0.0") {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

/**
 * Archive an existing plugin before overwriting it.
 */
function archivePlugin(name) {
  try {
    const src = path.join(PLUGIN_DIR, `${name}.js`);
    if (!fs.existsSync(src)) return;

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(HISTORY_DIR, name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const dest = path.join(dir, `${stamp}.js`);
    fs.copyFileSync(src, dest);

    console.log(`[History] Archived ${name}.js → ${dest}`);
  } catch (err) {
    console.warn(`[History] Failed to archive ${name}:`, err.message);
  }
}

uploaderRouter.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) throw new Error("No file uploaded.");
    if (!req.file.originalname.endsWith(".js"))
      throw new Error("Only .js plugin files supported.");

    const name = req.file.originalname.replace(".js", "");
    const manifest = loadManifest();
    const existing = manifest.plugins.find((p) => p.name === name);

    if (existing) {
      const code = fs.readFileSync(req.file.path, "utf8");
      const match = code.match(/version\s*[:=]\s*["'`](\d+\.\d+\.\d+)["'`]/);
      const newVersion = match ? match[1] : "0.0.0";

      const cmp = compareVersions(newVersion, existing.version);
      if (cmp === 0) {
        fs.unlinkSync(req.file.path);
        return res.status(409).json({
          ok: false,
          conflict: true,
          message: `Plugin '${name}' already exists (v${existing.version}).`,
          suggestion: "same",
        });
      } else if (cmp < 0) {
        fs.unlinkSync(req.file.path);
        return res.status(409).json({
          ok: false,
          conflict: true,
          message: `Existing plugin '${name}' (v${existing.version}) is newer than uploaded (${newVersion}).`,
          suggestion: "keep",
        });
      } else {
        return res.status(409).json({
          ok: false,
          conflict: true,
          message: `Uploaded plugin '${name}' (v${newVersion}) will replace existing (${existing.version}).`,
          suggestion: "replace",
          tempPath: req.file.path,
          newVersion,
        });
      }
    }

    const target = path.join(PLUGIN_DIR, req.file.originalname);
    fs.renameSync(req.file.path, target);

    await pluginManager.discover();
    rebuildManifest(pluginManager.meta);
    res.json({ ok: true, name });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

uploaderRouter.post("/overwrite", express.json(), async (req, res) => {
  try {
    const { tempPath, name } = req.body;
    if (!tempPath || !name) throw new Error("Missing parameters.");

    archivePlugin(name);

    const target = path.join(PLUGIN_DIR, `${name}.js`);
    fs.renameSync(tempPath, target);
    console.log(`[Uploader] Overwrote plugin: ${target}`);

    await pluginManager.discover();
    rebuildManifest(pluginManager.meta);

    res.json({ ok: true, name });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
