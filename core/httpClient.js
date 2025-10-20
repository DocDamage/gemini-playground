/**
 * core/httpClient.js
 *
 * Lightweight helpers for accessing the global Fetch API without pulling in
 * heavy polyfills like `node-fetch`.  The renderer bundle relies on these
 * helpers to stay browser-compatible.
 */

export function tryGetFetch() {
  return typeof fetch === "function" ? fetch.bind(globalThis) : null;
}

export function getFetch() {
  const impl = tryGetFetch();
  if (!impl) {
    throw new Error("Global fetch API is not available in this environment.");
  }
  return impl;
}
