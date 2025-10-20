/**
 * core/firebase.js
 *
 * Optional Firebase integration facade.
 *
 * The production build ships without the Firebase SDK in order to keep the
 * dependency surface minimal.  This module exports the same interface that
 * the rest of the app expects, but implements every method as an offline stub.
 *
 * When the Firebase SDK is installed and you are ready to wire it up, replace
 * these stubs with a real implementation (or dynamically load the SDK inside
 * these helpers).  Until then, the dashboard can bundle and run without the
 * heavy Firebase packages.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { record as audit } from "./audit.js";
import { info, warn } from "./alerts.js";
import { captureError } from "./autoReporter.js";

const OFFLINE_DB_PATH = path.resolve("./logs/firebase_offline_store.json");

function ensureStoreFile() {
  try {
    fs.mkdirSync(path.dirname(OFFLINE_DB_PATH), { recursive: true });
    if (!fs.existsSync(OFFLINE_DB_PATH)) {
      fs.writeFileSync(OFFLINE_DB_PATH, JSON.stringify({}), "utf8");
    }
  } catch (err) {
    captureError(err, "firebase");
  }
}

function readStore() {
  ensureStoreFile();
  try {
    const raw = fs.readFileSync(OFFLINE_DB_PATH, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    captureError(err, "firebase");
    return {};
  }
}

function writeStore(next) {
  ensureStoreFile();
  try {
    fs.writeFileSync(OFFLINE_DB_PATH, JSON.stringify(next, null, 2), "utf8");
  } catch (err) {
    captureError(err, "firebase");
  }
}

function ensureCollection(store, collectionName) {
  if (!store[collectionName]) {
    store[collectionName] = {};
  }
  return store[collectionName];
}

export const firestore = null;

export async function initFirebase() {
  warn("Firebase SDK not installed; running in offline mode.", "firebase");
  audit("firebase_init_skipped", { reason: "sdk_missing" }, "firebase");
  return false;
}

export async function login() {
  const err = new Error("Firebase authentication is disabled in this build.");
  captureError(err, "firebase");
  throw err;
}

export function watchAuth(callback) {
  callback(null);
  return () => {};
}

export async function logout() {
  info("Firebase logout skipped (offline mode).", "firebase");
}

export async function getDocument(collectionName, docId) {
  const store = readStore();
  const collection = store[collectionName] ?? {};
  return collection[docId] ?? null;
}

export async function setDocument(collectionName, docId, data) {
  const store = readStore();
  const collection = ensureCollection(store, collectionName);
  collection[docId] = { ...collection[docId], ...data, updatedAt: new Date().toISOString() };
  writeStore(store);
  audit("doc_written_offline", { collection: collectionName, docId }, "firebase");
  return true;
}

export async function addDocument(collectionName, data) {
  const store = readStore();
  const collection = ensureCollection(store, collectionName);
  const id = crypto.randomUUID();
  collection[id] = {
    ...data,
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  audit("doc_added_offline", { collection: collectionName, docId: id }, "firebase");
  return id;
}

export async function deleteDocument(collectionName, docId) {
  const store = readStore();
  const collection = ensureCollection(store, collectionName);
  if (collection[docId]) {
    delete collection[docId];
    writeStore(store);
    audit("doc_deleted_offline", { collection: collectionName, docId }, "firebase");
  }
  return true;
}

export async function listDocuments(collectionName) {
  const store = readStore();
  const collection = ensureCollection(store, collectionName);
  return Object.values(collection);
}

export async function uploadFile() {
  const err = new Error("Firebase storage is disabled in offline mode.");
  captureError(err, "firebase");
  throw err;
}

export async function deleteFile() {
  const err = new Error("Firebase storage is disabled in offline mode.");
  captureError(err, "firebase");
  throw err;
}

export async function flushOfflineCache() {
  return 0;
}

export function onUserChanged(callback) {
  callback(null);
  return () => {};
}

export async function getUserDoc() {
  return null;
}

export async function saveUserDoc(uid, data) {
  await setDocument("users", uid, data);
  return true;
}

export async function signInWithGoogle() {
  const err = new Error("Firebase Google sign-in is disabled in this build.");
  captureError(err, "firebase");
  throw err;
}

export default {
  firestore,
  initFirebase,
  login,
  logout,
  watchAuth,
  getDocument,
  setDocument,
  addDocument,
  deleteDocument,
  listDocuments,
  uploadFile,
  deleteFile,
  flushOfflineCache,
  onUserChanged,
  getUserDoc,
  saveUserDoc,
  signInWithGoogle,
};
