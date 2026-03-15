import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

// ─── YOUR FIREBASE CONFIG ───
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
const workspaceRef = ref(db, "nexus-workspace");

// ─── AES-256-GCM ENCRYPTION (encrypts ALL data) ───
const ENC_KEY = "NexusWorkspace#FullEncrypt!2026#SecureVault";
const ENC_SALT = "NexusFullEncSalt2026";

async function deriveKey(passphrase) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(ENC_SALT), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function encrypt(plainText) {
  try {
    const key = await deriveKey(ENC_KEY);
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plainText));
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch (e) {
    console.error("Encryption failed:", e);
    return null;
  }
}

async function decrypt(cipherB64) {
  try {
    const key = await deriveKey(ENC_KEY);
    const raw = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("Decryption failed:", e);
    return null;
  }
}

// ─── SAVE: Encrypt everything → store ciphertext ───
export async function saveShared(data) {
  try {
    const plainJson = JSON.stringify(data);
    const encrypted = await encrypt(plainJson);
    if (encrypted) {
      await set(workspaceRef, encrypted);
    }
  } catch (e) {
    console.error("Save failed:", e);
  }
}

// ─── LISTEN: Decrypt ciphertext → return data ───
export function onDataChange(callback) {
  return onValue(workspaceRef, async (snapshot) => {
    if (snapshot.exists()) {
      try {
        const val = snapshot.val();
        if (typeof val === "string" && val.length > 100) {
          const decrypted = await decrypt(val);
          if (decrypted) {
            callback(JSON.parse(decrypted));
            return;
          }
        }
        if (typeof val === "object") {
          callback(val);
          return;
        }
        if (typeof val === "string") {
          try { callback(JSON.parse(val)); return; } catch {}
        }
        callback(null);
      } catch {
        callback(null);
      }
    } else {
      callback(null);
    }
  });
}

export { db };
