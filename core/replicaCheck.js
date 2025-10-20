/**
 * core/replicaCheck.js
 *
 * Replica integrity and self-verification layer.
 *
 * Original design preserved:
 *   - checksum validation across local replicas
 *   - mirror verification for projects and configs
 *   - automatic healing from primary
 *
 * Additions:
 *   - structured logging + error capture
 *   - checksum diff reporting
 *   - configurable recovery actions
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { record as audit } from "./audit.js";
import { info, warn, error } from "./alerts.js";
import { captureError } from "./autoReporter.js";

const REPLICA_ROOT = path.resolve("./replicas");
const PRIMARY_ROOT = path.resolve("./projects");
const LOG_PATH = path.resolve("./logs/replica_report.json");

if (!fs.existsSync(REPLICA_ROOT)) fs.mkdirSync(REPLICA_ROOT, { recursive: true });

// ──────────────────────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────────────────────
function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

function getAllFiles(dir, base = dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...getAllFiles(full, base));
    else files.push(full.replace(base + path.sep, ""));
  }
  return files;
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ──────────────────────────────────────────────────────────────
// Core logic
// ──────────────────────────────────────────────────────────────
function compareChecksums(primaryDir, replicaDir) {
  const diffs = [];
  const primaryFiles = getAllFiles(primaryDir);
  const replicaFiles = getAllFiles(replicaDir);

  for (const relPath of primaryFiles) {
    const primaryPath = path.join(primaryDir, relPath);
    const replicaPath = path.join(replicaDir, relPath);

    if (!fs.existsSync(replicaPath)) {
      diffs.push({ file: relPath, reason: "missing" });
      continue;
    }

    try {
      const primaryHash = sha256File(primaryPath);
      const replicaHash = sha256File(replicaPath);
      if (primaryHash !== replicaHash) {
        diffs.push({ file: relPath, reason: "mismatch" });
      }
    } catch (err) {
      captureError(err, "replicaCheck");
      diffs.push({ file: relPath, reason: `error: ${err.message}` });
    }
  }

  for (const relPath of replicaFiles) {
    const primaryPath = path.join(primaryDir, relPath);
    if (!fs.existsSync(primaryPath)) {
      diffs.push({ file: relPath, reason: "orphan" });
    }
  }

  return diffs;
}

function syncFile(src, dest) {
  ensureDirSync(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function healReplica(primaryDir, replicaDir, diffs) {
  let repaired = 0;
  for (const diff of diffs) {
    const src = path.join(primaryDir, diff.file);
    const dest = path.join(replicaDir, diff.file);
    try {
      if (diff.reason === "missing" || diff.reason === "mismatch") {
        syncFile(src, dest);
        repaired++;
      } else if (diff.reason === "orphan") {
        fs.rmSync(dest, { force: true });
        repaired++;
      }
    } catch (err) {
      captureError(err, "replicaCheck");
      warn(`Failed to heal ${diff.file}: ${err.message}`, "replicaCheck");
    }
  }
  return repaired;
}

// ──────────────────────────────────────────────────────────────
// Primary replica check
// ──────────────────────────────────────────────────────────────
export async function verifyIntegrity(autoHeal = true) {
  const summary = { checked: 0, mismatched: 0, repaired: 0, details: [] };

  try {
    const projects = fs.readdirSync(PRIMARY_ROOT).filter((f) => {
      const full = path.join(PRIMARY_ROOT, f);
      return fs.statSync(full).isDirectory();
    });

    for (const proj of projects) {
      const primaryDir = path.join(PRIMARY_ROOT, proj);
      const replicaDir = path.join(REPLICA_ROOT, proj);
      ensureDirSync(replicaDir);

      const diffs = compareChecksums(primaryDir, replicaDir);
      summary.checked += 1;
      summary.mismatched += diffs.length;

      if (diffs.length > 0) {
        warn(`Replica drift detected in ${proj}: ${diffs.length} differences`, "replicaCheck");
        if (autoHeal) {
          const repaired = healReplica(primaryDir, replicaDir, diffs);
          summary.repaired += repaired;
          info(`Healed ${repaired} files in ${proj}`, "replicaCheck");
        }
      }
      summary.details.push({ project: proj, diffs });
    }

    fs.writeFileSync(LOG_PATH, JSON.stringify(summary, null, 2));
    audit("replica_checked", summary, "replicaCheck");
    info(`Replica check complete: ${summary.checked} projects`, "replicaCheck");
    return summary;
  } catch (err) {
    captureError(err, "replicaCheck");
    error(`Replica check failed: ${err.message}`, "replicaCheck");
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────
// Manual restore
// ──────────────────────────────────────────────────────────────
export function restoreReplica(projectName) {
  const primaryDir = path.join(PRIMARY_ROOT, projectName);
  const replicaDir = path.join(REPLICA_ROOT, projectName);
  if (!fs.existsSync(primaryDir) || !fs.existsSync(replicaDir))
    throw new Error("Project missing in primary or replica");

  const diffs = compareChecksums(primaryDir, replicaDir);
  const repaired = healReplica(primaryDir, replicaDir, diffs);

  audit("replica_restored", { projectName, repaired }, "replicaCheck");
  info(`Restored ${projectName}: ${repaired} repairs`, "replicaCheck");
  return repaired;
}

// ──────────────────────────────────────────────────────────────
// Export unified interface
// ──────────────────────────────────────────────────────────────
export default {
  verifyIntegrity,
  restoreReplica,
};
