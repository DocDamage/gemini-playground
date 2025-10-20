/**
 * renderer/context/AuthContext.tsx
 *
 * Unified authentication context.
 * Supports Firebase (Google) + GitHub OAuth + offline guest mode.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

let firebaseModules: any = {};
let githubModules: any = {};
let firebaseAvailable = false;
let githubAvailable = false;

// --- Conditional imports ---
try {
  firebaseModules = await import("../shims/firebaseStub");
  firebaseAvailable = true;
  console.log("[AuthContext] Firebase available.");
} catch {
  console.warn("[AuthContext] Firebase not configured.");
}

try {
  githubModules = await import("../shims/githubStub");
  githubAvailable = true;
  console.log("[AuthContext] GitHub module available.");
} catch {
  console.warn("[AuthContext] GitHub module missing or failed to load.");
}

interface AuthContextType {
  user: any;
  userData: Record<string, any> | null;
  loading: boolean;
  online: boolean;
  isGuest: boolean;
  backend: "guest" | "firebase" | "github";
  signInFirebase: () => Promise<void>;
  signInGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [backend, setBackend] = useState<"guest" | "firebase" | "github">("guest");

  const isGuest = backend === "guest";

  // --- Lifecycle ---
  const enterGuestMode = useCallback(() => {
    setUser({ uid: "guest", email: "guest@local", displayName: "Guest" });
    setUserData({ name: "Guest User", mode: "offline" });
    setBackend("guest");
  }, []);

  const handleGitHubAuth = useCallback(
    async (token: string) => {
      try {
        const profile = await githubModules.getUserProfile(token);
        setUser({
          uid: profile.id,
          email: profile.email || `${profile.login}@github`,
          displayName: profile.name || profile.login,
        });
        setUserData({ source: "github", profile });
        setBackend("github");
      } catch (err: any) {
        console.error("[AuthContext] GitHub auth failed:", err.message);
        enterGuestMode();
      }
    },
    [enterGuestMode]
  );

  useEffect(() => {
    if (firebaseAvailable) {
      const { onUserChanged, getUserDoc } = firebaseModules;
      const unsubscribe = onUserChanged(async (currentUser: any) => {
        if (currentUser) {
          setUser(currentUser);
          setUserData(await getUserDoc(currentUser.uid));
          setBackend("firebase");
        } else {
          const token = githubAvailable ? githubModules.getStoredToken() : null;

          if (token) {
            await handleGitHubAuth(token);
          } else {
            enterGuestMode();
          }
        }
        setLoading(false);
      });
      return () => unsubscribe();
    }

    const token = githubAvailable ? githubModules.getStoredToken() : null;
    if (token) {
      handleGitHubAuth(token);
    } else {
      enterGuestMode();
    }
    setLoading(false);
  }, [enterGuestMode, handleGitHubAuth]);

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  // --- Handlers ---

  const signInFirebase = async () => {
    if (!firebaseAvailable) return;
    try {
      const { signInWithGoogle, saveUserDoc } = firebaseModules;
      const newUser = await signInWithGoogle();
      await saveUserDoc(newUser.uid, {
        email: newUser.email,
        name: newUser.displayName,
        lastLogin: new Date().toISOString(),
      });
      setUser(newUser);
      setBackend("firebase");
    } catch (err: any) {
      console.error("[AuthContext] Firebase sign-in error:", err.message);
    }
  };

  const signInGitHub = async () => {
    if (!githubAvailable) return;
    try {
      const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || "YOUR_CLIENT_ID";
      const clientSecret = import.meta.env.VITE_GITHUB_CLIENT_SECRET || "YOUR_SECRET";
      const token = await githubModules.signInWithGitHub(clientId, clientSecret);
      if (token) await handleGitHubAuth(token);
    } catch (err: any) {
      console.error("[AuthContext] GitHub sign-in error:", err.message);
    }
  };

  const signOut = async () => {
    try {
      if (backend === "firebase" && firebaseAvailable) {
        await firebaseModules.logout();
      }
      if (backend === "github" && githubAvailable) {
        githubModules.signOutGitHub();
      }
      enterGuestMode();
    } catch (err: any) {
      console.error("[AuthContext] Sign-out error:", err.message);
    }
  };

  const refreshUser = async () => {
    if (backend === "github" && githubAvailable) {
      const token = githubModules.getStoredToken();
      if (token) await handleGitHubAuth(token);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        loading,
        online,
        isGuest,
        backend,
        signInFirebase,
        signInGitHub,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

