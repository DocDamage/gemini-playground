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

export default {
  getStoredToken,
  signInWithGitHub,
  signOutGitHub,
  getUserProfile,
};
