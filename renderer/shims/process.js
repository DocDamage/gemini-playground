// Browser-safe Node "process" shim.
// Load this BEFORE any other imports in main.jsx.

(function () {
  if (typeof window === "undefined") return;

  const existing = window.process || {};
  const safe = {
    ...existing,
    env: existing.env || {},
    version: existing.version || "browser",
    platform: existing.platform || "browser",
    // Make sure cwd() exists and is a function
    cwd: typeof existing.cwd === "function" ? existing.cwd : () => "/",
  };

  window.process = safe;
  // some libs look for global === window in browsers
  if (!window.global) window.global = window;
})();
