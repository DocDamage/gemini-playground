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

export async function setToken(token: string): Promise<string> {
  saveToken(token);
  console.info(`[GitHubStub] Token set`);
  return "stub-user";
}

export async function validateToken(): Promise<string> {
  const token = loadToken();
  if (!token) throw new Error("GitHub token missing");
  console.info(`[GitHubStub] Token validated`);
  return "stub-user";
}

export function getUser(): string | null {
  const profile = loadProfile();
  return profile?.login || null;
}

export function getUserSync(): string | null {
  return null; // In renderer, synchronous access is not available
}

export async function createRepo(name: string, isPrivate = true, description = ""): Promise<any> {
  console.info(`[GitHubStub] Creating repo ${name}`);
  return { name, private: isPrivate, description, full_name: `stub-user/${name}` };
}

export async function listRepos(): Promise<any[]> {
  console.info(`[GitHubStub] Listing repos`);
  return [];
}

export async function getRepo(owner: string, repo: string): Promise<any> {
  console.info(`[GitHubStub] Getting repo ${owner}/${repo}`);
  return { owner, name: repo, full_name: `${owner}/${repo}` };
}

export async function deleteRepo(owner: string, repo: string): Promise<boolean> {
  console.info(`[GitHubStub] Deleting repo ${owner}/${repo}`);
  return true;
}

export async function commitFile(
  owner: string,
  repo: string,
  pathInRepo: string,
  content: string,
  message: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  branch = "main"
): Promise<any> {
  console.info(`[GitHubStub] Committing file ${pathInRepo} to ${owner}/${repo}`);
  return { commit: { message } };
}

export async function createGist(
  filename: string,
  content: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  description = "",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isPublic = false
): Promise<any> {
  console.info(`[GitHubStub] Creating gist ${filename}`);
  return { id: `stub-gist-${crypto.randomUUID()}`, files: { [filename]: { content } } };
}

export async function updateGist(id: string, filename: string, content: string): Promise<any> {
  console.info(`[GitHubStub] Updating gist ${id}`);
  return { id, files: { [filename]: { content } } };
}

export async function getGist(id: string): Promise<any> {
  console.info(`[GitHubStub] Getting gist ${id}`);
  return { id, files: {} };
}

export async function deleteGist(id: string): Promise<boolean> {
  console.info(`[GitHubStub] Deleting gist ${id}`);
  return true;
}

export async function createOrUpdateGist(
  id: string | null,
  filename: string,
  content: string,
  description = "",
  isPublic = false
): Promise<any> {
  if (id) {
    return updateGist(id, filename, content);
  } else {
    return createGist(filename, content, description, isPublic);
  }
}

export function cacheCommit(
  owner: string, 
  repo: string, 
  file: string, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  content: string
): string {
  console.info(`[GitHubStub] Caching commit for ${file}`);
  return `stub-cache-${crypto.randomUUID()}`;
}

export function listCachedCommits(): any[] {
  console.info(`[GitHubStub] Listing cached commits`);
  return [];
}

export async function flushCachedCommits(): Promise<number> {
  console.info(`[GitHubStub] Flushing cached commits`);
  return 0;
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

export default {
  getStoredToken,
  setToken,
  validateToken,
  getUser,
  getUserSync,
  signInWithGitHub,
  signOutGitHub,
  getUserProfile,
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
