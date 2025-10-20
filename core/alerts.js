/**
 * core/alerts.js
 *
 * Central alert/notification system.
 * Original behavior preserved:
 * - console + log output
 * - integration hooks for UI toasts
 * Adds:
 * - severity levels
 * - webhook dispatch
 * - spam cooldown system
 * - file-backed history
 *
 * BATCH 1 MODIFICATION:
 * - Added explicit convenience functions `runtime()` and `sandbox()`
 * to provide dedicated channels for those sources, as required
 * by the build plan.
 */

import fs from "fs";
import path from "path";
import { tryGetFetch } from "./httpClient.js";

const ROOT_DIR = process.cwd();
const LOGS_DIR = path.resolve(ROOT_DIR, "logs");
const ALERT_LOG = path.join(LOGS_DIR, "alerts.log");
const HISTORY_FILE = path.join(LOGS_DIR, "alertHistory.json");

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// ──────────────────────────────────────────────────────────────
// Internal state
// ──────────────────────────────────────────────────────────────
const cooldowns = new Map(); // key: message, value: lastTime
const COOLDOWN_MS = 60 * 1000; // 1 minute
const MAX_HISTORY = 200;

// ──────────────────────────────────────────────────────────────
// Logging helper
// ──────────────────────────────────────────────────────────────
function log(line) {
  const text = `[${new Date().toISOString()}] ${line}\n`;
  fs.appendFileSync(ALERT_LOG, text, "utf8");
  console.log("[Alert]", line);
}

// ──────────────────────────────────────────────────────────────
// Save alert to persistent history
// ──────────────────────────────────────────────────────────────
function saveToHistory(alert) {
  let history = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    }
  } catch {
    history = [];
  }

  history.unshift(alert);
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// ──────────────────────────────────────────────────────────────
// Cooldown guard
// ──────────────────────────────────────────────────────────────
function withinCooldown(msg) {
  const now = Date.now();
  const last = cooldowns.get(msg) || 0;
  if (now - last < COOLDOWN_MS) return true;
  cooldowns.set(msg, now);
  return false;
}

// ──────────────────────────────────────────────────────────────
// Webhook sender (optional, for external alerts)
// ──────────────────────────────────────────────────────────────
async function sendWebhook(alert) {
  const webhookURL = process.env.ALERT_WEBHOOK_URL;
  if (!webhookURL) return;

  const fetchImpl = tryGetFetch();
  if (!fetchImpl) {
    log("Webhook skipped: fetch API unavailable.");
    return;
  }

  try {
    await fetchImpl(webhookURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alert),
    });
  } catch (err) {
    log(`Webhook error: ${err.message}`);
  }
}

// ──────────────────────────────────────────────────────────────
// Alert creation
// ──────────────────────────────────────────────────────────────
export function createAlert(message, level = "info", source = "system") {
  if (withinCooldown(`${source}:${message}`)) return null;

  const alert = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    level, // "info" | "warn" | "error" | "critical"
    message,
    source,
  };

  log(`${level.toUpperCase()} [${source}] ${message}`);
  saveToHistory(alert);
  sendWebhook(alert);

  // Emit event to front-end if available (kept from original)
  if (globalThis.__onAlert) {
    try {
      globalThis.__onAlert(alert);
    } catch {}
  }

  return alert;
}

// ──────────────────────────────────────────────────────────────
// Public convenience helpers
// ──────────────────────────────────────────────────────────────
export function info(msg, src) {
  return createAlert(msg, "info", src);
}
export function warn(msg, src) {
  return createAlert(msg, "warn", src);
}
export function error(msg, src) {
  return createAlert(msg, "error", src);
}
export function critical(msg, src) {
  return createAlert(msg, "critical", src);
}

// ──────────────────────────────────────────────────────────────
// [NEW] Batch 1 Specific Channels
// ──────────────────────────────────────────────────────────────
/**
 * Creates an alert sourced from the Runtime Manager.
 * @param {string} msg - The alert message.
 * @param {'info'|'warn'|'error'|'critical'} [level='info'] - The severity level.
 */
export function runtime(msg, level = 'info') {
  return createAlert(msg, level, 'runtime');
}

/**
 * Creates an alert sourced from the Sandbox.
 * @param {string} msg - The alert message.
 * @param {'info'|'warn'|'error'|'critical'} [level='warn'] - The severity level.
 */
export function sandbox(msg, level = 'warn') {
  return createAlert(msg, level, 'sandbox');
}

// ──────────────────────────────────────────────────────────────
// Retrieve recent alerts
// ──────────────────────────────────────────────────────────────
export function getRecent(limit = 50) {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    return history.slice(0, limit);
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────
// Clear alerts (manual reset)
// ──────────────────────────────────────────────────────────────
export function clearHistory() {
  fs.writeFileSync(HISTORY_FILE, "[]", "utf8");
  log("Alert history cleared.");
}

// ──────────────────────────────────────────────────────────────
// Export unified interface
// ──────────────────────────────────────────────────────────────
export default {
  createAlert,
  info,
  warn,
  error,
  critical,
  runtime, // Added for Batch 1
  sandbox, // Added for Batch 1
  getRecent,
  clearHistory,
};
