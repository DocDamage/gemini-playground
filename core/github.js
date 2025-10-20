/**
 * core/github.js
 *
 * Environment-aware loader for GitHub integration.
 * Detects Node vs renderer at runtime and loads the appropriate implementation.
 *
 * This file avoids any top-level Node builtin imports (fs, path, crypto)
 * so Vite will not attempt to bundle them when building the renderer.
 */

// Detect if we're running in Node.js
const isNode = typeof process !== 'undefined' && !!process.versions?.node;

// Module-level promise to store the loaded implementation
let implPromise = null;
let loadedImpl = null;

/**
 * Lazy-load the appropriate implementation based on environment
 */
async function getImpl() {
  if (!implPromise) {
    if (isNode) {
      // Running in Node (main/server process)
      implPromise = import('./github.node.js').then(mod => {
        loadedImpl = mod;
        return mod;
      });
    } else {
      // Running in renderer (browser context)
      implPromise = import('../renderer/shims/githubStub.js').then(mod => {
        loadedImpl = mod;
        return mod;
      });
    }
  }
  return implPromise;
}

// ──────────────────────────────────────────────────────────────
// Async forwarding functions
// ──────────────────────────────────────────────────────────────

export async function setToken(token) {
  const impl = await getImpl();
  return impl.setToken(token);
}

export async function validateToken() {
  const impl = await getImpl();
  return impl.validateToken();
}

export async function getUser() {
  const impl = await getImpl();
  return impl.getUser();
}

export async function createRepo(name, isPrivate = true, description = "") {
  const impl = await getImpl();
  return impl.createRepo(name, isPrivate, description);
}

export async function listRepos() {
  const impl = await getImpl();
  return impl.listRepos();
}

export async function getRepo(owner, repo) {
  const impl = await getImpl();
  return impl.getRepo(owner, repo);
}

export async function deleteRepo(owner, repo) {
  const impl = await getImpl();
  return impl.deleteRepo(owner, repo);
}

export async function commitFile(owner, repo, pathInRepo, content, message, branch = "main") {
  const impl = await getImpl();
  return impl.commitFile(owner, repo, pathInRepo, content, message, branch);
}

export async function createGist(filename, content, description = "", isPublic = false) {
  const impl = await getImpl();
  return impl.createGist(filename, content, description, isPublic);
}

export async function updateGist(id, filename, content) {
  const impl = await getImpl();
  return impl.updateGist(id, filename, content);
}

export async function getGist(id) {
  const impl = await getImpl();
  return impl.getGist(id);
}

export async function deleteGist(id) {
  const impl = await getImpl();
  return impl.deleteGist(id);
}

export async function createOrUpdateGist(id, filename, content, description = "", isPublic = false) {
  const impl = await getImpl();
  return impl.createOrUpdateGist(id, filename, content, description, isPublic);
}

export async function cacheCommit(owner, repo, file, content) {
  const impl = await getImpl();
  return impl.cacheCommit(owner, repo, file, content);
}

export async function listCachedCommits() {
  const impl = await getImpl();
  return impl.listCachedCommits();
}

export async function flushCachedCommits() {
  const impl = await getImpl();
  return impl.flushCachedCommits();
}

export async function getStoredToken() {
  const impl = await getImpl();
  return impl.getStoredToken();
}

// ──────────────────────────────────────────────────────────────
// Synchronous helper for Node.js only
// ──────────────────────────────────────────────────────────────

export function getUserSync() {
  if (!isNode) {
    throw new Error('getUserSync() is only available in Node.js environment');
  }
  // In Node, return the cached user from the loaded implementation
  // This will only work after the implementation has been loaded at least once
  if (loadedImpl && typeof loadedImpl.getUserSync === 'function') {
    return loadedImpl.getUserSync();
  }
  // If the implementation hasn't been loaded yet, return null
  // The caller should use the async getUser() for the first call
  return null;
}

// ──────────────────────────────────────────────────────────────
// Default export - lazy-loaded object
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
