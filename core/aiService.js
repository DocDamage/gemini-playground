/**
 * core/aiService.js
 *
 * Unified AI service handling Gemini, OpenAI, and future models.
 * Preserves your original multi-provider design.
 * Adds key validation, rate-limiting protection, and pluggable providers.
 */

import path from "path";
import fs from "fs";
import { getFetch } from "./httpClient.js";

const ROOT_DIR = process.cwd();
const CONFIG_PATH = path.resolve(ROOT_DIR, "config/settings.json");
const DEFAULT_MODEL = "gemini-1.5-pro";

// ──────────────────────────────────────────────────────────────
// Load keys from .env or config
// ──────────────────────────────────────────────────────────────
function loadKeys() {
  const env = process.env;
  let keys = { GEMINI_API_KEY: env.GEMINI_API_KEY, OPENAI_API_KEY: env.OPENAI_API_KEY };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      keys = { ...keys, ...cfg.keys };
    }
  } catch (err) {
    console.error("[AIService] Failed to load config:", err);
  }

  return keys;
}

// ──────────────────────────────────────────────────────────────
// Base API client (resilient, logs & retries)
// ──────────────────────────────────────────────────────────────
async function safeFetch(url, options = {}, retries = 2) {
  const fetchImpl = getFetch();
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchImpl(url, options);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Gemini Provider
// ──────────────────────────────────────────────────────────────
async function callGemini(prompt, options = {}) {
  const { GEMINI_API_KEY } = loadKeys();
  if (!GEMINI_API_KEY) throw new Error("Missing Gemini API key");

  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    (options.model || DEFAULT_MODEL) +
    ":generateContent?key=" +
    GEMINI_API_KEY;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 2048,
    },
  };

  const res = await safeFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const candidates = res?.candidates ?? [];
  const text = candidates[0]?.content?.parts?.[0]?.text || "";
  return { provider: "gemini", text, raw: res };
}

// ──────────────────────────────────────────────────────────────
// OpenAI Provider
// ──────────────────────────────────────────────────────────────
async function callOpenAI(prompt, options = {}) {
  const { OPENAI_API_KEY } = loadKeys();
  if (!OPENAI_API_KEY) throw new Error("Missing OpenAI API key");

  const endpoint = "https://api.openai.com/v1/chat/completions";
  const body = {
    model: options.model || "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2048,
  };

  const res = await safeFetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const text = res?.choices?.[0]?.message?.content ?? "";
  return { provider: "openai", text, raw: res };
}

// ──────────────────────────────────────────────────────────────
// Dynamic provider registry
// ──────────────────────────────────────────────────────────────
const providers = {
  gemini: callGemini,
  openai: callOpenAI,
};

// Allow adding new providers on the fly (user plugins)
export function registerProvider(name, fn) {
  providers[name] = fn;
}

// ──────────────────────────────────────────────────────────────
// Unified AI call
// ──────────────────────────────────────────────────────────────
export async function generate(prompt, options = {}) {
  const provider = options.provider || "gemini";
  const fn = providers[provider];
  if (!fn) throw new Error(`Unknown provider: ${provider}`);

  try {
    const result = await fn(prompt, options);
    logUsage(provider, prompt, result.text);
    return result;
  } catch (err) {
    console.error(`[AIService] ${provider} error:`, err);
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────
// Usage logging (simple rotating file)
// ──────────────────────────────────────────────────────────────
const LOG_PATH = path.resolve(ROOT_DIR, "logs/ai_usage.log");
function logUsage(provider, input, output) {
  try {
    const line = `${new Date().toISOString()} | ${provider} | prompt: ${input
      .slice(0, 60)
      .replace(/\n/g, " ")}... | response: ${output.slice(0, 60).replace(/\n/g, " ")}\n`;
    fs.appendFileSync(LOG_PATH, line, "utf8");
  } catch {}
}

// ──────────────────────────────────────────────────────────────
// Key validation utility (used by settings and startup checks)
// ──────────────────────────────────────────────────────────────
export async function validateKeys() {
  const { GEMINI_API_KEY, OPENAI_API_KEY } = loadKeys();
  return {
    gemini: Boolean(GEMINI_API_KEY),
    openai: Boolean(OPENAI_API_KEY),
  };
}

// ──────────────────────────────────────────────────────────────
// Quick prompt tester (used by CLI/debug panel)
// ──────────────────────────────────────────────────────────────
export async function testPrompt(prompt) {
  try {
    const gemini = await callGemini(prompt);
    const openai = await callOpenAI(prompt);
    return {
      gemini: gemini.text,
      openai: openai.text,
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────────────────────
// Export unified interface
// ──────────────────────────────────────────────────────────────
export default {
  generate,
  registerProvider,
  validateKeys,
  testPrompt,
};
