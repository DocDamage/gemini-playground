/**
 * core/pruner.js
 *
 * Maintenance and cleanup system.
 *
 * Original design preserved:
 *   - removes temp/cache/log files beyond thresholds
 *   - handles old project backups and plugin cache rotation
 *   - triggers audit + alert signals
 *
 * Additions:
 *   - size-based pruning logic
 *   - runtime-safe file operations
 *   - audit summary per run
 *   - integration with scheduler and alerts
 */

import fs from "fs";
import path from "path";
import os from "os";
import { record as audit } from "./audit.js";
import { info, warn, error } from "./alerts.js";
import { captureError } from "./autoReporter.js";

const ROOTS = {
  logs: path.resolve("./logs"),
  cache: path.resolve("./cache"),
  temp: path.resolve(os.tmpdir(), "gemini-playground"),
  projects: path.resolve("./projects"),
};

const LIMITS = {
  logs: 50 * 1024 * 1024, // 50 MB
  cache: 200 * 1024 * 1024, // 200 MB
  temp: 500 * 1024 * 1024, // 500 MB
  ageDays: 30, // default 30-day old file pruning
};

// ──────────────────────────────────────────────────────────────
// Utility helpers
// ──────────────────────────────────────────────────────────────
function getDirSize(dir) {
  let size = 0;
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) size += getDirSize(fullPath);
    else size += fs.statSync(fullPath).size;
  }
  return size;
}

function removeOldFiles(dir, maxAgeDays) {
  if (!fs.existsSync(dir)) return 0;
  const now = Date.now();
  let count = 0;

  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    try {
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        count += removeOldFiles(fullPath, maxAgeDays);
        continue;
      }
      const ageDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
      if (ageDays > maxAgeDays) {
        fs.rmSync(fullPath, { force: true, recursive: true });
        count++;
      }
    } catch (err) {
      captureError(err, "pruner");
      warn(`Failed to remove ${file}: ${err.message}`, "pruner");
    }
  }
  return count;
}

function trimToSize(dir, maxBytes) {
  if (!fs.existsSync(dir)) return 0;
  const files = [];
  const collect = (folder) => {
    for (const item of fs.readdirSync(folder)) {
      const fullPath = path.join(folder, item);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) collect(fullPath);
      else files.push({ path: fullPath, mtime: stats.mtimeMs, size: stats.size });
    }
  };
  collect(dir);

  files.sort((a, b) => b.mtime - a.mtime); // newest first
  let total = files.reduce((s, f) => s + f.size, 0);
  let removed = 0;

  while (total > maxBytes && files.length > 0) {
    const f = files.pop(); // oldest file
    try {
      fs.rmSync(f.path, { force: true });
      total -= f.size;
      removed++;
    } catch (err) {
      captureError(err, "pruner");
      warn(`Failed to trim file ${f.path}: ${err.message}`, "pruner");
    }
  }
  return removed;
}

// ──────────────────────────────────────────────────────────────
// Core pruning sequence
// ──────────────────────────────────────────────────────────────
export async function runPruner() {
  const summary = { removedOld: {}, trimmed: {}, errors: 0 };

  try {
    for (const [key, dir] of Object.entries(ROOTS)) {
      if (!fs.existsSync(dir)) continue;

      const beforeSize = getDirSize(dir);
      const removed = removeOldFiles(dir, LIMITS.ageDays);
      const trimmed = trimToSize(dir, LIMITS[key] || LIMITS.cache);
      const afterSize = getDirSize(dir);

      summary.removedOld[key] = removed;
      summary.trimmed[key] = trimmed;

      info(
        `Pruned ${key}: removed ${removed} old, trimmed ${trimmed} | ${(
          beforeSize / 1024 / 1024
        ).toFixed(1)}MB → ${(afterSize / 1024 / 1024).toFixed(1)}MB`,
        "pruner"
      );
    }

    audit("pruner_run", summary, "pruner");
    info("Pruner cycle complete", "pruner");
    return summary;
  } catch (err) {
    captureError(err, "pruner");
    error(`Pruner failed: ${err.message}`, "pruner");
    summary.errors++;
    return summary;
  }
}

// ──────────────────────────────────────────────────────────────
// Manual cleanups
// ──────────────────────────────────────────────────────────────
export function clearTemp() {
  const dir = ROOTS.temp;
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const item of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, item), { recursive: true, force: true });
      count++;
    } catch (err) {
      captureError(err, "pruner");
      warn(`Failed to clear temp ${item}: ${err.message}`, "pruner");
    }
  }
  audit("temp_cleared", { count }, "pruner");
  info(`Cleared ${count} temp items`, "pruner");
  return count;
}

export function clearLogs() {
  const dir = ROOTS.logs;
  if (!fs.existsSync(dir)) return 0;
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith(".log") || file.endsWith(".json")) {
      try {
        fs.rmSync(path.join(dir, file), { force: true });
      } catch (err) {
        captureError(err, "pruner");
      }
    }
  }
  audit("logs_cleared", {}, "pruner");
  info("Logs cleared", "pruner");
}

export function clearCache() {
  const dir = ROOTS.cache;
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const item of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, item), { recursive: true, force: true });
      count++;
    } catch (err) {
      captureError(err, "pruner");
      warn(`Cache cleanup failed: ${err.message}`, "pruner");
    }
  }
  audit("cache_cleared", { count }, "pruner");
  info(`Cleared ${count} cache items`, "pruner");
  return count;
}

// ──────────────────────────────────────────────────────────────
// Export unified interface
// ──────────────────────────────────────────────────────────────
export default {
  runPruner,
  clearTemp,
  clearLogs,
  clearCache,
};
