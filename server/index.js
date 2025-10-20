/**
 * index.js
 *
 * Gemini Playground main server entry.
 *
 * Starts backend services, initializes schedulers, and integrates all core systems:
 * - Heartbeat / Pruner / Replica Integrity
 * - Reporting and Audit
 * - Plugin Loader
 * - Safe startup and shutdown handling
 *
 * BATCH 1 MODIFICATION:
 * - Added imports for new core modules: archive, webFetch.
 * - Added new API routes: /archive/*, /web/fetch, /metrics.
 */

import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";

import { startScheduler, stopScheduler } from "../core/heartbeatScheduler.js";
import { runPruner } from "../core/pruner.js";
import { verifyIntegrity } from "../core/replicaCheck.js";
import { generateReport } from "../core/report.js";
import { info, warn, error } from "../core/alerts.js";
// DOC_MANUAL_OVERRIDE_START
// Switched to default import as per original file's audit.js export pattern
import auditModule from "../core/audit.js";
const { record: audit } = auditModule;
// DOC_MANUAL_OVERRIDE_END
import pluginManager from "../core/pluginManager.js";
import { captureError } from "../core/autoReporter.js";

// --- Batch 1 Imports ---
import * as archive from "../core/archive.js";
import { fetchURL } from "../core/webFetch.js";
// -------------------------

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5173;
const HOST = process.env.HOST || "0.0.0.0";
const LOGS_DIR = path.resolve("./logs"); // Added for /metrics route

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────────────────────
// Server metadata
// ──────────────────────────────────────────────────────────────
const serverMeta = {
  startedAt: new Date().toISOString(),
  environment: process.env.NODE_ENV || "development",
  pid: process.pid,
};

// Ensure logs directory
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// ──────────────────────────────────────────────────────────────
// Health / status routes
// ──────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), startedAt: serverMeta.startedAt });
});

app.get("/report", async (_req, res) => {
  try {
    const report = await generateReport();
    res.json({ ok: true, report });
  } catch (err) {
    captureError(err, "server");
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// [NEW] Batch 1: Metrics routes
// ──────────────────────────────────────────────────────────────
app.get("/metrics", async (_req, res) => {
  try {
    // Spec 11.5 mentions reading from summary.json, but that's
    // created by report.js in a later batch.
    // For Batch 1, we'll provide the raw list of runtime logs.
    const runtimeLogDir = path.join(LOGS_DIR, "runtime_logs");
    if (!fs.existsSync(runtimeLogDir)) {
      return res.json({ ok: true, metrics: { runtimeLogs: 0, files: [] } });
    }
    const files = await fs.promises.readdir(runtimeLogDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    res.json({ ok: true, metrics: { runtimeLogs: jsonFiles.length, files: jsonFiles } });
  } catch (err) {
    captureError(err, "server");
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// [NEW] Batch 1: Archive routes
// ──────────────────────────────────────────────────────────────
app.get("/archive/list", async (_req, res) => {
  try {
    const files = await archive.listArchives();
    res.json({ ok: true, data: files });
  } catch (err) {
    captureError(err, "server");
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/archive/create", async (req, res) => {
  try {
    const { projectPath } = req.body;
    if (!projectPath) {
      return res.status(400).json({ ok: false, error: "Missing 'projectPath' in body." });
    }
    const archivePath = await archive.createArchive(projectPath);
    res.json({ ok: true, data: { path: archivePath } });
  } catch (err) {
    captureError(err, "server");
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/archive/extract", async (req, res) => {
  try {
    const { zipName, targetPath } = req.body;
    if (!zipName || !targetPath) {
      return res.status(400).json({ ok: false, error: "Missing 'zipName' or 'targetPath' in body." });
    }
    await archive.extractArchive(zipName, targetPath);
    res.json({ ok: true, data: { message: "Extraction complete." } });
  } catch (err) {
    captureError(err, "server");
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// [NEW] Batch 1: Web Fetch routes
// ──────────────────────────────────────────────────────────────
app.post("/web/fetch", async (req, res) => {
  try {
    const { url, options, fetchConfig } = req.body;
    if (!url) {
      return res.status(400).json({ ok: false, error: "Missing 'url' in body." });
    }
    // We call fetchURL, but we don't return the raw Response object.
    // We read its data and send it back as JSON.
    const response = await fetchURL(url, options, fetchConfig);
    const responseData = await response.json(); // Assuming JSON response for now
    
    res.json({
      ok: true,
      data: responseData,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (err) {
    captureError(err, "server");
    res.status(500).json({ ok: false, error: err.message });
  }
});


// ──────────────────────────────────────────────────────────────
// Plugin manager routes
// ──────────────────────────────────────────────────────────────
app.get("/plugins", async (_req, res) => {
  try {
    const list = await pluginManager.listPlugins();
    res.json({ ok: true, plugins: list });
  } catch (err) {
    captureError(err, "server");
    res.status(500).json({ error: err.message });
  }
});

app.post("/plugins/reload", async (_req, res) => {
  try {
    await pluginManager.reloadPlugins();
    res.json({ ok: true });
  } catch (err) {
    captureError(err, "server");
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// Initialization sequence
// ──────────────────────────────────────────────────────────────
async function initialize() {
  try {
    info("Initializing Gemini Playground backend...", "server");

    // 1. Verify replicas before scheduler starts
    await verifyIntegrity();
    info("Replica integrity verified.", "server");

    // 2. Run first cleanup
    await runPruner();
    info("Initial pruning complete.", "server");

    // 3. Load plugins
    await pluginManager.init();
    info("Plugins loaded.", "server");

    // 4. Start heartbeat scheduler
    startScheduler();
    info("Heartbeat scheduler started.", "server");

    // 5. Log and audit startup
    audit("server_started", { port: PORT, pid: process.pid }, "server");
    info(`Gemini Playground started on http://${HOST}:${PORT}`, "server");
  } catch (err) {
    captureError(err, "server");
    error(`Startup failed: ${err.message}`, "server");
    process.exit(1);
  }
}

// ──────────────────────────────────────────────────────────────
// Graceful shutdown
// ──────────────────────────────────────────────────────────────
async function shutdown(signal = "SIGTERM") {
  warn(`Received ${signal}, shutting down gracefully...`, "server");
  try {
    stopScheduler();
    await generateReport({ includeSystem: true });
    audit("server_stopped", { signal }, "server");
    info("Final report generated; exiting cleanly.", "server");
    process.exit(0);
  } catch (err) {
    captureError(err, "server");
    error(`Error during shutdown: ${err.message}`, "server");
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ──────────────────────────────────────────────────────────────
// Renderer detection (Vite / Electron hybrid support)
// ──────────────────────────────────────────────────────────────
function detectRenderer() {
  const isElectron = !!process.versions.electron;
  const hasVite = fs.existsSync("./vite.config.js");
  return { isElectron, hasVite };
}

const renderer = detectRenderer();
if (renderer.isElectron) {
  info("Running under Electron environment.", "server");
} else if (renderer.hasVite) {
  info("Detected Vite renderer; dev server mode active.", "server");
} else {
  warn("No renderer detected — backend-only mode.", "server");
}

// ──────────────────────────────────────────────────────────────
// Static and fallback routes
// ──────────────────────────────────────────────────────────────
const publicDir = path.resolve("./public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  info("Serving static files from /public", "server");
}

app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
});

// ──────────────────────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────────────────────
app.listen(PORT, HOST, async () => {
  await initialize();
});