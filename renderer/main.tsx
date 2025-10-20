/**
 * renderer/main.tsx
 *
 * Gemini Playground renderer entrypoint.
 * Loads all contexts, mounts the dashboard, and bridges to backend.
 *
 * Original architecture preserved:
 *   - Context providers: AI, Settings, Projects, Assets, Code, Auth
 *   - Core dashboard UI and PluginManager integration
 *
 * Additions:
 *   - Syncs with heartbeat scheduler and report endpoints
 *   - Global error boundary and recovery path
 *   - Plugin initialization after context mount
 *   - Status overlay for backend signals
 */

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";

import { AIProvider } from "./context/AIContext";
import { SettingsProvider } from "./context/SettingsContext";
import { ProjectsProvider } from "./context/ProjectsContext";
import { AssetsProvider } from "./context/AssetsContext";
import { CodeProvider } from "./context/CodeContext";
import { AuthProvider } from "./context/AuthContext";

import App from "./dashboard/App";
import ErrorBoundary from "./ErrorBoundary";
import PluginManager from "./dashboard/PluginManager";
import "./index.css";

// ──────────────────────────────────────────────────────────────
// Backend heartbeat + report hooks
// ──────────────────────────────────────────────────────────────
async function pingHealth() {
  try {
    const res = await fetch("/health");
    if (!res.ok) throw new Error(`Bad status: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("Health check failed:", err.message);
    return { status: "down", error: err.message };
  }
}

async function fetchReport() {
  try {
    const res = await fetch("/report");
    if (!res.ok) throw new Error(`Bad status: ${res.status}`);
    const { report } = await res.json();
    return report;
  } catch (err) {
    console.warn("Report fetch failed:", err.message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// Status overlay component
// ──────────────────────────────────────────────────────────────
function StatusOverlay() {
  const [status, setStatus] = useState<"ok" | "down" | "warn">("ok");
  const [uptime, setUptime] = useState(0);
  const [load, setLoad] = useState("");
  const [lastReport, setLastReport] = useState("");

  useEffect(() => {
    const updateStatus = async () => {
      const health = await pingHealth();
      if (health.status === "down") {
        setStatus("down");
      } else {
        setStatus("ok");
        setUptime(health.uptime);
      }

      const rep = await fetchReport();
      if (rep?.system?.load) {
        setLoad(rep.system.load.map((l: number) => l.toFixed(2)).join(", "));
      }
      setLastReport(new Date().toLocaleTimeString());
    };

    updateStatus();
    const timer = setInterval(updateStatus, 60000); // 1 min
    return () => clearInterval(timer);
  }, []);

  const color =
    status === "ok" ? "bg-green-500" : status === "warn" ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="fixed bottom-2 right-3 z-50 text-xs text-white px-3 py-1 rounded-full shadow-lg flex items-center space-x-2 select-none cursor-default">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span>
        {status.toUpperCase()} | Uptime {Math.floor(uptime)}s | Load {load || "n/a"} |{" "}
        Last {lastReport}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Plugin bootstrap hook
// ──────────────────────────────────────────────────────────────
async function loadPlugins() {
  try {
    const res = await fetch("/plugins");
    if (!res.ok) throw new Error("Plugin list failed");
    const { plugins } = await res.json();
    console.info(`Loaded ${plugins.length} plugins`);
    return plugins;
  } catch (err) {
    console.warn("Plugin bootstrap failed:", err.message);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────
// Root entry component
// ──────────────────────────────────────────────────────────────
function Root() {
  const [plugins, setPlugins] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const loaded = await loadPlugins();
      setPlugins(loaded);
    })();
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <SettingsProvider>
          <ProjectsProvider>
            <AssetsProvider>
              <CodeProvider>
                <AIProvider>
                  <App />
                  <PluginManager plugins={plugins} />
                  <StatusOverlay />
                  <Toaster position="bottom-right" />
                </AIProvider>
              </CodeProvider>
            </AssetsProvider>
          </ProjectsProvider>
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

// ──────────────────────────────────────────────────────────────
// Mount React
// ──────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
