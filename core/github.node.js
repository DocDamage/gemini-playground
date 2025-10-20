/**
 * core/github.node.js
 *
 * Node.js implementation of GitHub integration module
 *
 * This file contains the full Node.js implementation with access to:
 *   - Node builtin modules (fs, path, crypto)
 *   - OAuth token management
 *   - Repo creation and cloning
 *   - File commit/push logic
 *   - Gist import/export
 *   - Token validation + caching
 *   - Retry + timeout logic
 *   - Audit + alerts integration
 *   - Commit safety and rollback handling
 *
 * This file is loaded by core/github.js when running in Node.js environment.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { record as audit } from "./audit.js";
import { info, warn, error } from "./alerts.js";
import { captureError } from "./autoReporter.js";
import { tryGetFetch } from "./httpClient.js";

const CONFIG_PATH = path.resolve("./config/github.json");
const CACHE_DIR = path.resolve("./cache/github");
const API_BASE = "https://api.github.com";
const TIMEOUT_MS = 15000;
const RETRY_LIMIT = 3;

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ──────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────
function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

let { githubToken, githubUser } = getConfig();

// ──────────────────────────────────────────────────────────────
// HTTP utility
// ──────────────────────────────────────────────────────────────
async function request(url, method = "GET", body = null, retry = 0) {
  const fetchImpl = tryGetFetch();
  if (!fetchImpl) {
    const err = new Error("Global fetch API is not available in this environment.");
    captureError(err, "github");
    throw err;
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = setTimeout(() => {
    if (controller) controller.abort();
  }, TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `token ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        "User-Agent": "Gemini-Playground",
      },
      body: body ? JSON.stringify(body) : null,
      signal: controller?.signal,
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${txt}`);
    }

    const contentLength = response.headers.get("content-length");
    if (response.status === 204 || contentLength === "0") {
      return null;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    const normalizedError =
      err && typeof err === "object" && err.name === "AbortError"
        ? new Error("GitHub request timed out")
        : err instanceof Error
        ? err
        : new Error(String(err));

    if (retry < RETRY_LIMIT) {
      warn(`Retrying GitHub request: ${url} (${retry + 1})`, "github");
      return request(url, method, body, retry + 1);
    }
    captureError(normalizedError, "github");
    error(`GitHub request failed: ${normalizedError.message}`, "github");
    throw normalizedError;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ──────────────────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────────────────
export async function setToken(token) {
  githubToken = token;
  saveConfig({ githubToken, githubUser });
  audit("github_token_set", {}, "github");
  info("GitHub token updated", "github");
  return validateToken();
}

export async function validateToken() {
  if (!githubToken) throw new Error("GitHub token missing");
  try {
    const user = await request(`${API_BASE}/user`);
    githubUser = user.login;
    saveConfig({ githubToken, githubUser });
    audit("github_token_valid", { user: githubUser }, "github");
    info(`Authenticated as ${githubUser}`, "github");
    return githubUser;
  } catch (err) {
    captureError(err, "github");
    error(`Token validation failed: ${err.message}`, "github");
    throw err;
  }
}

export function getUser() {
  return githubUser || null;
}

export function getUserSync() {
  if (githubUser) return githubUser;
  // Try to read from config synchronously
  try {
    const config = getConfig();
    return config.githubUser || null;
  } catch {
    return null;
  }
}

export function getStoredToken() {
  return githubToken || null;
}

export async function createOrUpdateGist(id, filename, content, description = "", isPublic = false) {
  if (id) {
    return updateGist(id, filename, content);
  } else {
    return createGist(filename, content, description, isPublic);
  }
}

// ──────────────────────────────────────────────────────────────
// Repository handling
// ──────────────────────────────────────────────────────────────
export async function createRepo(name, isPrivate = true, description = "") {
  if (!githubToken) throw new Error("Missing GitHub token");
  const payload = { name, private: isPrivate, description };

  const repo = await request(`${API_BASE}/user/repos`, "POST", payload);
  audit("repo_created", { name, private: isPrivate }, "github");
  info(`Created repo ${repo.full_name}`, "github");
  return repo;
}

export async function listRepos() {
  const repos = await request(`${API_BASE}/user/repos?per_page=100`);
  audit("repos_listed", { count: repos.length }, "github");
  return repos;
}

export async function getRepo(owner, repo) {
  const data = await request(`${API_BASE}/repos/${owner}/${repo}`);
  audit("repo_fetched", { repo }, "github");
  return data;
}

export async function deleteRepo(owner, repo) {
  await request(`${API_BASE}/repos/${owner}/${repo}`, "DELETE");
  audit("repo_deleted", { repo }, "github");
  warn(`Deleted repo ${owner}/${repo}`, "github");
  return true;
}

// ──────────────────────────────────────────────────────────────
// File handling (commit/push)
// ──────────────────────────────────────────────────────────────
async function getFileSha(owner, repo, pathInRepo, branch = "main") {
  try {
    const res = await request(
      `${API_BASE}/repos/${owner}/${repo}/contents/${pathInRepo}?ref=${branch}`
    );
    return res.sha;
  } catch {
    return null;
  }
}

export async function commitFile(owner, repo, pathInRepo, content, message, branch = "main") {
  if (!githubToken) throw new Error("Missing GitHub token");
  const encoded = Buffer.from(content, "utf8").toString("base64");
  const sha = await getFileSha(owner, repo, pathInRepo, branch);
  const body = { message, content: encoded, branch };
  if (sha) body.sha = sha;

  const res = await request(`${API_BASE}/repos/${owner}/${repo}/contents/${pathInRepo}`, "PUT", body);
  audit("file_committed", { owner, repo, path: pathInRepo }, "github");
  info(`Committed ${pathInRepo} to ${repo}`, "github");
  return res;
}

// ──────────────────────────────────────────────────────────────
// Gists
// ──────────────────────────────────────────────────────────────
export async function createGist(filename, content, description = "", isPublic = false) {
  const body = {
    description,
    public: isPublic,
    files: {
      [filename]: { content },
    },
  };

  const res = await request(`${API_BASE}/gists`, "POST", body);
  audit("gist_created", { filename, id: res.id }, "github");
  info(`Created gist ${res.id}`, "github");
  return res;
}

export async function updateGist(id, filename, content) {
  const body = {
    files: {
      [filename]: { content },
    },
  };
  const res = await request(`${API_BASE}/gists/${id}`, "PATCH", body);
  audit("gist_updated", { id, filename }, "github");
  info(`Updated gist ${id}`, "github");
  return res;
}

export async function getGist(id) {
  const res = await request(`${API_BASE}/gists/${id}`);
  audit("gist_fetched", { id }, "github");
  return res;
}

export async function deleteGist(id) {
  await request(`${API_BASE}/gists/${id}`, "DELETE");
  audit("gist_deleted", { id }, "github");
  warn(`Deleted gist ${id}`, "github");
  return true;
}

// ──────────────────────────────────────────────────────────────
// Local sync helpers
// ──────────────────────────────────────────────────────────────
export function cacheCommit(owner, repo, file, content) {
  const key = crypto.createHash("sha256").update(`${owner}/${repo}/${file}`).digest("hex");
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ owner, repo, file, content, date: new Date().toISOString() }, null, 2));
  audit("commit_cached", { file }, "github");
  info(`Cached commit for ${file}`, "github");
  return filePath;
}

export function listCachedCommits() {
  return fs
    .readdirSync(CACHE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), "utf8")));
}

export async function flushCachedCommits() {
  const cached = listCachedCommits();
  let successCount = 0;

  for (const entry of cached) {
    try {
      await commitFile(entry.owner, entry.repo, entry.file, entry.content, "Sync cached commit");
      fs.unlinkSync(path.join(CACHE_DIR, `${crypto.createHash("sha256").update(`${entry.owner}/${entry.repo}/${entry.file}`).digest("hex")}.json`));
      successCount++;
    } catch (err) {
      captureError(err, "github");
      warn(`Failed to flush cached commit for ${entry.file}: ${err.message}`, "github");
    }
  }

  audit("commits_flushed", { count: successCount }, "github");
  info(`Flushed ${successCount} cached commits`, "github");
  return successCount;
}

// ──────────────────────────────────────────────────────────────
// Export unified interface
// ──────────────────────────────────────────────────────────────
export default {
  setToken,
  validateToken,
  getUser,
  getUserSync,
  getStoredToken,
  createRepo,
  listRepos,
  getRepo,
  deleteRepo,
  commitFile,
  createGist,
  updateGist,
  getGist,
  deleteGist,
  createOrUpdateGist,
  cacheCommit,
  listCachedCommits,
  flushCachedCommits,
};
