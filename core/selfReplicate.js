/**
 * core/selfReplicate.js
 *
 * Self-repair and replication logic.
 * Your original structure preserved:
 *   - backups of core files
 *   - self-restore on corruption
 * Added:
 *   - SHA256 integrity checks
 *   - optional clone-to-target for distributed rebuild
 *   - safety guard to prevent recursion
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { run as pruneNow } from "./pruner.js";

const ROOT = path.resolve(process.cwd());
const BACKUP_DIR = path.join(ROOT, ".replica");
const HASH_FILE = path.join(BACKUP_DIR, "checksums.json");

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function sha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}
function listRecursive(dir, exts = [".js", ".ts", ".json"]) {
  let files = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      files = files.concat(listRecursive(full, exts));
    } else {
      if (exts.includes(path.extname(entry))) files.push(full);
    }
  }
  return files;
}
function safeCopy(src, dest) {
  try {
    fs.copyFileSync(src, dest);
    return true;
  } catch {
    return false;
  }
}
function log(msg) {
  console.log("[SelfReplicate]", msg);
}

// ──────────────────────────────────────────────────────────────
// Build checksums (original backup logic preserved)
// ──────────────────────────────────────────────────────────────
export function buildChecksums() {
  const files = listRecursive(ROOT);
  const checksums = {};
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    checksums[rel] = sha256(f);
  }
  fs.writeFileSync(HASH_FILE, JSON.stringify(checksums, null, 2));
  log(`Checksums built for ${Object.keys(checksums).length} files.`);
  return checksums;
}

// ──────────────────────────────────────────────────────────────
// Verify integrity
// ──────────────────────────────────────────────────────────────
export function verifyIntegrity() {
  if (!fs.existsSync(HASH_FILE)) {
    log("No checksum file found, building new...");
    return buildChecksums();
  }
  const stored = JSON.parse(fs.readFileSync(HASH_FILE, "utf8"));
  const files = listRecursive(ROOT);
  const mismatches = [];

  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const current = sha256(f);
    if (stored[rel] && stored[rel] !== current) mismatches.push(rel);
  }

  if (mismatches.length > 0) {
    log(`Integrity check failed for ${mismatches.length} file(s):`);
    mismatches.forEach((f) => log(` - ${f}`));
  } else {
    log("All files verified.");
  }

  return mismatches;
}

// ──────────────────────────────────────────────────────────────
// Backup (safe replication, your logic preserved)
// ──────────────────────────────────────────────────────────────
export function backup() {
  const files = listRecursive(ROOT);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(BACKUP_DIR, timestamp);
  fs.mkdirSync(dest, { recursive: true });

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    safeCopy(file, target);
  }

  buildChecksums();
  pruneNow();
  log(`Backup completed to ${dest}`);
  return dest;
}

// ──────────────────────────────────────────────────────────────
// Restore single file
// ──────────────────────────────────────────────────────────────
function restoreFile(src, dest) {
  try {
    fs.copyFileSync(src, dest);
    log(`Restored ${path.basename(dest)} from backup.`);
    return true;
  } catch (err) {
    log(`Restore failed for ${dest}: ${err.message}`);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// Full self-restore (kept from original + improved)
// ──────────────────────────────────────────────────────────────
export function restore(targetBackup = null) {
  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^\d{4}-/.test(f))
    .sort()
    .reverse();

  const latest = targetBackup
    ? path.join(BACKUP_DIR, targetBackup)
    : path.join(BACKUP_DIR, backups[0] || "");

  if (!latest || !fs.existsSync(latest)) {
    log("No valid backup found.");
    return false;
  }

  const files = listRecursive(latest);
  for (const src of files) {
    const rel = path.relative(latest, src);
    const dest = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    restoreFile(src, dest);
  }

  buildChecksums();
  log(`Restore complete from ${latest}`);
  return true;
}

// ──────────────────────────────────────────────────────────────
// Clone replication (optional distribution)
// ──────────────────────────────────────────────────────────────
export function cloneTo(targetDir) {
  if (!targetDir || targetDir.includes(ROOT)) {
    log("Unsafe target directory.");
    return false;
  }
  fs.mkdirSync(targetDir, { recursive: true });
  const files = listRecursive(ROOT);
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const dest = path.join(targetDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    safeCopy(file, dest);
  }
  log(`Replica cloned to ${targetDir}`);
  return true;
}

// ──────────────────────────────────────────────────────────────
// Integrity daemon (added safe loop)
// ──────────────────────────────────────────────────────────────
let interval = null;

export function start(intervalMins = 30) {
  if (interval) return;
  log(`Starting self-replication integrity loop (${intervalMins}min)...`);
  interval = setInterval(() => {
    const bad = verifyIntegrity();
    if (bad.length > 0) {
      log("Detected corruption, initiating auto-restore...");
      restore();
    }
  }, intervalMins * 60 * 1000);
}

export function stop() {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
  log("Stopped self-replication monitor.");
}

// ──────────────────────────────────────────────────────────────
// Export unified API
// ──────────────────────────────────────────────────────────────
export default {
  start,
  stop,
  backup,
  restore,
  verifyIntegrity,
  cloneTo,
};
