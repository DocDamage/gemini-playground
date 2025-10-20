/**
 * core/github.js
 *
 * Environment-aware loader for GitHub integration module
 *
 * This file detects the runtime environment and dynamically imports the appropriate implementation:
 * - In Node.js (main/preload): imports core/github.node.js (full implementation with fs, path, crypto, node-fetch)
 * - In browser (renderer): would import renderer/shims/githubStub.ts (browser-safe stub)
 *
 * NO Node-only imports at module top-level to prevent Vite bundling issues.
 * All exports are async wrappers that delegate to the environment-specific implementation.
 */

// Environment detection
const isNode = typeof process !== 'undefined' && 
               process.versions != null && 
               process.versions.node != null;

let impl = null;

async function getImpl() {
  if (impl) return impl;
  
  if (isNode) {
    // In Node.js: use the full Node implementation
    impl = await import('./github.node.js');
  } else {
    // In browser: use the renderer stub
    impl = await import('../renderer/shims/githubStub.ts');
  }
  
  return impl;
}

// ──────────────────────────────────────────────────────────────
// Async wrappers for all exports
// ──────────────────────────────────────────────────────────────

export async function setToken(token) {
  const module = await getImpl();
  return module.setToken(token);
}

export async function validateToken() {
  const module = await getImpl();
  return module.validateToken();
}

export async function getUser() {
  const module = await getImpl();
  return module.getUser();
}

// Synchronous helper for Node.js callers (only available in Node)
export function getUserSync() {
  if (!isNode) {
    throw new Error('getUserSync is only available in Node.js environment');
  }
  // For sync access in Node, we need to ensure the module is already loaded
  if (!impl) {
    throw new Error('GitHub module not initialized. Call an async method first.');
  }
  return impl.getUserSync ? impl.getUserSync() : impl.getUser();
}

export async function createRepo(name, isPrivate = true, description = "") {
  const module = await getImpl();
  return module.createRepo(name, isPrivate, description);
}

export async function listRepos() {
  const module = await getImpl();
  return module.listRepos();
}

export async function getRepo(owner, repo) {
  const module = await getImpl();
  return module.getRepo(owner, repo);
}

export async function deleteRepo(owner, repo) {
  const module = await getImpl();
  return module.deleteRepo(owner, repo);
}

export async function commitFile(owner, repo, pathInRepo, content, message, branch = "main") {
  const module = await getImpl();
  return module.commitFile(owner, repo, pathInRepo, content, message, branch);
}

export async function createGist(filename, content, description = "", isPublic = false) {
  const module = await getImpl();
  return module.createGist(filename, content, description, isPublic);
}

export async function updateGist(id, filename, content) {
  const module = await getImpl();
  return module.updateGist(id, filename, content);
}

export async function createOrUpdateGist(id, filename, content) {
  const module = await getImpl();
  return module.createOrUpdateGist ? module.createOrUpdateGist(id, filename, content) : 
         (id ? module.updateGist(id, filename, content) : module.createGist(filename, content));
}

export async function getGist(id) {
  const module = await getImpl();
  return module.getGist(id);
}

export async function getStoredToken() {
  const module = await getImpl();
  return module.getStoredToken ? module.getStoredToken() : null;
}

export async function deleteGist(id) {
  const module = await getImpl();
  return module.deleteGist(id);
}

export async function cacheCommit(owner, repo, file, content) {
  const module = await getImpl();
  return module.cacheCommit(owner, repo, file, content);
}

export async function listCachedCommits() {
  const module = await getImpl();
  return module.listCachedCommits();
}

export async function flushCachedCommits() {
  const module = await getImpl();
  return module.flushCachedCommits();
}

// ──────────────────────────────────────────────────────────────
// Default export with all methods
// ──────────────────────────────────────────────────────────────
export default {
  setToken,
  validateToken,
  getUser,
  getUserSync,
  createRepo,
  listRepos,
  getRepo,
  deleteRepo,
  commitFile,
  createGist,
  updateGist,
  createOrUpdateGist,
  getGist,
  getStoredToken,
  deleteGist,
  cacheCommit,
  listCachedCommits,
  flushCachedCommits,
};
