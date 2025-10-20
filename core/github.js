// core/github.js
// Lightweight, ESM loader that delegates to core/github.node.js in Node
// or renderer/shims/githubStub.ts in the browser (renderer). Exports the
// same named API surface as the original client but as async wrappers.

const isNode =
  typeof process !== 'undefined' && Boolean(process.versions && process.versions.node);

function loadImpl() {
  if (isNode) {
    return import('./github.node.js');
  }
  // Renderer shim (browser-friendly) — keep path to renderer shim
  return import('../renderer/shims/githubStub.ts');
}

async function forward(name, ...args) {
  const mod = await loadImpl();
  if (!mod || !(name in mod)) {
    throw new Error(`GitHub client missing export: ${name}`);
  }
  return mod[name](...args);
}

export const setToken = async (...args) => forward('setToken', ...args);
export const validateToken = async (...args) => forward('validateToken', ...args);
export const getUser = async (...args) => forward('getUser', ...args);
export const createRepo = async (...args) => forward('createRepo', ...args);
export const listRepos = async (...args) => forward('listRepos', ...args);
export const getRepo = async (...args) => forward('getRepo', ...args);
export const deleteRepo = async (...args) => forward('deleteRepo', ...args);
export const commitFile = async (...args) => forward('commitFile', ...args);
export const createGist = async (...args) => forward('createGist', ...args);
export const updateGist = async (...args) => forward('updateGist', ...args);
export const getGist = async (...args) => forward('getGist', ...args);
export const deleteGist = async (...args) => forward('deleteGist', ...args);
export const cacheCommit = async (...args) => forward('cacheCommit', ...args);
export const listCachedCommits = async (...args) => forward('listCachedCommits', ...args);
export const flushCachedCommits = async (...args) => forward('flushCachedCommits', ...args);

export function __isNode() { return isNode; }

export default {
  setToken,
  validateToken,
  getUser,
  createRepo,
  listRepos,
  getRepo,
  deleteRepo,
  commitFile,
  createGist,
  updateGist,
  getGist,
  deleteGist,
  cacheCommit,
  listCachedCommits,
  flushCachedCommits,
  __isNode,
};
