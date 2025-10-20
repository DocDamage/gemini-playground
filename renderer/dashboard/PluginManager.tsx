/**
 * renderer/dashboard/PluginManager.tsx
 *
 * Displays all loaded plugins with reload/test options via Electron IPC.
 * Extended: manifest integration, install-from-URL, drag-and-drop upload,
 * version conflict handling, and history restore via local plugin server.
 * NOTE: Original IPC-based flow is preserved exactly; new features are additive.
 */

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";

type PluginInfo = {
  name: string;
  version: string;
  description?: string;
  status?: string;
};

// Additional type for manifest entries
type ManifestEntry = {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  path?: string;
  active?: boolean;
  updated?: string;
};

const PluginManager: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string>("");
  // New UI state
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [history, setHistory] = useState<{ name: string; backups: any[] } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [installUrl, setInstallUrl] = useState("");

  // Initial load
  useEffect(() => {
    fetchPlugins();
    // also pull manifest if server is running
    loadManifest();
    const interval = setInterval(async () => {
      await loadManifest();
      setLastUpdated(Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch current plugin list via your existing IPC channel
  async function fetchPlugins() {
    setLoading(true);
    try {
      const result = await window.pluginBridge?.invoke("plugin:list");
      if (Array.isArray(result)) {
        setPlugins(result);
      } else {
        // fallback if not wired yet
        setPlugins([
          { name: "AutoFormatter", version: "1.0.0", description: "Formats JS/TS code", status: "loaded" },
        ]);
      }
    } catch {
      setPlugins([
        { name: "AutoFormatter", version: "1.0.0", description: "Formats JS/TS code", status: "loaded" },
      ]);
    }
    setLoading(false);
  }

  async function reloadPlugins() {
    setLoading(true);
    setOutput("");
    try {
      const result = await window.pluginBridge?.invoke("plugin:reload");
      setOutput(typeof result === "string" ? result : JSON.stringify(result, null, 2));
      // refresh lists
      await fetchPlugins();
      await loadManifest();
    } catch (err: any) {
      setOutput(`Reload failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function testCommand() {
    try {
      const result = await window.pluginBridge?.invoke(
        "plugin-command",
        "format",
        "const x=1;function test(){return x;}"
      );
      setOutput(result);
    } catch (err: any) {
      setOutput(`Command failed: ${err.message}`);
    }
  }

  // ---- New: Manifest + server-backed features ----
  async function loadManifest() {
    try {
      const res = await fetch("http://localhost:5478/plugins/manifest", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setManifest(data.plugins || []);
      }
    } catch {
      // server may not be running; ignore
    }
  }

  async function installFromUrl() {
    if (!installUrl.trim()) return alert("Enter a valid plugin URL ending with .js");
    try {
      const res = await fetch("http://localhost:5478/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: installUrl.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`✅ Installed ${data.result.name}`);
        setInstallUrl("");
        await fetchPlugins();
        await loadManifest();
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (err: any) {
      alert(`⚠️ Install failed: ${err.message}`);
    }
  }

  // Drag-and-drop upload
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!file.name.endsWith(".js")) {
        alert("Only .js plugin files supported.");
        return;
      }
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("http://localhost:5478/plugins/upload", { method: "POST", body: form });
        const data = await res.json();
        if (data.conflict) {
          const proceed = confirm(`${data.message}\n\nReplace existing plugin?`);
          if (proceed && data.tempPath) {
            const ow = await fetch("http://localhost:5478/plugins/overwrite", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tempPath: data.tempPath, name: file.name.replace(".js", "") }),
            });
            const owData = await ow.json();
            if (owData.ok) {
              alert(`✅ Overwrote ${owData.name}`);
              await fetchPlugins();
              await loadManifest();
            } else {
              alert(`❌ ${owData.error}`);
            }
          }
        } else if (data.ok) {
          alert(`✅ Installed ${data.name}`);
          await fetchPlugins();
          await loadManifest();
        } else {
          alert(`❌ ${data.error}`);
        }
      } catch (err: any) {
        alert(`⚠️ Upload failed: ${err.message}`);
      }
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // History
  async function openHistory(name: string) {
    try {
      const res = await fetch(`http://localhost:5478/plugins/history/${name}`);
      const data = await res.json();
      setHistory(data);
      setShowHistory(true);
    } catch (err: any) {
      alert(`Failed to load history: ${err.message}`);
    }
  }
  async function restoreVersion(name: string, file: string) {
    if (!confirm(`Restore ${name} from ${file}?`)) return;
    const res = await fetch("http://localhost:5478/plugins/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, file }),
    });
    const data = await res.json();
    if (data.ok) {
      alert(`✅ ${data.message}`);
      setShowHistory(false);
      await fetchPlugins();
      await loadManifest();
    } else {
      alert(`❌ ${data.error}`);
    }
  }

  // UI
  return (
    <div className="p-6 bg-gray-50 min-h-screen relative">
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="border-4 border-dashed border-blue-400 text-blue-200 rounded-2xl p-8 text-center">
            <p className="text-xl mb-2">Drop your plugin .js file here</p>
            <p className="text-sm text-blue-200/80">It will install instantly</p>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-semibold mb-4">Plugin Manager</h1>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <Button onClick={fetchPlugins} disabled={loading}>Refresh</Button>
        <Button onClick={reloadPlugins} disabled={loading}>Reload Plugins</Button>
        <Button onClick={testCommand} disabled={loading}>Test Format Command</Button>

        {/* New: Install from URL */}
        <input
          value={installUrl}
          onChange={(e) => setInstallUrl(e.target.value)}
          placeholder="https://raw.githubusercontent.com/.../plugin.js"
          className="flex-1 min-w-[280px] bg-white border rounded px-3 py-2 text-sm"
        />
        <Button onClick={installFromUrl} disabled={!installUrl.trim()}>Install</Button>

        <span className="text-xs text-gray-500 ml-auto">
          Updated {new Date(lastUpdated).toLocaleTimeString()}
        </span>
      </div>

      {loading && <p className="text-gray-600">Loading...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plugins.map((plugin, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-lg font-medium">{plugin.name}</h2>
                    <p className="text-xs text-gray-500">v{plugin.version}</p>
                    {plugin.description && (
                      <p className="text-sm text-gray-700 mt-1">{plugin.description}</p>
                    )}
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                    {plugin.status || "loaded"}
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  {/* Preserve your original actions; add history button */}
                  <Button variant="secondary" onClick={() => openHistory(plugin.name)}>
                    History
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Manifest list (read-only) */}
      {manifest.length > 0 && (
        <div className="mt-8">
          <h3 className="text-md font-semibold mb-2">Discovered (from manifest)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {manifest.map((m) => (
              <div key={m.name} className="border rounded p-3 bg-white">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-gray-500">v{m.version || "1.0.0"}</p>
                    {m.author && <p className="text-xs text-gray-500">by {m.author}</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${m.active ? "bg-green-100 text-green-700":"bg-gray-100 text-gray-600"}`}>
                    {m.active ? "Active" : "Inactive"}
                  </span>
                </div>
                {m.description && <p className="text-sm text-gray-700 mt-1">{m.description}</p>}
                <p className="text-[10px] text-gray-400 mt-2">{m.path}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History modal */}
      {showHistory && history && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-[420px] max-h-[80vh] overflow-auto">
            <h3 className="text-lg font-semibold mb-3">{history.name} — History</h3>
            {history.backups?.length ? (
              <ul className="space-y-2">
                {history.backups.map((b: any) => (
                  <li key={b.file} className="flex items-center justify-between border rounded p-2">
                    <div>
                      <p className="text-sm">{b.timestamp}</p>
                      <p className="text-[10px] text-gray-500">{(b.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <Button size="sm" onClick={() => restoreVersion(history.name, b.file)}>
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-600">No backups found.</p>
            )}
            <div className="mt-4 text-right">
              <Button variant="secondary" onClick={() => setShowHistory(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {output && (
        <div className="mt-6 p-3 bg-gray-100 rounded border text-sm text-gray-700 whitespace-pre-wrap">
          {output}
        </div>
      )}
    </div>
  );
};

export default PluginManager;
