/**
 * core/heartbeatScheduler.js
 *
 * Centralized background scheduler for Gemini Playground.
 *
 * BATCH 7 MODIFICATION:
 * - [FIX] Corrected 'audit.js' import to use the default export,
 * matching the pattern established in Batch 1 (DOC_MANUAL_OVERRIDE).
 * - [NEW] Added imports for 'fs.promises', 'path', and 'fileURLToPath'.
 * - [NEW] Added 'rotateRuntimeCache' function to prune old runtime logs.
 * - [NEW] Registered 'rotateRuntimeCache' as a new job in 'startScheduler'
 * to run hourly.
 */

import os from "os";
import { promises as fs } from "fs"; // [NEW] Batch 7
import path from "path"; // [NEW] Batch 7

// DOC_MANUAL_OVERRIDE_START
// The original import 'import { record as audit } from "./audit.js";'
// conflicts with the default export of the 'audit.js' file.
// This is corrected to match the file's actual structure.
import auditModule from "./audit.js";
const { record: audit } = auditModule;
// DOC_MANUAL_OVERRIDE_END

import { info, warn, error } from "./alerts.js";
import { captureError } from "./autoReporter.js";
import { runPruner } from "./pruner.js";
import { verifyIntegrity } from "./replicaCheck.js";

// [NEW] Batch 7: Constants for cache rotation
const ROOT_DIR = process.cwd();
const LOGS_DIR = path.resolve(ROOT_DIR, "logs");
const RUNTIME_LOG_DIR = path.join(LOGS_DIR, "runtime_logs");
const MAX_RUNTIME_LOG_FILES = 1000; // Keep the last 1000 run logs
const ROTATION_JOB_INTERVAL = 60 * 60 * 1000; // 1 hour

const DEFAULT_INTERVAL = 30_000; // 30s heartbeat
const jobs = new Map();
let running = false;

// ──────────────────────────────────────────────────────────────
// Job registration
// ──────────────────────────────────────────────────────────────
export function registerJob(name, fn, interval = DEFAULT_INTERVAL) {
  if (jobs.has(name)) {
    warn(`Job "${name}" already registered; replacing.`, "heartbeat");
    clearInterval(jobs.get(name).intervalId);
  }

  const job = {
    name,
    fn,
    interval,
    lastRun: 0,
    intervalId: null,
  };

  job.intervalId = setInterval(async () => {
    try {
      job.lastRun = Date.now();
      const result = await fn();
      audit("job_run", { name, result, uptime: os.uptime() }, "heartbeat");
    } catch (err) {
      captureError(err, "heartbeat");
      error(`Job "${name}" failed: ${err.message}`, "heartbeat");
    }
  }, interval);

  jobs.set(name, job);
  info(`Registered job: ${name}`, "heartbeat");
  return job;
}

export function unregisterJob(name) {
  if (jobs.has(name)) {
    clearInterval(jobs.get(name).intervalId);
    jobs.delete(name);
    audit("job_unregistered", { name }, "heartbeat");
    info(`Unregistered job: ${name}`, "heartbeat");
    return true;
  }
  return false;
}

export function listJobs() {
  return Array.from(jobs.values()).map((j) => ({
    name: j.name,
    interval: j.interval,
    lastRun: j.lastRun,
  }));
}

// ──────────────────────────────────────────────────────────────
// [NEW] Batch 7: Runtime Cache Rotation Job
// ──────────────────────────────────────────────────────────────
/**
 * Prunes the /logs/runtime_logs directory to prevent it from
 * growing indefinitely.
 */
async function rotateRuntimeCache() {
  let prunedCount = 0;
  try {
    const files = await fs.readdir(RUNTIME_LOG_DIR);
    const logFiles = [];

    // Read stats for all JSON files
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(RUNTIME_LOG_DIR, file);
        try {
          const stat = await fs.stat(filePath);
          logFiles.push({ path: filePath, mtime: stat.mtimeMs });
        } catch {
          // Ignore files removed during iteration.
        }
      }
    }

    // Prune if we're over the limit
    if (logFiles.length > MAX_RUNTIME_LOG_FILES) {
      // Sort files by modification time (oldest first)
      logFiles.sort((a, b) => a.mtime - b.mtime);
      
      const filesToRemove = logFiles.slice(0, logFiles.length - MAX_RUNTIME_LOG_FILES);
      
      for (const file of filesToRemove) {
        try {
          await fs.unlink(file.path);
          prunedCount++;
        } catch {
          // Ignore failures; next rotation will retry.
        }
      }
    }

    if (prunedCount > 0) {
      info(`Runtime cache rotation complete. Pruned ${prunedCount} old log files.`, "heartbeat");
    }
    return { pruned: prunedCount, remaining: logFiles.length - prunedCount };

  } catch (err) {
    if (err.code === 'ENOENT') {
      // The runtime_logs directory doesn't exist yet, which is fine.
      return { pruned: 0, remaining: 0 };
    }
    warn(`Runtime cache rotation failed: ${err.message}`, "heartbeat");
    captureError(err, "heartbeat");
    throw err; // Let the job runner catch it
  }
}

// ──────────────────────────────────────────────────────────────
// Core heartbeat task
// ──────────────────────────────────────────────────────────────
async function coreHeartbeat() {
  const uptime = os.uptime();
  const load = os.loadavg()[0].toFixed(2);
  const mem = (os.freemem() / os.totalmem()).toFixed(2);
  const status = { uptime, load, mem, jobs: jobs.size };

  audit("heartbeat_tick", status, "heartbeat");
  info(`Heartbeat OK | uptime=${uptime}s | load=${load} | freeMem=${mem}`, "heartbeat");

  if (load > 2.0) {
    warn(`System load high: ${load}`, "heartbeat");
  }

  try {
    await verifyIntegrity();
  } catch (err) {
    captureError(err, "heartbeat");
    error(`Integrity check failed: ${err.message}`, "heartbeat");
  }

  try {
    await runPruner();
  } catch (err) {
    captureError(err, "heartbeat");
    warn(`Pruner failed: ${err.message}`, "heartbeat");
  }

  return status;
}

// ──────────────────────────────────────────────────────────────
// Scheduler control
// ──────────────────────────────────────────────────────────────
export function startScheduler() {
  if (running) {
    warn("Scheduler already running", "heartbeat");
    return false;
  }
  running = true;

  // Register the existing core job
  registerJob("coreHeartbeat", coreHeartbeat, DEFAULT_INTERVAL);
  
  // [NEW] Batch 7: Register the new rotation job to run once per hour
  registerJob("runtimeCacheRotation", rotateRuntimeCache, ROTATION_JOB_INTERVAL);

  audit("scheduler_started", { jobCount: jobs.size }, "heartbeat");
  info(`Heartbeat scheduler started with ${jobs.size} jobs`, "heartbeat");
  return true;
}

export function stopScheduler() {
  if (!running) return false;
  for (const name of jobs.keys()) {
    unregisterJob(name);
  }
  running = false;
  audit("scheduler_stopped", {}, "heartbeat");
  info("Scheduler stopped", "heartbeat");
  return true;
}

// ──────────────────────────────────────────────────────────────
// Manual triggers + diagnostics
// ──────────────────────────────────────────────────────────────
export async function triggerJob(name) {
  if (!jobs.has(name)) throw new Error(`Job "${name}" not found`);
  try {
    const result = await jobs.get(name).fn();
    audit("job_triggered", { name, result }, "heartbeat");
    info(`Triggered job ${name}`, "heartbeat");
    return result;
  } catch (err) {
    captureError(err, "heartbeat");
    error(`Manual trigger failed: ${err.message}`, "heartbeat");
    throw err;
  }
}

export async function runDiagnostics() {
  const uptime = os.uptime();
  const jobList = listJobs();
  const summary = {
    uptime,
    jobCount: jobList.length,
    lastRun: Math.max(...jobList.map((j) => j.lastRun || 0), 0),
  };

  audit("scheduler_diagnostics", summary, "heartbeat");
  info(`Diagnostics complete (${jobList.length} jobs active)`, "heartbeat");
  return summary;
}

// ──────────────────────────────────────────────────────────────
// Auto restart protection
// ──────────────────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  captureError(err, "heartbeat");
  error(`Uncaught exception: ${err.message}`, "heartbeat");
});

process.on("unhandledRejection", (reason) => {
  captureError(reason, "heartbeat");
  error(`Unhandled rejection: ${reason}`, "heartbeat");
});

// ──────────────────────────────────────────────────────────────
// Export unified interface
// ──────────────────────────────────────────────────────────────
export default {
  registerJob,
  unregisterJob,
  listJobs,
  triggerJob,
  startScheduler,
  stopScheduler,
  runDiagnostics,
};
