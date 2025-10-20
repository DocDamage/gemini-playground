/**
 * renderer/shims/assetsBridge.ts
 *
 * Lightweight browser-friendly shim for the asset helpers used by the
 * renderer. Provides a localStorage-backed asset catalog so the build
 * does not rely on Node-specific modules.
 */

type StoredAsset = {
  id: string;
  name: string;
  type: string;
  path?: string;
  source: string;
  created: string;
  preview?: string | null;
};

const ASSET_STORAGE_KEY = "asset_stub_store";

function loadStore(): Record<string, StoredAsset> {
  try {
    const raw = localStorage.getItem(ASSET_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, StoredAsset>) {
  try {
    localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage failures
  }
}

function toAssetArray(store: Record<string, StoredAsset>): StoredAsset[] {
  return Object.values(store);
}

function resolveFileName(filePath: string) {
  const segments = filePath.split(/[/\\]/);
  return segments[segments.length - 1] || filePath;
}

export function listLocalAssets(): StoredAsset[] {
  return toAssetArray(loadStore());
}

export async function addLocalAsset(filePath: string): Promise<StoredAsset> {
  const store = loadStore();
  const id = crypto.randomUUID();
  const name = resolveFileName(filePath);
  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "bin" : "bin";

  const asset: StoredAsset = {
    id,
    name,
    type: extension,
    path: filePath,
    source: "local",
    created: new Date().toISOString(),
    preview: null,
  };

  store[id] = asset;
  saveStore(store);
  return asset;
}

export async function deleteLocalAsset(id: string): Promise<void> {
  const store = loadStore();
  if (store[id]) {
    delete store[id];
    saveStore(store);
  }
}

export function listAssetSources() {
  return [
    { id: "local", name: "Local Files", description: "Assets imported from disk." },
    { id: "stub-cloud", name: "Cloud (stub)", description: "Placeholder cloud source." },
  ];
}

export function getAssetPreview(id: string): string | null {
  const store = loadStore();
  return store[id]?.preview ?? null;
}

export async function syncToFirebase(userId: string) {
  console.info(`[AssetsBridge] Firebase sync skipped (stub) for ${userId}.`);
}

export async function loadFromFirebase(userId: string) {
  console.info(`[AssetsBridge] Firebase load skipped (stub) for ${userId}.`);
}

export async function syncToGitHub() {
  console.info("[AssetsBridge] GitHub sync skipped (stub).");
}

export default {
  listLocalAssets,
  addLocalAsset,
  deleteLocalAsset,
  listAssetSources,
  getAssetPreview,
  syncToFirebase,
  loadFromFirebase,
  syncToGitHub,
};
