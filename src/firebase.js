import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get } from "firebase/database";

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
const wsRef = ref(db, "nexus-workspace");

const ENC_KEY = "NexusWorkspace#FullEncrypt!2026#SecureVault";
const ENC_SALT = "NexusFullEncSalt2026";

async function deriveKey() {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey("raw", enc.encode(ENC_KEY), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode(ENC_SALT), iterations: 100000, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encrypt(text) {
  try {
    const key = await deriveKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch (e) { console.error("Encrypt fail:", e); return null; }
}

async function decrypt(b64) {
  try {
    const key = await deriveKey();
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
    return new TextDecoder().decode(decrypted);
  } catch (e) { console.error("Decrypt fail:", e); return null; }
}

// SAVE: encrypt entire workspace, write to Firebase
export async function saveData(data) {
  try {
    const json = JSON.stringify(data);
    const enc = await encrypt(json);
    if (enc) await set(wsRef, enc);
    return true;
  } catch (e) { console.error("Save fail:", e); return false; }
}

// LOAD: read from Firebase, decrypt
export async function loadData() {
  try {
    const snap = await get(wsRef);
    if (!snap.exists()) return null;
    const val = snap.val();
    if (typeof val === "string" && val.length > 100) {
      const dec = await decrypt(val);
      if (dec) return JSON.parse(dec);
    }
    // Fallback: old unencrypted data
    if (typeof val === "object") return val;
    if (typeof val === "string") { try { return JSON.parse(val); } catch {} }
    return null;
  } catch (e) { console.error("Load fail:", e); return null; }
}
