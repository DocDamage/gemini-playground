/**
 * renderer/shims/firebaseStub.ts
 *
 * Browser-friendly stand-in for the optional Firebase integration.
 * Provides the minimum surface used by the renderer contexts so Vite
 * can bundle without pulling in Node-only modules.
 */

type FirebaseUser = {
  uid: string;
  email: string;
  displayName: string;
};

type Listener = (user: FirebaseUser | null) => void;

const USER_STORAGE_KEY = "firebase_stub_current_user";
const PROFILE_STORAGE_KEY = "firebase_stub_profiles";

function loadUser(): FirebaseUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUser(user: FirebaseUser | null) {
  try {
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

function loadProfiles(): Record<string, any> {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProfiles(profiles: Record<string, any>) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // ignore storage failures
  }
}

let currentUser: FirebaseUser | null = loadUser();
const listeners = new Set<Listener>();

function notify(user: FirebaseUser | null) {
  listeners.forEach((listener) => {
    try {
      listener(user);
    } catch {
      /* swallow listener errors */
    }
  });
}

export function onUserChanged(callback: Listener): () => void {
  listeners.add(callback);
  // Invoke immediately to mirror Firebase behaviour
  callback(currentUser);
  return () => listeners.delete(callback);
}

export async function getUserDoc(uid: string) {
  const profiles = loadProfiles();
  return profiles[uid] ?? null;
}

export async function saveUserDoc(uid: string, data: Record<string, any>) {
  const profiles = loadProfiles();
  profiles[uid] = { ...(profiles[uid] ?? {}), ...data };
  saveProfiles(profiles);
  return true;
}

export async function signInWithGoogle(): Promise<FirebaseUser> {
  const generatedUser: FirebaseUser = {
    uid: crypto.randomUUID(),
    email: "stub-user@example.com",
    displayName: "Stubbed Firebase User",
  };
  currentUser = generatedUser;
  saveUser(generatedUser);
  notify(currentUser);
  await saveUserDoc(generatedUser.uid, {
    email: generatedUser.email,
    name: generatedUser.displayName,
    lastLogin: new Date().toISOString(),
  });
  return generatedUser;
}

export async function logout() {
  currentUser = null;
  saveUser(null);
  notify(currentUser);
}

export async function initFirebase() {
  // Present for API parity; returns false to indicate stub mode.
  return false;
}

export async function login() {
  throw new Error("Firebase authentication is not configured in this build.");
}

export function watchAuth(callback: Listener) {
  return onUserChanged(callback);
}

export default {
  onUserChanged,
  getUserDoc,
  saveUserDoc,
  signInWithGoogle,
  logout,
  initFirebase,
  login,
  watchAuth,
};
