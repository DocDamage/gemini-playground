/**
 * core/report.js
 *
 * Gemini Playground Reporting System
 * ----------------------------------
 * Generates JSON, text, and HTML reports of runtime state, audits, and alerts.
 * Can email reports (inline or as attachment) and include screenshots.
 * Safely rotates and compresses older reports.
 *
 * BATCH 7 MODIFICATION:
 * - Added 'readAiUsageTelemetry' to read from /logs/ai_usage.log.
 * - This function aggregates *both* general AI metrics and specific
 * 'voice' metrics, fulfilling the "Add voice metrics" task.
 * - Added AI & Voice Telemetry section to text and HTML report builders.
 */

import fs from "fs";
import path from "path";
import os from "os";
import zlib from "zlib";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

// DOC_MANUAL_OVERRIDE_START
// Switched to default import as per original file's audit.js export pattern
import auditModule from "./audit.js";
const { record: audit } = auditModule;
// DOC_MANUAL_OVERRIDE_END
import { info, warn, error } from "./alerts.js";
import { captureError } from "./autoReporter.js";
import { listJobs } from "./heartbeatScheduler.js";

dotenv.config();

const REPORT_DIR = path.resolve("./reports");
const SCREENSHOT_DIR = path.join(REPORT_DIR, "screenshots");
const LOGS_DIR = path.resolve("./logs"); // Centralize logs path
const AUDIT_INDEX_FILE = path.join(LOGS_DIR, "audit_index.json"); // Corrected path
const ALERTS_LOG_FILE = path.join(LOGS_DIR, "alerts.log"); // Explicit path
const RUNTIME_LOG_DIR = path.join(LOGS_DIR, "runtime_logs"); // Batch 2 new path
const AI_USAGE_LOG_FILE = path.join(LOGS_DIR, "ai_usage.log"); // [NEW] Batch 7

const MAX_HISTORY = 20;
const MAX_REPORT_SIZE = 15 * 1024 * 1024; // 15 MB

if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ──────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────
function safeWrite(filePath, data) {
  try {
    fs.writeFileSync(filePath, data);
    return true;
  } catch (err) {
    captureError(err, "report");
    error(`Write failed for ${filePath}: ${err.message}`, "report");
    return false;
  }
}

function rotateReports() {
  const files = fs
    .readdirSync(REPORT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f,
      path: path.join(REPORT_DIR, f),
      mtime: fs.statSync(path.join(REPORT_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length > MAX_HISTORY) {
    for (const file of files.slice(MAX_HISTORY)) {
      try {
        fs.rmSync(file.path, { force: true });
        info(`Old report pruned: ${file.name}`, "report");
      } catch (err) {
        captureError(err, "report");
      }
    }
  }
}

function getSystemStats() {
  const load = os.loadavg();
  const mem = os.totalmem();
  const free = os.freemem();
  const used = mem - free;
  return {
    uptime: os.uptime(),
    load,
    memory: { total: mem, free, used },
    platform: os.platform(),
    cpus: os.cpus().length,
    hostname: os.hostname(),
    jobs: listJobs ? listJobs() : [],
  };
}

function readJSONLog(file) {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function readTextLog(file, limit = 300) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  return lines.slice(-limit);
}

/**
 * [NEW] Batch 2: Reads and summarizes runtime telemetry.
 * @param {number} [limit=20] - Number of recent runs to include.
 * @returns {object|null} An object with telemetry stats.
 */
function readRuntimeTelemetry(limit = 20) {
  if (!fs.existsSync(RUNTIME_LOG_DIR)) return null;
  try {
    const files = fs.readdirSync(RUNTIME_LOG_DIR).filter(f => f.endsWith(".json"));
    let totalRuns = 0;
    let totalDuration = 0;
    let totalErrors = 0;
    const recentRuns = [];

    // Sort files by name (timestamp) descending to get recent
    files.sort().reverse(); 

    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(RUNTIME_LOG_DIR, file), "utf8");
        const run = JSON.parse(data);
        
        totalRuns++;
        totalDuration += run.duration || 0;
        if (!run.success) {
          totalErrors++;
        }
        
        if (recentRuns.length < limit) {
          recentRuns.push(run);
        }
      } catch { /* ignore corrupt log file */ }
    }

    return {
      totalRuns,
      totalDuration,
      totalErrors,
      avgDuration: totalRuns > 0 ? (totalDuration / totalRuns) : 0,
      recentRuns, // list of last {limit} full run objects
    };
  } catch (err) {
    captureError(err, "report");
    return null;
  }
}

/**
 * [NEW] Batch 7: Reads and summarizes AI and Voice telemetry.
 * Reads from ai_usage.log (Spec 4.2.1, 8.6)
 * @param {number} [limit=20] - Number of recent calls to include.
 * @returns {object|null} An object with telemetry stats.
 */
function readAiUsageTelemetry(limit = 20) {
  if (!fs.existsSync(AI_USAGE_LOG_FILE)) return null;
  try {
    const lines = fs.readFileSync(AI_USAGE_LOG_FILE, "utf8").split("\n").filter(Boolean);
    
    let totalCalls = 0;
    let totalLatency = 0;
    let totalErrors = 0;
    let voiceCalls = 0;
    let voiceLatency = 0;
    
    const recentCalls = [];
    const recentVoiceCalls = [];

    // Read from end of file for recent calls
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const call = JSON.parse(lines[i]);
        
        // Aggregate all AI calls
        totalCalls++;
        totalLatency += call.latency || 0;
        if (!call.success) {
          totalErrors++;
        }
        if (recentCalls.length < limit) {
          recentCalls.push(call);
        }

        // Aggregate voice-specific calls
        // We assume 'source: "voice"' is logged by aiService
        if (call.source === 'voice') {
          voiceCalls++;
          voiceLatency += call.latency || 0;
          if (recentVoiceCalls.length < limit) {
            recentVoiceCalls.push(call);
          }
        }
      } catch { /* ignore corrupt log line */ }
    }

    return {
      all: {
        totalCalls,
        totalErrors,
        avgLatency: totalCalls > 0 ? (totalLatency / totalCalls) : 0,
        recentCalls,
      },
      voice: {
        totalCalls: voiceCalls,
        avgLatency: voiceCalls > 0 ? (voiceLatency / voiceCalls) : 0,
        recentCalls: recentVoiceCalls,
      }
    };
  } catch (err) {
    captureError(err, "report");
    return null;
  }
}


function compressFile(file) {
  try {
    const data = fs.readFileSync(file);
    const gz = zlib.gzipSync(data);
    fs.writeFileSync(file + ".gz", gz);
    if (fs.statSync(file).size > MAX_REPORT_SIZE) fs.rmSync(file);
  } catch (err) {
    captureError(err, "report");
  }
}

// ──────────────────────────────────────────────────────────────
// Report Generators
// ──────────────────────────────────────────────────────────────
function buildTextReport(report) {
  let txt = `Gemini Playground Report\nGenerated: ${report.timestamp}\n\n`;
  if (report.system) {
    const s = report.system;
    txt += `System:\n  Host: ${s.hostname}\n  Uptime: ${s.uptime}s\n  Load: ${s.load
      .map((l) => l.toFixed(2))
      .join(", ")}\n  Memory: ${(s.memory.used / 1024 / 1024).toFixed(1)}MB / ${(s.memory.total / 1024 / 1024).toFixed(1)}MB\n\n`;
  }
  
  // [NEW] Batch 7: AI & Voice Telemetry Section
  if (report.ai) {
    const a = report.ai.all;
    const v = report.ai.voice;
    txt += `AI Telemetry (All):\n  Total Calls: ${a.totalCalls}\n  Total Errors: ${a.totalErrors}\n  Avg Latency: ${a.avgLatency.toFixed(0)}ms\n\n`;
    txt += `AI Telemetry (Voice):\n  Total Calls: ${v.totalCalls}\n  Avg Latency: ${v.avgLatency.toFixed(0)}ms\n\n`;
  }
  
  // [NEW] Batch 2: Runtime Telemetry Section
  if (report.runtime) {
    const r = report.runtime;
    txt += `Runtime Telemetry:\n  Total Runs: ${r.totalRuns}\n  Total Errors: ${r.totalErrors}\n  Avg Duration: ${r.avgDuration.toFixed(2)}ms\n\n`;
  }

  if (report.alerts && report.alerts.length)
    txt += `Recent Alerts (${report.alerts.length}):\n${report.alerts
      .map((a) => `- ${a}`)
      .join("\n")}\n\n`;
  if (report.audit && report.audit.length)
    txt += `Audit Entries (${report.audit.length}):\n${report.audit
      .slice(-10)
      .map((a) => `- ${a.type || "unknown"} (${a.timestamp || ""})`) // Corrected: a.event -> a.type
      .join("\n")}\n\n`;
  
  return txt;
}

function buildHTMLReport(report) {
  const s = report.system;
  const load = s ? s.load.map((l) => l.toFixed(2)).join(", ") : "n/a";
  const used = s ? (s.memory.used / 1024 / 1024).toFixed(1) : "?";
  const total = s ? (s.memory.total / 1024 / 1024).toFixed(1) : "?";

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Gemini Playground Report</title>
<style>
body { font-family: system-ui, sans-serif; margin: 20px; background: #f6f6f6; }
h1 { color: #222; }
section { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 0 4px rgba(0,0,0,0.1); }
table { width: 100%; border-collapse: collapse; }
td, th { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
</style>
</head>
<body>
<h1>Gemini Playground Report</h1>
<p><b>Generated:</b> ${report.timestamp}</p>

<section>
<h2>System</h2>
<p><b>Host:</b> ${s?.hostname || 'N/A'} | <b>Uptime:</b> ${s?.uptime || 0}s</p>
<p><b>Load:</b> ${load}</p>
<p><b>Memory:</b> ${used} MB / ${total} MB</p>
</section>

<div class="grid-2">
  <section>
    <h2>AI Telemetry (All)</h2>
    <p>
      <b>Total Calls:</b> ${report.ai?.all?.totalCalls || 0} | 
      <b>Total Errors:</b> ${report.ai?.all?.totalErrors || 0} | 
      <b>Avg Latency:</b> ${(report.ai?.all?.avgLatency || 0).toFixed(0)}ms
    </p>
    <h3>Recent AI Calls</h3>
    <table>
      <thead><tr><th>Provider</th><th>Latency (ms)</th><th>Success</th><th>Timestamp</th></tr></thead>
      <tbody>
      ${(report.ai?.all?.recentCalls || [])
        .map((r) => `<tr><td>${r.provider || 'N/A'}</td><td>${r.latency}</td><td>${r.success}</td><td>${r.timestamp}</td></tr>`)
        .join("") || '<tr><td colspan="4"><em>No AI events found.</em></td></tr>'}
      </tbody>
    </table>
  </section>

  <section>
    <h2>AI Telemetry (Voice)</h2>
    <p>
      <b>Total Calls:</b> ${report.ai?.voice?.totalCalls || 0} | 
      <b>Avg Latency:</b> ${(report.ai?.voice?.avgLatency || 0).toFixed(0)}ms
    </p>
    <h3>Recent Voice Calls</h3>
    <table>
      <thead><tr><th>Provider</th><th>Latency (ms)</th><th>Success</th><th>Timestamp</th></tr></thead>
      <tbody>
      ${(report.ai?.voice?.recentCalls || [])
        .map((r) => `<tr><td>${r.provider || 'N/A'}</td><td>${r.latency}</td><td>${r.success}</td><td>${r.timestamp}</td></tr>`)
        .join("") || '<tr><td colspan="4"><em>No voice events found.</em></td></tr>'}
      </tbody>
    </table>
  </section>
</div>

<section>
<h2>Runtime Telemetry</h2>
<p>
  <b>Total Runs:</b> ${report.runtime?.totalRuns || 0} | 
  <b>Total Errors:</b> ${report.runtime?.totalErrors || 0} | 
  <b>Avg Duration:</b> ${(report.runtime?.avgDuration || 0).toFixed(2)}ms
</p>
<h3>Recent Runs (Last ${report.runtime?.recentRuns?.length || 0})</h3>
<table>
<thead><tr><th>Lang</th><th>Duration (ms)</th><th>Success</th><th>Timestamp</th></tr></thead>
<tbody>
${(report.runtime?.recentRuns || [])
  .map((r) => `<tr><td>${r.lang}</td><td>${r.duration}</td><td>${r.success}</td><td>${r.timestamp}</td></tr>`)
  .join("") || '<tr><td colspan="4"><em>No runtime events found.</em></td></tr>'}
</tbody>
</table>
</section>

<section>
<h2>Recent Alerts</h2>
${(report.alerts || []).map((a) => `<div>⚠️ ${a}</div>`).join("") || "<em>None</em>"}
</section>

<section>
<h2>Audit Summary</h2>
<table>
<thead><tr><th>Event</th><th>Timestamp</th><th>Actor</th></tr></thead>
<tbody>
${(report.audit || [])
  .slice(-20)
  .map((a) => `<tr><td>${a.type || "?"}</td><td>${a.timestamp || ""}</td><td>${a.actor || "N/A"}</td></tr>`) // Corrected: a.event -> a.type
  .join("")}
</tbody>
</table>
</section>

</body>
</html>`;
}

// ──────────────────────────────────────────────────────────────
// Main generation + write
// ──────────────────────────────────────────────────────────────
export async function generateReport(opts = {}) {
  const {
    includeSystem = true,
    includeAudit = true,
    includeAlerts = true,
    includeRuntime = true, // Batch 2
    includeAi = true,      // [NEW] Batch 7
    includeScreenshots = true,
  } = opts;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `report-${timestamp}`;
  const jsonPath = path.join(REPORT_DIR, `${baseName}.json`);
  const htmlPath = path.join(REPORT_DIR, `${baseName}.html`);
  const txtPath = path.join(REPORT_DIR, `${baseName}.txt`);

  const system = includeSystem ? getSystemStats() : null;
  const auditLog = includeAudit ? readJSONLog(AUDIT_INDEX_FILE) : []; // Corrected path
  const alertsLog = includeAlerts ? readTextLog(ALERTS_LOG_FILE) : [];
  const runtimeStats = includeRuntime ? readRuntimeTelemetry() : null; // Batch 2
  const aiStats = includeAi ? readAiUsageTelemetry() : null; // [NEW] Batch 7

  const report = {
    timestamp,
    system,
    ai: aiStats, // [NEW] Batch 7
    runtime: runtimeStats,
    audit: auditLog,
    alerts: alertsLog,
  };

  // Write all versions
  safeWrite(jsonPath, JSON.stringify(report, null, 2));
  safeWrite(htmlPath, buildHTMLReport(report));
  safeWrite(txtPath, buildTextReport(report));
  rotateReports();

  // Compress JSON
  compressFile(jsonPath);

  audit("report_generated", { baseName }, "report");
  info(`Generated report set: ${baseName}`, "report");

  if (includeScreenshots) {
    const shots = fs.existsSync(SCREENSHOT_DIR)
      ? fs.readdirSync(SCREENSHOT_DIR).filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
      : [];
    if (shots.length) info(`Found ${shots.length} screenshots`, "report");
  }

  return { jsonPath, htmlPath, txtPath };
}

// ──────────────────────────────────────────────────────────────
// Email sending
// ──────────────────────────────────────────────────────────────
export async function emailReport({
  embedHTML = false,
  attachScreenshots = true,
  subject = "Gemini Playground Report",
  recipients = [],
} = {}) {
  try {
    const emailConfig = JSON.parse(fs.readFileSync("./config/email.json", "utf8"));
    const transport = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || emailConfig.host,
      port: process.env.EMAIL_PORT || emailConfig.port || 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER || emailConfig.user,
        pass: process.env.EMAIL_PASS || emailConfig.pass,
      },
    });

    const latest = fs
      .readdirSync(REPORT_DIR)
      .filter((f) => f.endsWith(".html"))
      .sort((a, b) => fs.statSync(path.join(REPORT_DIR, b)).mtimeMs - fs.statSync(path.join(REPORT_DIR, a)).mtimeMs)[0];

    if (!latest) throw new Error("No reports found to send.");

    const htmlContent = fs.readFileSync(path.join(REPORT_DIR, latest), "utf8");
    const textContent = fs.readFileSync(
      path.join(REPORT_DIR, latest.replace(".html", ".txt")),
      "utf8"
    );

    const attachments = [];
    if (!embedHTML) {
      attachments.push({
        filename: latest,
        path: path.join(REPORT_DIR, latest),
        contentType: "text/html",
      });
    }

    if (attachScreenshots && fs.existsSync(SCREENSHOT_DIR)) {
      const shots = fs.readdirSync(SCREENSHOT_DIR).filter((f) =>
        /\.(png|jpg|jpeg)$/i.test(f)
      );
      for (const shot of shots) {
        attachments.push({
          filename: shot,
          path: path.join(SCREENSHOT_DIR, shot),
          cid: shot,
        });
      }
    }

    const mailOptions = {
      from: emailConfig.from || process.env.EMAIL_FROM || "noreply@gemini.local",
      to: recipients.length ? recipients.join(",") : emailConfig.defaultRecipients.join(","),
      subject,
      text: textContent,
      html: embedHTML ? htmlContent : `<p>Report attached.</p>`,
      attachments,
    };

    await transport.sendMail(mailOptions);
    audit("report_emailed", { subject, recipients }, "report");
    info(`Report emailed to ${mailOptions.to}`, "report");
  } catch (err) {
    captureError(err, "report");
    error(`Email send failed: ${err.message}`, "report");
  }
}

// ──────────────────────────────────────────────────────────────
// Remote sync stub (safe placeholder)
// ──────────────────────────────────────────────────────────────
export async function syncReports(remoteFn) {
  if (typeof remoteFn !== "function") {
    warn("No remote sync function provided; skipping.", "report");
    return;
  }
  const reports = fs.readdirSync(REPORT_DIR).filter((f) => f.endsWith(".json"));
  for (const file of reports) {
    try {
      const data = fs.readFileSync(path.join(REPORT_DIR, file), "utf8");
      await remoteFn(file, data);
    } catch (err) {
      captureError(err, "report");
      warn(`Remote sync failed for ${file}: ${err.message}`, "report");
    }
  }
  info("Remote sync complete", "report");
}

// ──────────────────────────────────────────────────────────────
// Unified export
// ──────────────────────────────────────────────────────────────
export default {
  generateReport,
  emailReport,
  syncReports,
};
