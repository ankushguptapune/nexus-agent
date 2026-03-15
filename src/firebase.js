// ═══════════════════════════════════════════════════════
// FIREBASE CONFIGURATION
// Replace the values below with YOUR Firebase project config
// (Step-by-step guide is in DEPLOY-GUIDE.md)
// ═══════════════════════════════════════════════════════

import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDHmMMzm8HjWpESEKCWmKOd_LrgPKMBiZs",
  authDomain: "nexus-agent-f8a67.firebaseapp.com",
  databaseURL: "https://nexus-agent-f8a67-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nexus-agent-f8a67",
  storageBucket: "nexus-agent-f8a67.firebasestorage.app",
  messagingSenderId: "694515049428",
  appId: "1:694515049428:web:6ce3a7bd581fb1ff69ec41"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Shared workspace data reference
const workspaceRef = ref(db, "nexus-workspace");

// Save data to Firebase (shared with all users)
export async function saveShared(data) {
  try {
    await set(workspaceRef, JSON.stringify(data));
  } catch (e) {
    console.error("Save failed:", e);
  }
}

// Listen for real-time data changes
export function onDataChange(callback) {
  return onValue(workspaceRef, (snapshot) => {
    if (snapshot.exists()) {
      try {
        const data = JSON.parse(snapshot.val());
        callback(data);
      } catch {
        callback(null);
      }
    } else {
      callback(null);
    }
  });
}

export { db };
