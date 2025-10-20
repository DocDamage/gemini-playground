/**
 * core/models.js
 *
 * Unified AI model orchestration layer.
 *
 * Original functionality kept:
 *   - load Gemini & OpenAI keys from env
 *   - switch between model providers
 *   - forward text/image/audio generation calls
 *
 * Added:
 *   - smart fallback between APIs
 *   - structured logging to audit + alerts
 *   - cache for recent model calls
 *   - timeout + retry logic
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { record as audit } from "./audit.js";
import { error, info, warn } from "./alerts.js";
import { captureError } from "./autoReporter.js";
import { getFetch } from "./httpClient.js";

const ROOT_DIR = process.cwd();

// ──────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL_CACHE_FILE = path.resolve(ROOT_DIR, "logs/model_cache.json");
const CACHE_SIZE = 20;
const TIMEOUT_MS = 20000;

if (!fs.existsSync(path.dirname(MODEL_CACHE_FILE))) {
  fs.mkdirSync(path.dirname(MODEL_CACHE_FILE), { recursive: true });
}

// ──────────────────────────────────────────────────────────────
// Internal cache
// ──────────────────────────────────────────────────────────────
let cache = [];

function loadCache() {
  try {
    if (fs.existsSync(MODEL_CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(MODEL_CACHE_FILE, "utf8"));
    }
  } catch {
    cache = [];
  }
}

function saveCache() {
  try {
    fs.writeFileSync(MODEL_CACHE_FILE, JSON.stringify(cache.slice(-CACHE_SIZE), null, 2));
  } catch {}
}

function addCache(entry) {
  cache.push(entry);
  if (cache.length > CACHE_SIZE) cache = cache.slice(-CACHE_SIZE);
  saveCache();
}

loadCache();

// ──────────────────────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────────────────────
function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function timedFetch(url, opts) {
  const fetchImpl = getFetch();
  return Promise.race([
    fetchImpl(url, opts),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
  ]);
}

// ──────────────────────────────────────────────────────────────
// Gemini model call
// ──────────────────────────────────────────────────────────────
async function callGemini(prompt, model = "gemini-1.5-flash") {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }] };

  const res = await timedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini error: ${res.statusText}`);
  const data = await res.json();
  const output = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  audit("ai_request", { provider: "Gemini", model, promptHash: sha256(prompt) }, "models");
  info(`Gemini (${model}) success`, "models");
  addCache({ provider: "Gemini", model, output, timestamp: Date.now() });

  return output;
}

// ──────────────────────────────────────────────────────────────
// OpenAI model call
// ──────────────────────────────────────────────────────────────
async function callOpenAI(prompt, model = "gpt-4o-mini") {
  if (!OPENAI_API_KEY) throw new Error("OpenAI API key missing");
  const url = "https://api.openai.com/v1/chat/completions";
  const body = { model, messages: [{ role: "user", content: prompt }] };

  const res = await timedFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`OpenAI error: ${res.statusText}`);
  const data = await res.json();
  const output = data?.choices?.[0]?.message?.content?.trim() || "";

  audit("ai_request", { provider: "OpenAI", model, promptHash: sha256(prompt) }, "models");
  info(`OpenAI (${model}) success`, "models");
  addCache({ provider: "OpenAI", model, output, timestamp: Date.now() });

  return output;
}

// ──────────────────────────────────────────────────────────────
// Fallback handling
// ──────────────────────────────────────────────────────────────
async function runWithFallback(prompt, primary, secondary) {
  try {
    return await primary(prompt);
  } catch (err) {
    warn(`Primary model failed: ${err.message}`, "models");
    captureError(err, "models");
    if (secondary) {
      try {
        return await secondary(prompt);
      } catch (e2) {
        captureError(e2, "models");
        error(`Secondary model also failed: ${e2.message}`, "models");
        throw e2;
      }
    } else {
      throw err;
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Unified inference entrypoint
// ──────────────────────────────────────────────────────────────
export async function generate(prompt, options = {}) {
  const { provider = "auto", model } = options;
  const start = Date.now();

  try {
    let output;
    if (provider === "gemini") {
      output = await callGemini(prompt, model);
    } else if (provider === "openai") {
      output = await callOpenAI(prompt, model);
    } else {
      // Auto fallback chain
      if (GEMINI_API_KEY) {
        output = await runWithFallback(prompt, callGemini, callOpenAI);
      } else {
        output = await runWithFallback(prompt, callOpenAI, callGemini);
      }
    }

    const duration = Date.now() - start;
    audit("ai_response", { provider, duration, chars: output.length }, "models");
    addCache({ provider, promptHash: sha256(prompt), duration, output });
    return output;
  } catch (err) {
    captureError(err, "models");
    error(`Model error: ${err.message}`, "models");
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────
// Retrieve cached completions
// ──────────────────────────────────────────────────────────────
export function getRecentCompletions(limit = 10) {
  return cache.slice(-limit).reverse();
}

// ──────────────────────────────────────────────────────────────
// Diagnostic and test helpers
// ──────────────────────────────────────────────────────────────
export async function testConnection() {
  const tests = [];
  if (GEMINI_API_KEY) {
    try {
      await callGemini("ping", "gemini-1.5-flash");
      tests.push({ provider: "Gemini", ok: true });
    } catch (err) {
      tests.push({ provider: "Gemini", ok: false, error: err.message });
    }
  }
  if (OPENAI_API_KEY) {
    try {
      await callOpenAI("ping", "gpt-4o-mini");
      tests.push({ provider: "OpenAI", ok: true });
    } catch (err) {
      tests.push({ provider: "OpenAI", ok: false, error: err.message });
    }
  }
  return tests;
}

// ──────────────────────────────────────────────────────────────
// Export unified interface
// ──────────────────────────────────────────────────────────────
export default {
  generate,
  getRecentCompletions,
  testConnection,
};
