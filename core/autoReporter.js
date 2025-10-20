/**
 * core/autoReporter.js
 *
 * Automated reporting and telemetry module.
 * Your original design kept:
 *   - summary generation for audit, alerts, plugins
 *   - interval-driven push to external endpoints
 * Added:
 *   - deduplication (hash-based)
 *   - integrity validation
 *   - concurrent task queue
 *   - structured JSON envelope for downstream ingestion
 */

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { getRecent as getAlerts } from "./alerts.js";
import { recent as getAudit } from "./audit.js";
import { verifyIntegrity as verifyAudit } from "./audit.js";
import { backup as backupReplica } from "./selfReplicate.js";
import { tryGetFetch } from "./httpClient.js";

const ROOT_DIR = process.cwd();
const REPORT_DIR = path.resolve(ROOT_DIR, "reports");
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

const PERSIST_FILE = path.join(REPORT_DIR, "autoReportQueue.json");
const LAST_HASH_FILE = path.join(REPORT_DIR, "lastReportHash.txt");

const DEFAULT_INTERVAL_MIN = 10;

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}
function readJSON(file, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function log(msg) {
  console.log("[AutoReporter]", msg);
}

// ──────────────────────────────────────────────────────────────
// Assemble system snapshot
// ──────────────────────────────────────────────────────────────
function collectSnapshot() {
  const alerts = getAlerts(50);
  const audits = getAudit(50);
  const auditIntegrity = verifyAudit();
  const sys = {
    platform: os.platform(),
    release: os.release(),
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    memory: os.totalmem(),
    free: os.freemem(),
  };

  return {
    timestamp: new Date().toISOString(),
    host: os.hostname(),
    system: sys,
    auditIntegrity,
    recentAlerts: alerts,
    recentAudit: audits,
  };
}

// ──────────────────────────────────────────────────────────────
// Local file report writer
// ──────────────────────────────────────────────────────────────
function writeLocalReport(data) {
  const file = path.join(REPORT_DIR, `report_${Date.now()}.json`);
  writeJSON(file, data);
  log(`Local report saved to ${file}`);
  return file;
}

// ──────────────────────────────────────────────────────────────
// Deduplication using hash comparison
// ──────────────────────────────────────────────────────────────
function isDuplicate(report) {
  const last = fs.existsSync(LAST_HASH_FILE)
    ? fs.readFileSync(LAST_HASH_FILE, "utf8")
    : "";
  const current = sha256(JSON.stringify(report));
  if (last === current) return true;
  fs.writeFileSync(LAST_HASH_FILE, current);
  return false;
}

// ──────────────────────────────────────────────────────────────
// Remote push
// ──────────────────────────────────────────────────────────────
async function pushRemote(report) {
  const endpoint = process.env.REPORT_WEBHOOK_URL;
  if (!endpoint) return false;

  const fetchImpl = tryGetFetch();
  if (!fetchImpl) {
    log("Remote push skipped: fetch API unavailable.");
    return false;
  }

  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
    if (!res.ok) {
      log(`Remote push failed: ${res.statusText}`);
      return false;
    }
    log("Report pushed successfully to webhook.");
    return true;
  } catch (err) {
    log(`Push error: ${err.message}`);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// Queue handling
// ──────────────────────────────────────────────────────────────
function loadQueue() {
  return readJSON(PERSIST_FILE, []);
}
function saveQueue(queue) {
  writeJSON(PERSIST_FILE, queue);
}
function enqueue(report) {
  const queue = loadQueue();
  queue.push(report);
  saveQueue(queue);
}
function dequeue() {
  const queue = loadQueue();
  const next = queue.shift();
  saveQueue(queue);
  return next;
}

// ──────────────────────────────────────────────────────────────
// Report builder
// ──────────────────────────────────────────────────────────────
function buildReport() {
  const snapshot = collectSnapshot();
  const envelope = {
    version: 2,
    generatedAt: new Date().toISOString(),
    snapshot,
    environment: {
      cwd: process.cwd(),
      node: process.version,
    },
  };
  return envelope;
}

// ──────────────────────────────────────────────────────────────
// Error catcher wrapper
// ──────────────────────────────────────────────────────────────
export function captureError(err, context = "runtime") {
  const report = {
    type: "error",
    context,
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  };
  enqueue(report);
  log(`Captured error: ${err.message}`);
}

// ──────────────────────────────────────────────────────────────
// Main reporting cycle
// ──────────────────────────────────────────────────────────────
let loop = null;

export function start(intervalMin = DEFAULT_INTERVAL_MIN) {
  if (loop) return;
  log(`AutoReporter running every ${intervalMin} minutes...`);
  loop = setInterval(async () => {
    const report = buildReport();
    if (isDuplicate(report)) {
      log("No changes since last report — skipping.");
      return;
    }

    const file = writeLocalReport(report);
    enqueue({ file, report });

    const queued = loadQueue();
    for (const r of queued) {
      try {
        const success = await pushRemote(r.report || r);
        if (success) dequeue();
      } catch {}
    }

    // Trigger a safe backup every 6 cycles
    const cycleNum = Math.floor(Date.now() / (intervalMin * 60 * 1000));
    if (cycleNum % 6 === 0) {
      backupReplica();
      log("Replica backup triggered by AutoReporter.");
    }
  }, intervalMin * 60 * 1000);
}

export function stop() {
  if (!loop) return;
  clearInterval(loop);
  loop = null;
  log("AutoReporter stopped.");
}

// ──────────────────────────────────────────────────────────────
// Manual run
// ──────────────────────────────────────────────────────────────
export async function runOnce() {
  const report = buildReport();
  const file = writeLocalReport(report);
  enqueue({ file, report });
  await pushRemote(report);
  return file;
}

// ──────────────────────────────────────────────────────────────
// Export unified interface
// ──────────────────────────────────────────────────────────────
export default {
  start,
  stop,
  runOnce,
  captureError,
};
