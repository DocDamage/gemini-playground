/**
 * core/audit.js
 *
 * Persistent event and action logging.
 * Original structure kept:
 * - tracks user/system/plugin events
 * - writes to rotating log files
 * Added:
 * - integrity hashing
 * - remote upload hook (optional)
 * - safe JSON indexing for query
 *
 * BATCH 1 MODIFICATION:
 * - Added RUNTIME_LOG_DIR for spec compliance (Sec 4.2.3, 9.6).
 * - Added export function logRuntimeEvent to write to both the
 * main audit log (via record()) and the specific runtime_logs dir.
 */

import fs, { promises as fsPromises } from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { tryGetFetch } from "./httpClient.js";

const ROOT_DIR = process.cwd();
const LOG_DIR = path.resolve(ROOT_DIR, "logs");
const RUNTIME_LOG_DIR = path.join(LOG_DIR, "runtime_logs"); // Added for Batch 1
const INDEX_FILE = path.join(LOG_DIR, "audit_index.json");
const ROTATE_SIZE_MB = 5;
const MAX_FILES = 10;
const HASH_FILE = path.join(LOG_DIR, "audit_hashes.json");

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
// Ensure RUNTIME_LOG_DIR also exists (Added for Batch 1)
if (!fs.existsSync(RUNTIME_LOG_DIR)) fs.mkdirSync(RUNTIME_LOG_DIR, { recursive: true });


// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function logFileName() {
  const date = new Date().toISOString().split("T")[0];
  return path.join(LOG_DIR, `audit_${date}.log`);
}
function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}
function append(file, line) {
  fs.appendFileSync(file, line + "\n", "utf8");
}

// ──────────────────────────────────────────────────────────────
// Rotation + housekeeping
// ──────────────────────────────────────────────────────────────
function rotateIfNeeded() {
  try {
    const file = logFileName();
    const stats = fs.statSync(file);
    if (stats.size > ROTATE_SIZE_MB * 1024 * 1024) {
      const rotated = file.replace(".log", `_${Date.now()}.log`);
      fs.renameSync(file, rotated);
      const files = fs.readdirSync(LOG_DIR).filter((f) => f.startsWith("audit_"));
      if (files.length > MAX_FILES) {
        files
          .sort((a, b) => fs.statSync(path.join(LOG_DIR, a)).mtimeMs - fs.statSync(path.join(LOG_DIR, b)).mtimeMs)
          .slice(0, files.length - MAX_FILES)
          .forEach((f) => fs.unlinkSync(path.join(LOG_DIR, f)));
      }
    }
  } catch {}
}

// ──────────────────────────────────────────────────────────────
// Write event
// ──────────────────────────────────────────────────────────────
export function record(eventType, details = {}, actor = "system") {
  const entry = {
    timestamp: new Date().toISOString(),
    eventType,
    actor,
    details,
    host: os.hostname(),
  };

  const json = JSON.stringify(entry);
  append(logFileName(), json);
  rotateIfNeeded();
  updateIndex(entry);
  updateHash(entry);

  console.log(`[Audit] ${eventType} by ${actor}`);
  return entry;
}

// ──────────────────────────────────────────────────────────────
// [NEW] Runtime Event Logger (Batch 1)
// ──────────────────────────────────────────────────────────────
/**
 * Logs a specific runtime execution event.
 * This is required by Batch 1 and Spec 4.2.3 / 9.6.
 * 1. Logs to the main audit trail via record().
 * 2. Logs a separate, structured .json file to /logs/runtime_logs/.
 *
 * @param {string} lang - The language that was run (e.g., 'python').
 * @param {number} duration - The execution duration in milliseconds.
 * @param {boolean} success - Whether the execution was successful (exit code 0).
 * @param {string|null} errorMsg - Any error message, or null if successful.
 * @param {number} [exitCode] - The numerical exit code.
 */
export async function logRuntimeEvent(lang, duration, success, errorMsg, exitCode) {
  // 1. Log to the main audit trail using the existing record function
  const details = {
    lang,
    duration,
    success,
    error: errorMsg,
    exitCode: success ? 0 : (exitCode || 1),
  };
  record('runtime:execution', details, 'runtimeManager');

  // 2. Log the separate telemetry file as required by the guide
  const timestamp = new Date();
  const isoTimestamp = timestamp.toISOString();
  const logFileName = `${timestamp.getTime()}-${lang}.json`;
  const logFilePath = path.join(RUNTIME_LOG_DIR, logFileName);

  const logEntry = {
    timestamp: isoTimestamp,
    ...details,
    // Spec 9.6 shows stdout/stderr. These are not passed from runtimeManager
    // in Batch 1, so we omit them for now. This can be added later
    // without breaking the schema.
  };

  try {
    // Use async write for the separate telemetry file
    await fsPromises.writeFile(logFilePath, JSON.stringify(logEntry, null, 2));
  } catch (err) {
    console.error(`[audit] Failed to write runtime telemetry log ${logFilePath}:`, err);
    // Also log this failure to the main audit log
    record('audit:error', { error: err.message, file: logFilePath }, 'audit');
  }
}


// ──────────────────────────────────────────────────────────────
// Index maintenance (quick query support)
// ──────────────────────────────────────────────────────────────
function updateIndex(entry) {
  let index = [];
  try {
    if (fs.existsSync(INDEX_FILE)) {
      index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
    }
  } catch {
    index = [];
  }

  index.unshift({
    timestamp: entry.timestamp,
    type: entry.eventType,
    actor: entry.actor,
  });

  if (index.length > 500) index = index.slice(0, 500);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

// ──────────────────────────────────────────────────────────────
// Integrity hash for tamper detection
// ──────────────────────────────────────────────────────────────
function updateHash(entry) {
  let hashes = {};
  try {
    if (fs.existsSync(HASH_FILE)) {
      hashes = JSON.parse(fs.readFileSync(HASH_FILE, "utf8"));
    }
  } catch {
    hashes = {};
  }

  const key = sha256(entry.timestamp + entry.eventType + entry.actor);
  hashes[key] = sha256(JSON.stringify(entry));
  fs.writeFileSync(HASH_FILE, JSON.stringify(hashes, null, 2));
}

// ──────────────────────────────────────────────────────────────
// Verify hashes
// ──────────────────────────────────────────────────────────────
export function verifyIntegrity() {
  try {
    if (!fs.existsSync(HASH_FILE)) return { ok: true, count: 0 };
    const hashes = JSON.parse(fs.readFileSync(HASH_FILE, "utf8"));
    const logFiles = fs.readdirSync(LOG_DIR).filter((f) => f.startsWith("audit_") && f.endsWith(".log"));
    let count = 0;
    for (const file of logFiles) {
      const lines = fs.readFileSync(path.join(LOG_DIR, file), "utf8").split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          const key = sha256(entry.timestamp + entry.eventType + entry.actor);
          const hash = sha256(JSON.stringify(entry));
          if (hashes[key] !== hash) {
            console.warn(`[Audit] Integrity mismatch in ${file}`);
          }
          count++;
        } catch {}
      }
    }
    return { ok: true, count };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ──────────────────────────────────────────────────────────────
// Query recent events
// ──────────────────────────────────────────────────────────────
export function recent(limit = 50) {
  try {
    if (!fs.existsSync(INDEX_FILE)) return [];
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
    return index.slice(0, limit);
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────
// Optional remote upload (disabled unless URL set)
// ──────────────────────────────────────────────────────────────
export async function uploadAudit() {
  const endpoint = process.env.AUDIT_UPLOAD_URL;
  if (!endpoint) return false;

  try {
    const fetchImpl = tryGetFetch();
    if (!fetchImpl) {
      console.warn("[Audit] Upload skipped: fetch API unavailable.");
      return false;
    }

    const file = logFileName();
    const data = fs.readFileSync(file, "utf8");
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file, data }),
    });
    return res.ok;
  } catch (err) {
    console.error("[Audit] Upload failed:", err);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// Export unified interface
// ──────────────────────────────────────────────────────────────
export default {
  record,
  recent,
  verifyIntegrity,
  uploadAudit,
  logRuntimeEvent, // Added for Batch 1
};
