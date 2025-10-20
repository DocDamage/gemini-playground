/**
 * renderer/shims/githubStub.ts
 *
 * Browser-friendly stub for the optional GitHub integration.
 * Stores pseudo tokens and profiles in localStorage so the renderer
 * can simulate sign-in without touching Node-only dependencies.
 */

type GitHubProfile = {
  id: string;
  login: string;
  name: string;
  email: string | null;
};

const TOKEN_KEY = "github_stub_token";
const PROFILE_KEY = "github_stub_profile";

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

function loadProfile(): GitHubProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveProfile(profile: GitHubProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage failures
  }
}

export function getStoredToken(): string | null {
  return loadToken();
}

export async function signInWithGitHub(clientId: string, clientSecret: string) {
  const token = `stub-github-token-${crypto.randomUUID()}`;
  const profile: GitHubProfile = loadProfile() ?? {
    id: crypto.randomUUID(),
    login: "stub-user",
    name: "Stubbed GitHub User",
    email: "stub.user@example.com",
  };
  saveToken(token);
  saveProfile(profile);
  console.info(
    `[GitHubStub] Simulating sign-in with client ${clientId}, secret length ${clientSecret.length}.`
  );
  return token;
}

export function signOutGitHub() {
  saveToken(null);
}

export async function getUserProfile(token: string): Promise<GitHubProfile> {
  const profile =
    loadProfile() ?? {
      id: crypto.randomUUID(),
      login: "stub-user",
      name: "Stubbed GitHub User",
      email: "stub.user@example.com",
    };
  saveProfile(profile);
  console.info(`[GitHubStub] Returning stub profile for token ${token.slice(0, 8)}…`);
  return profile;
}

// Additional stub functions to match core/github.js API
export async function setToken(token: string) {
  saveToken(token);
  return "stub-user";
}

export async function validateToken() {
  const token = loadToken();
  if (!token) throw new Error("GitHub token missing");
  return "stub-user";
}

export function getUser() {
  const profile = loadProfile();
  return profile?.login || null;
}

export async function createRepo(name: string, isPrivate = true, description = "") {
  console.info(`[GitHubStub] createRepo: ${name}, private: ${isPrivate}`);
  return { id: crypto.randomUUID(), name, full_name: `stub-user/${name}`, private: isPrivate, description };
}

export async function listRepos() {
  console.info("[GitHubStub] listRepos (stub)");
  return [];
}

export async function getRepo(owner: string, repo: string) {
  console.info(`[GitHubStub] getRepo: ${owner}/${repo}`);
  return { id: crypto.randomUUID(), name: repo, full_name: `${owner}/${repo}` };
}

export async function deleteRepo(owner: string, repo: string) {
  console.info(`[GitHubStub] deleteRepo: ${owner}/${repo}`);
  return true;
}

export async function commitFile(owner: string, repo: string, path: string, content: string, message: string, _branch = "main") {
  console.info(`[GitHubStub] commitFile: ${owner}/${repo}/${path}`);
  return { commit: { sha: crypto.randomUUID() } };
}

export async function createGist(filename: string, content: string, _description = "", _isPublic = false) {
  console.info(`[GitHubStub] createGist: ${filename}`);
  return { id: crypto.randomUUID(), files: { [filename]: { content } } };
}

export async function updateGist(id: string, filename: string, content: string) {
  console.info(`[GitHubStub] updateGist: ${id}/${filename}`);
  return { id, files: { [filename]: { content } } };
}

export async function getGist(id: string) {
  console.info(`[GitHubStub] getGist: ${id}`);
  return { id, files: {} };
}

export async function deleteGist(id: string) {
  console.info(`[GitHubStub] deleteGist: ${id}`);
  return true;
}

export function cacheCommit(owner: string, repo: string, file: string, _content: string) {
  console.info(`[GitHubStub] cacheCommit: ${owner}/${repo}/${file}`);
  return `/tmp/cached-${crypto.randomUUID()}.json`;
}

export function listCachedCommits() {
  console.info("[GitHubStub] listCachedCommits (stub)");
  return [];
}

export async function flushCachedCommits() {
  console.info("[GitHubStub] flushCachedCommits (stub)");
  return 0;
}

export default {
  getStoredToken,
  signInWithGitHub,
  signOutGitHub,
  getUserProfile,
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
};
