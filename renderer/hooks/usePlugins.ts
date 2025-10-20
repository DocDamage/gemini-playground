// renderer/hooks/usePlugins.ts
// React hook for interacting with the Electron plugin system

import { useEffect, useState, useCallback } from "react";

type PluginMeta = {
  name: string;
  version?: string;
  active?: boolean;
  path?: string;
};

declare global {
  interface Window {
    pluginBridge?: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      send?: (channel: string, ...args: any[]) => void;
      on: (channel: string, listener: (...args: any[]) => void) => (() => void) | void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

export function usePlugins() {
  const [plugins, setPlugins] = useState<PluginMeta[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.pluginBridge?.invoke("plugin:list");
      setPlugins(list || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const activate = useCallback(async (name: string) => {
    await window.pluginBridge?.invoke("plugin:activate", name);
    refresh();
  }, [refresh]);

  const deactivate = useCallback(async (name: string) => {
    await window.pluginBridge?.invoke("plugin:deactivate", name);
    refresh();
  }, [refresh]);

  const reload = useCallback(async (name: string) => {
    await window.pluginBridge?.invoke("plugin:reload", name);
    refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();

    const removeActivated = window.pluginBridge?.on?.("plugin-activated", (name: string) => {
      setPlugins((prev) =>
        prev.map((p) => (p.name === name ? { ...p, active: true } : p))
      );
    });
    const removeDeactivated = window.pluginBridge?.on?.("plugin-deactivated", (name: string) => {
      setPlugins((prev) =>
        prev.map((p) => (p.name === name ? { ...p, active: false } : p))
      );
    });
    const removeReloaded = window.pluginBridge?.on?.("plugin-reloaded", () => {
      refresh();
    });
    const removeError = window.pluginBridge?.on?.("plugin-error", () => {
      // Stay silent but refresh to ensure state stays consistent.
      refresh();
    });

    return () => {
      if (typeof removeActivated === "function") removeActivated();
      if (typeof removeDeactivated === "function") removeDeactivated();
      if (typeof removeReloaded === "function") removeReloaded();
      if (typeof removeError === "function") removeError();
      window.pluginBridge?.removeAllListeners("plugin-activated");
      window.pluginBridge?.removeAllListeners("plugin-deactivated");
      window.pluginBridge?.removeAllListeners("plugin-reloaded");
      window.pluginBridge?.removeAllListeners("plugin-error");
    };
  }, [refresh]);

  return {
    plugins,
    loading,
    refresh,
    activate,
    deactivate,
    reload,
  };
}
