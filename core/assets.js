/**
 * core/assets.js
 *
 * Asset management and source registry for Gemini Playground.
 * Supports local, Firebase, GitHub, and external asset sources.
 * Handles caching, metadata, and unified drag-drop support.
 */

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { firestore, setDocument, getDocument } from "./firebase.js";
import { getStoredToken, createOrUpdateGist } from "./github.js";

const ASSET_CACHE_PATH = path.join(os.homedir(), ".gemini_assets");
const METADATA_PATH = path.join(ASSET_CACHE_PATH, "metadata.json");

// --- Ensure directories exist ---
if (!fs.existsSync(ASSET_CACHE_PATH)) fs.mkdirSync(ASSET_CACHE_PATH, { recursive: true });

// --- Registry ---

const assetSources = new Map();

/**
 * Registers a new asset source.
 * Example:
 * registerAssetSource("unsplash", {
 *   name: "Unsplash",
 *   description: "Free images",
 *   async fetchAssets(query) { ... },
 *   async getPreview(asset) { ... },
 * });
 */
export function registerAssetSource(key, source) {
  assetSources.set(key, source);
  console.log(`[Assets] Registered source: ${key}`);
}

/**
 * Returns all registered asset sources.
 */
export function listAssetSources() {
  return Array.from(assetSources.entries()).map(([k, v]) => ({ id: k, ...v }));
}

// --- Metadata management ---

function readMetadata() {
  if (!fs.existsSync(METADATA_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(METADATA_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeMetadata(data) {
  fs.writeFileSync(METADATA_PATH, JSON.stringify(data, null, 2));
}

// --- Local asset handling ---

export async function addLocalAsset(filePath) {
  const data = readMetadata();
  const id = crypto.randomUUID();
  const ext = path.extname(filePath);
  const dest = path.join(ASSET_CACHE_PATH, `${id}${ext}`);

  fs.copyFileSync(filePath, dest);
  const meta = {
    id,
    name: path.basename(filePath),
    type: ext.replace(".", ""),
    path: dest,
    source: "local",
    created: new Date().toISOString(),
  };

  data[id] = meta;
  writeMetadata(data);

  return meta;
}

export function listLocalAssets() {
  const data = readMetadata();
  return Object.values(data);
}

export function deleteLocalAsset(id) {
  const data = readMetadata();
  if (data[id]) {
    try {
      fs.unlinkSync(data[id].path);
    } catch {}
    delete data[id];
    writeMetadata(data);
  }
}

// --- Firebase sync (optional) ---

export async function syncToFirebase(userId) {
  if (!firestore) {
    console.warn("[Assets] Firebase is disabled; skipping syncToFirebase.");
    return;
  }
  const data = readMetadata();
  await setDocument(`users/${userId}/assetLibrary`, "metadata", data);
  console.log("[Assets] Synced to Firebase (offline stub).");
}

export async function loadFromFirebase(userId) {
  if (!firestore) {
    console.warn("[Assets] Firebase is disabled; skipping loadFromFirebase.");
    return;
  }
  const remote = await getDocument(`users/${userId}/assetLibrary`, "metadata");
  if (!remote) return;
  const localData = readMetadata();
  writeMetadata({ ...localData, ...remote });
  console.log("[Assets] Loaded from Firebase (offline stub).");
}

// --- GitHub sync (optional via Gist) ---

export async function syncToGitHub() {
  const token = getStoredToken();
  if (!token) {
    console.warn("[Assets] GitHub token not found, skipping sync.");
    return;
  }

  const data = readMetadata();
  const files = { "metadata.json": { content: JSON.stringify(data, null, 2) } };
  await createOrUpdateGist(token, null, files, "Gemini Playground Assets");
  console.log("[Assets] Synced to GitHub as Gist");
}

// --- Asset preview ---

export function getAssetPreview(id) {
  const data = readMetadata();
  const asset = data[id];
  if (!asset) return null;
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(asset.type)) {
    return `file://${asset.path}`;
  }
  return null;
}

// --- Developer instructions for adding new sources ---

/**
 * 🧩 To add a new external asset source:
 *
 * 1. Create a file under `/core/assets/` (e.g., `unsplashSource.js`)
 * 2. Export an object with:
 *    {
 *      name: "Unsplash",
 *      description: "Free stock images",
 *      async fetchAssets(query) {
 *        // Return an array of { id, name, type, url, previewUrl }
 *      },
 *      async importAsset(asset) {
 *        // Optionally download the file and call addLocalAsset()
 *      }
 *    }
 * 3. In your app startup (e.g., `main.js` or `App.tsx`), import and register it:
 *    import { registerAssetSource } from "@core/assets";
 *    import unsplash from "@core/assets/unsplashSource";
 *    registerAssetSource("unsplash", unsplash);
 *
 * The asset drawer will automatically detect and display all sources.
 */

export default {
  registerAssetSource,
  listAssetSources,
  addLocalAsset,
  listLocalAssets,
  deleteLocalAsset,
  syncToFirebase,
  loadFromFirebase,
  syncToGitHub,
  getAssetPreview,
};
