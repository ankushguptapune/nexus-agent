// ═══════════════════════════════════════════════════════
// FIREBASE CONFIGURATION
// Replace the values below with YOUR Firebase project config
// (Step-by-step guide is in DEPLOY-GUIDE.md)
// ═══════════════════════════════════════════════════════

import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://PASTE_YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
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
