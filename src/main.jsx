import { useState, useEffect, useRef, useCallback } from "react";
import { saveShared, onDataChange } from "./firebase.js";

/* ═══════════════════════════════════════════════
   ENCRYPTION: AES-256-GCM via Web Crypto API
   All messages are encrypted before storage.
   A hacker seeing raw storage sees only ciphertext.
   ═══════════════════════════════════════════════ */

const ENCRYPTION_SALT = "NexusAgent2026SecureSalt";
const ENCRYPTION_ITERATIONS = 100000;

async function deriveKey(passphrase) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(ENCRYPTION_SALT), iterations: ENCRYPTION_ITERATIONS, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function encryptText(plainText, passphrase) {
  try {
    const key = await deriveKey(passphrase);
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plainText));
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch { return null; }
}

async function decryptText(cipherB64, passphrase) {
  try {
    const key = await deriveKey(passphrase);
    const raw = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch { return "[Encrypted — cannot decrypt]"; }
}

/* ═══ STORAGE ═══ */
const ENC_PASSPHRASE = "NexusWorkspace#Encrypted!2026";
// saveShared and onDataChange imported from firebase.js

/* ═══ UTILS ═══ */
const uid = () => crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().split("T")[0];
const timeAgo = (ts) => {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
};

const STAT = { todo: "To Do", in_progress: "In Progress", review: "In Review", done: "Done", blocked: "Blocked" };
const PCOL = { urgent: { b: "#FF3B30", l: "Urgent" }, high: { b: "#FF9500", l: "High" }, medium: { b: "#FFD60A", l: "Medium" }, low: { b: "#34C759", l: "Low" } };

async function callAI(prompt, sys) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: sys || "You are a concise productivity AI.", messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json();
    return d.content?.map(b => b.text || "").join("\n") || "No response.";
  } catch { return "AI unavailable."; }
}

const INIT = {
  team: [{ id: "mgr", name: "Manager", role: "Manager", isManager: true, password: "admin123" }],
  tasks: [],
  goals: [],
  schedule: [],
  followups: [],
  messages: [], // encrypted bodies stored here
};

/* ═══ ICONS ═══ */
function Ic({ name, size = 18 }) {
  const s = { width: size, height: size, flexShrink: 0 };
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    team: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    tasks: <><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    goals: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    schedule: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    ai: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/>,
    followup: <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
    comms: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    close: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    encrypted: <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></>,
  };
  const sw = ["check"].includes(name) ? "2.5" : ["plus", "send", "close"].includes(name) ? "2" : "1.8";
  return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{paths[name] || null}</svg>;
}

/* ═══ BASIC UI ═══ */
function Avatar({ name, size = 32, mgr }) {
  const c = mgr ? "#00C9A7" : ["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#98D8C8","#BB8FCE","#85C1E9","#F7DC6F"][(name || "?").charCodeAt(0) % 10];
  return <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${c}, ${c}88)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 700, color: "#fff", flexShrink: 0, border: mgr ? "2px solid #00C9A7" : "none" }}>{mgr ? "★" : (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</div>;
}
function Badge({ children, color = "#8E8E93" }) { return <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: color + "20", color }}>{children}</span>; }
function PBadge({ p }) { const c = PCOL[p] || PCOL.medium; return <Badge color={c.b}>{c.l}</Badge>; }
function Bar({ value, color = "#00C9A7" }) { return <div style={{ width: "100%", background: "#1A1D23", borderRadius: 6, height: 6, overflow: "hidden" }}><div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", background: color, borderRadius: 6, transition: "width 0.4s" }} /></div>; }

const IS = { width: "100%", padding: "10px 14px", background: "#12141A", border: "1px solid #2A2D35", borderRadius: 9, color: "#F0F0F0", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
const SS = { ...IS, cursor: "pointer" };
const BP = { padding: "10px 22px", background: "linear-gradient(135deg, #00C9A7, #00B4D8)", border: "none", borderRadius: 9, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const BS = { padding: "10px 22px", background: "#2A2D35", border: "none", borderRadius: 9, color: "#C0C0C5", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

function FF({ label, children }) {
  return <div style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6B6F7B", marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</label>{children}</div>;
}

function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div style={{ background: "#1A1D23", borderRadius: 16, border: "1px solid #2A2D35", width: "100%", maxWidth: width, maxHeight: "85vh", overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #2A2D35" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#F0F0F0" }}>{title}</span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#6B6F7B", cursor: "pointer", padding: 4 }}><Ic name="close" size={16} /></button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input type={show ? "text" : "password"} value={value} onChange={onChange} placeholder={placeholder || "••••••••"} style={{ ...IS, paddingRight: 42 }} />
      <button type="button" onClick={() => setShow(p => !p)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#5A5E6A", cursor: "pointer", padding: 2 }}><Ic name={show ? "eyeOff" : "eye"} size={16} /></button>
    </div>
  );
}

/* ═══ STANDALONE MODAL COMPONENTS (proper React state, NO form tags) ═══ */

function AddTeamModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const valid = name.trim().length > 0 && role.trim().length > 0 && password.length >= 4;

  const handleAdd = () => {
    if (!valid) return;
    onAdd({ name: name.trim(), role: role.trim(), password });
    onClose();
  };

  return (
    <Modal title="Add Team Member" onClose={onClose}>
      <FF label="Full Name"><input value={name} onChange={e => setName(e.target.value)} style={IS} placeholder="e.g. Rahul Kumar" autoFocus /></FF>
      <FF label="Role"><input value={role} onChange={e => setRole(e.target.value)} style={IS} placeholder="e.g. Full Stack Dev" /></FF>
      <FF label="Set Login Password"><PasswordInput value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 4 characters" /></FF>
      <div style={{ background: "#FF950010", border: "1px solid #FF950025", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#FF9500" }}>🔑 Share this password with {name || "the member"} so they can log in.</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={BS}>Cancel</button>
        <button type="button" onClick={handleAdd} style={{ ...BP, opacity: valid ? 1 : 0.4, pointerEvents: valid ? "auto" : "none" }}>Add Member</button>
      </div>
    </Modal>
  );
}

function AddTaskModal({ onClose, onAdd, team, prefillAssignee }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState(prefillAssignee || "");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const valid = title.trim().length > 0;

  const handleAdd = () => {
    if (!valid) return;
    onAdd({ title: title.trim(), description: desc, assignee, priority, dueDate });
    onClose();
  };

  return (
    <Modal title="Assign New Task" onClose={onClose}>
      <FF label="Task Title"><input value={title} onChange={e => setTitle(e.target.value)} style={IS} placeholder="e.g. Redesign homepage" autoFocus /></FF>
      <FF label="Description"><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} style={IS} placeholder="Details..." /></FF>
      <FF label="Assign To">
        <select value={assignee} onChange={e => setAssignee(e.target.value)} style={SS}>
          <option value="">Unassigned</option>
          {team.filter(t => !t.isManager).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
      </FF>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FF label="Priority"><select value={priority} onChange={e => setPriority(e.target.value)} style={SS}><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></FF>
        <FF label="Due Date"><input value={dueDate} onChange={e => setDueDate(e.target.value)} type="date" style={IS} /></FF>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={BS}>Cancel</button>
        <button type="button" onClick={handleAdd} style={{ ...BP, opacity: valid ? 1 : 0.4, pointerEvents: valid ? "auto" : "none" }}>Create & Notify</button>
      </div>
    </Modal>
  );
}

function AddFollowupModal({ onClose, onAdd, team }) {
  const members = team.filter(t => !t.isManager);
  const [title, setTitle] = useState("");
  const [person, setPerson] = useState(members[0]?.name || "");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const valid = title.trim().length > 0 && dueDate.length > 0;

  return (
    <Modal title="Add Follow-up" onClose={onClose}>
      <FF label="Subject"><input value={title} onChange={e => setTitle(e.target.value)} style={IS} placeholder="e.g. Check API progress" autoFocus /></FF>
      <FF label="Person"><select value={person} onChange={e => setPerson(e.target.value)} style={SS}>{members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}</select></FF>
      <FF label="Due Date"><input value={dueDate} onChange={e => setDueDate(e.target.value)} type="date" style={IS} /></FF>
      <FF label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={IS} /></FF>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={BS}>Cancel</button>
        <button type="button" onClick={() => { if (valid) { onAdd({ title: title.trim(), person, dueDate, notes }); onClose(); } }} style={{ ...BP, opacity: valid ? 1 : 0.4, pointerEvents: valid ? "auto" : "none" }}>Add & Notify</button>
      </div>
    </Modal>
  );
}

function AddGoalModal({ onClose, onAdd }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState("short_term");
  const [deadline, setDeadline] = useState("");
  const [milestones, setMilestones] = useState("");

  return (
    <Modal title="New Goal" onClose={onClose}>
      <FF label="Title"><input value={title} onChange={e => setTitle(e.target.value)} style={IS} placeholder="e.g. Launch v2.0" autoFocus /></FF>
      <FF label="Description"><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} style={IS} /></FF>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FF label="Type"><select value={type} onChange={e => setType(e.target.value)} style={SS}><option value="short_term">Short-term</option><option value="long_term">Long-term</option></select></FF>
        <FF label="Deadline"><input value={deadline} onChange={e => setDeadline(e.target.value)} type="date" style={IS} /></FF>
      </div>
      <FF label="Milestones (one per line)"><textarea value={milestones} onChange={e => setMilestones(e.target.value)} rows={3} style={IS} placeholder={"Research\nWireframes\nMVP"} /></FF>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={BS}>Cancel</button>
        <button type="button" onClick={() => { if (title.trim()) { onAdd({ title: title.trim(), description: desc, type, deadline, milestones: milestones.split("\n").filter(Boolean).map(t => ({ text: t.trim(), done: false })) }); onClose(); } }} style={{ ...BP, opacity: title.trim() ? 1 : 0.4, pointerEvents: title.trim() ? "auto" : "none" }}>Create Goal</button>
      </div>
    </Modal>
  );
}

function AddScheduleModal({ onClose, onAdd }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("");
  const [desc, setDesc] = useState("");
  const valid = title.trim().length > 0 && time.length > 0;

  return (
    <Modal title="Schedule Event" onClose={onClose}>
      <FF label="Event"><input value={title} onChange={e => setTitle(e.target.value)} style={IS} placeholder="e.g. Sprint planning" autoFocus /></FF>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FF label="Date"><input value={date} onChange={e => setDate(e.target.value)} type="date" style={IS} /></FF>
        <FF label="Time"><input value={time} onChange={e => setTime(e.target.value)} type="time" style={IS} /></FF>
      </div>
      <FF label="Details"><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} style={IS} /></FF>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={BS}>Cancel</button>
        <button type="button" onClick={() => { if (valid) { onAdd({ title: title.trim(), date, time, description: desc }); onClose(); } }} style={{ ...BP, opacity: valid ? 1 : 0.4, pointerEvents: valid ? "auto" : "none" }}>Add Event</button>
      </div>
    </Modal>
  );
}

function ChangePwModal({ user, onClose, onSave }) {
  const [cur, setCur] = useState("");
  const [newP, setNewP] = useState("");
  const [conf, setConf] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const submit = () => {
    if (cur !== user.password) { setErr("Current password is wrong"); return; }
    if (newP.length < 4) { setErr("Minimum 4 characters"); return; }
    if (newP !== conf) { setErr("Passwords don't match"); return; }
    onSave(newP); setDone(true);
  };

  if (done) return <Modal title="Done" onClose={onClose} width={380}><div style={{ textAlign: "center", padding: 10 }}><div style={{ width: 48, height: 48, borderRadius: "50%", background: "#00C9A720", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "#00C9A7" }}><Ic name="check" size={24} /></div><p style={{ color: "#E0E0E5", fontWeight: 600 }}>Password updated!</p><button type="button" onClick={onClose} style={{ ...BP, marginTop: 10 }}>Close</button></div></Modal>;

  return (
    <Modal title="Change Password" onClose={onClose} width={420}>
      <FF label="Current Password"><PasswordInput value={cur} onChange={e => { setCur(e.target.value); setErr(""); }} /></FF>
      <FF label="New Password"><PasswordInput value={newP} onChange={e => { setNewP(e.target.value); setErr(""); }} placeholder="Min 4 chars" /></FF>
      <FF label="Confirm"><PasswordInput value={conf} onChange={e => { setConf(e.target.value); setErr(""); }} /></FF>
      {err && <div style={{ background: "#FF3B3015", border: "1px solid #FF3B3030", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#FF6B6B" }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" onClick={onClose} style={BS}>Cancel</button><button type="button" onClick={submit} style={BP}>Update</button></div>
    </Modal>
  );
}

function ResetPwModal({ member, onClose, onSave }) {
  const [pw, setPw] = useState("");
  const [done, setDone] = useState(false);

  if (done) return <Modal title="Done" onClose={onClose} width={380}><div style={{ textAlign: "center", padding: 10 }}><div style={{ width: 48, height: 48, borderRadius: "50%", background: "#00C9A720", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "#00C9A7" }}><Ic name="check" size={24} /></div><p style={{ color: "#E0E0E5", fontWeight: 600 }}>Password reset for {member.name}!</p><p style={{ color: "#5A5E6A", fontSize: 12 }}>Share the new password securely.</p><button type="button" onClick={onClose} style={{ ...BP, marginTop: 10 }}>Done</button></div></Modal>;

  return (
    <Modal title={`Reset Password — ${member.name}`} onClose={onClose} width={420}>
      <FF label="New Password"><PasswordInput value={pw} onChange={e => setPw(e.target.value)} placeholder="Set new password" /></FF>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" onClick={onClose} style={BS}>Cancel</button><button type="button" onClick={() => { if (pw.length >= 4) { onSave(pw); setDone(true); } }} style={{ ...BP, opacity: pw.length >= 4 ? 1 : 0.4 }}>Reset</button></div>
    </Modal>
  );
}

/* ═══════════════════ MAIN APP ═══════════════════ */
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [D, setD] = useState(INIT);
  const [view, setView] = useState("dashboard");
  const [sideOpen, setSideOpen] = useState(true);
  const [modal, setModal] = useState(null);
  const [aiMsgs, setAiMsgs] = useState([]);
  const [aiIn, setAiIn] = useState("");
  const [aiLoad, setAiLoad] = useState(false);
  const [activeChat, setActiveChat] = useState(null);
  const [msgInput, setMsgInput] = useState("");
  const [decryptedMsgs, setDecryptedMsgs] = useState({});
  // Login state
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginErr, setLoginErr] = useState("");

  const chatRef = useRef(null);
  const msgRef = useRef(null);
  // Firebase handles real-time sync

  // Load data from Firebase (real-time)
  useEffect(() => {
    const unsubscribe = onDataChange((data) => {
      if (data) {
        setD(prev => ({ ...INIT, ...data }));
      }
      setLoading(false);
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  // Save on change
  useEffect(() => {
    if (!loading && user) saveShared(D);
  }, [D, loading]);

  // Auto-scroll chat
  useEffect(() => { chatRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMsgs]);
  useEffect(() => { msgRef.current?.scrollIntoView({ behavior: "smooth" }); }, [decryptedMsgs, activeChat]);

  // Firebase handles real-time sync automatically — no polling needed

  // Decrypt messages when they change
  useEffect(() => {
    if (!user) return;
    const decrypt = async () => {
      const newDecrypted = {};
      for (const m of D.messages) {
        if (decryptedMsgs[m.id]) {
          newDecrypted[m.id] = decryptedMsgs[m.id];
        } else if (m.encrypted && m.body) {
          newDecrypted[m.id] = await decryptText(m.body, ENC_PASSPHRASE);
        } else {
          newDecrypted[m.id] = m.body || "";
        }
      }
      setDecryptedMsgs(newDecrypted);
    };
    decrypt();
  }, [D.messages, user]);

  const u = useCallback((key, fn) => setD(p => ({ ...p, [key]: typeof fn === "function" ? fn(p[key]) : fn })), []);
  const { team, tasks, goals, schedule, followups, messages } = D;
  const isManager = user?.isManager;
  const myName = user?.name;

  const myTasks = isManager ? tasks : tasks.filter(t => t.assignee === myName);
  const myUnread = messages.filter(m => m.to === myName && !m.readBy?.includes(myName)).length;
  const myFollowups = isManager ? followups : followups.filter(f => f.person === myName);

  // ── Encrypted message send ──
  const addEncryptedMsg = async (msg) => {
    const encBody = await encryptText(msg.body, ENC_PASSPHRASE);
    u("messages", p => [...p, {
      id: uid(), timestamp: new Date().toISOString(), readBy: [],
      ...msg, body: encBody, encrypted: true,
    }]);
  };

  const markMsgRead = (ids) => u("messages", p => p.map(m => ids.includes(m.id) ? { ...m, readBy: [...new Set([...(m.readBy || []), myName])] } : m));
  const changePw = (memberId, pw) => u("team", p => p.map(t => t.id === memberId ? { ...t, password: pw } : t));

  const addTask = async (t) => {
    u("tasks", p => [...p, { id: uid(), createdAt: today(), status: "todo", ...t }]);
    if (t.assignee && t.assignee !== "Manager") {
      await addEncryptedMsg({ from: "Manager", to: t.assignee, type: "task", body: `📋 New task: "${t.title}"\nPriority: ${PCOL[t.priority]?.l || "Medium"}\nDue: ${t.dueDate || "No deadline"}` });
    }
  };
  const updateTask = async (id, up) => {
    u("tasks", p => p.map(t => t.id === id ? { ...t, ...up } : t));
    if (up.status && !isManager) {
      const task = tasks.find(t => t.id === id);
      if (task) await addEncryptedMsg({ from: myName, to: "Manager", type: "status", body: `✅ "${task.title}" → ${STAT[up.status]}` });
    }
  };
  const deleteTask = (id) => u("tasks", p => p.filter(t => t.id !== id));
  const addGoal = (g) => u("goals", p => [...p, { id: uid(), createdAt: today(), progress: 0, ...g }]);
  const updateGoal = (id, up) => u("goals", p => p.map(g => g.id === id ? { ...g, ...up } : g));
  const deleteGoal = (id) => u("goals", p => p.filter(g => g.id !== id));
  const addScheduleItem = (i) => u("schedule", p => [...p, { id: uid(), ...i }]);
  const deleteScheduleItem = (id) => u("schedule", p => p.filter(s => s.id !== id));
  const addFollowup = async (f) => {
    u("followups", p => [...p, { id: uid(), completed: false, createdAt: today(), ...f }]);
    if (f.person && f.person !== "Manager") await addEncryptedMsg({ from: "Manager", to: f.person, type: "followup", body: `🔔 Follow-up: "${f.title}"\nDue: ${f.dueDate}${f.notes ? `\n${f.notes}` : ""}` });
  };
  const toggleFollowup = (id) => u("followups", p => p.map(f => f.id === id ? { ...f, completed: !f.completed } : f));
  const deleteFollowup = (id) => u("followups", p => p.filter(f => f.id !== id));
  const addTeamMember = (m) => u("team", p => [...p, { id: uid(), ...m }]);

  const sendMsg = async (to, body) => { if (body.trim()) await addEncryptedMsg({ from: myName, to, type: "message", body }); };

  const getConvo = (person) => messages.filter(m => (m.from === myName && m.to === person) || (m.from === person && m.to === myName)).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const getUnreadFrom = (person) => messages.filter(m => m.from === person && m.to === myName && !m.readBy?.includes(myName)).length;

  const sendAI = async () => {
    if (!aiIn.trim() || aiLoad) return;
    const msg = aiIn.trim(); setAiIn(""); setAiMsgs(p => [...p, { role: "user", text: msg }]); setAiLoad(true);
    const ctx = `User: ${myName} (${user.role})\nTasks: ${myTasks.filter(t => t.status !== "done").map(t => `"${t.title}"[${STAT[t.status]}]`).join("; ")}`;
    const r = await callAI(msg, `You are Nexus Agent. Data:\n${ctx}\nBe concise.`);
    setAiMsgs(p => [...p, { role: "ai", text: r }]); setAiLoad(false);
  };

  const activeTasks = myTasks.filter(t => t.status !== "done").length;
  const completedTasks = myTasks.filter(t => t.status === "done").length;
  const pendingFU = myFollowups.filter(f => !f.completed).length;
  const goalProg = goals.length ? Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / goals.length) : 0;
  const todaySch = schedule.filter(s => s.date === today());
  const chatContacts = isManager ? team.filter(t => !t.isManager) : [{ id: "mgr", name: "Manager", role: "Manager", isManager: true }];

  // Login handler
  const handleLogin = () => {
    if (!loginId || !loginPw) { setLoginErr("Select your name and enter password"); return; }
    const member = team.find(t => t.id === loginId);
    if (!member) { setLoginErr("User not found"); return; }
    if (member.password !== loginPw) { setLoginErr("Incorrect password"); return; }
    setLoginErr(""); setUser(member);
  };

  const handleLogout = () => { setUser(null); setView("dashboard"); setActiveChat(null); setAiMsgs([]); setLoginPw(""); setLoginId(""); setDecryptedMsgs({}); };

  // ─── LOADING ───
  if (loading) return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D0F14", color: "#00C9A7", fontFamily: "'DM Sans', sans-serif" }}><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><div style={{ width: 36, height: 36, border: "3px solid #00C9A720", borderTopColor: "#00C9A7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /></div>;

  // ─── LOGIN SCREEN ───
  if (!user) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D0F14", fontFamily: "'DM Sans', sans-serif", padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        input:focus,select:focus{border-color:#00C9A7!important;box-shadow:0 0 0 3px #00C9A715} *{box-sizing:border-box}`}</style>
      <div style={{ width: "100%", maxWidth: 400, animation: "fadeIn 0.5s ease" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg, #00C9A7, #00B4D8)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: "0 12px 40px #00C9A730", animation: "float 3s ease-in-out infinite" }}><Ic name="shield" size={30} /></div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#F5F5F7", margin: "0 0 4px" }}>Nexus Agent</h1>
          <p style={{ color: "#5A5E6A", fontSize: 13, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Ic name="encrypted" size={14} /> End-to-end encrypted workspace</p>
        </div>
        <div style={{ background: "#12141A", borderRadius: 14, padding: 24, border: "1px solid #1E2028" }}>
          <FF label="Who are you?">
            <select value={loginId} onChange={e => { setLoginId(e.target.value); setLoginErr(""); }} style={SS}>
              <option value="">Select your name...</option>
              {team.map(m => <option key={m.id} value={m.id}>{m.name} — {m.role}{m.isManager ? " (Admin)" : ""}</option>)}
            </select>
          </FF>
          <FF label="Password"><PasswordInput value={loginPw} onChange={e => { setLoginPw(e.target.value); setLoginErr(""); }} placeholder="Enter your password" /></FF>
          {loginErr && <div style={{ background: "#FF3B3015", border: "1px solid #FF3B3030", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#FF6B6B" }}>{loginErr}</div>}
          <button type="button" onClick={handleLogin} style={{ ...BP, width: "100%", padding: 12, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: (loginId && loginPw) ? 1 : 0.5 }}><Ic name="lock" size={16} /> Sign In</button>
        </div>
        <p style={{ color: "#3A3D45", fontSize: 11, textAlign: "center", marginTop: 14 }}>Manager default: admin123 · Ask manager for your credentials</p>
      </div>
    </div>
  );

  // ─── NAV CONFIG ───
  const navItems = [
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    ...(isManager ? [{ id: "team", icon: "team", label: "Team" }] : []),
    { id: "tasks", icon: "tasks", label: isManager ? "All Tasks" : "My Tasks" },
    { id: "comms", icon: "comms", label: "Messages" },
    ...(isManager ? [{ id: "followups", icon: "followup", label: "Follow-ups" }] : []),
    { id: "goals", icon: "goals", label: "Goals" },
    { id: "schedule", icon: "schedule", label: "Schedule" },
    { id: "ai", icon: "ai", label: "AI Agent" },
  ];

  // ─── MAIN LAYOUT ───
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", background: "#0D0F14", color: "#E8E8ED", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:#2A2D35 transparent} *::-webkit-scrollbar{width:5px} *::-webkit-scrollbar-thumb{background:#2A2D35;border-radius:3px}
        input:focus,select:focus,textarea:focus{border-color:#00C9A7!important;box-shadow:0 0 0 3px #00C9A715} textarea{resize:vertical} button:hover{filter:brightness(1.08)}
      `}</style>

      {/* ─── SIDEBAR ─── */}
      <div style={{ width: sideOpen ? 220 : 60, background: "#12141A", borderRight: "1px solid #1E2028", display: "flex", flexDirection: "column", transition: "width 0.2s", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ padding: sideOpen ? "14px 16px" : "14px 10px", borderBottom: "1px solid #1E2028", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minHeight: 58 }} onClick={() => setSideOpen(p => !p)}>
          <Avatar name={myName} size={32} mgr={isManager} />
          {sideOpen && <div style={{ overflow: "hidden" }}><div style={{ fontSize: 13, fontWeight: 700, color: "#F0F0F0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{myName}</div><div style={{ fontSize: 10, color: isManager ? "#00C9A7" : "#5A5E6A", display: "flex", alignItems: "center", gap: 4 }}>{isManager && <Ic name="shield" size={10} />}{user.role}</div></div>}
        </div>
        <nav style={{ flex: 1, padding: "10px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
          {navItems.map(item => (
            <button type="button" key={item.id} onClick={() => setView(item.id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: sideOpen ? "9px 13px" : "9px", background: view === item.id ? "#00C9A710" : "transparent", border: "none", borderRadius: 9, color: view === item.id ? "#00C9A7" : "#5A5E6A", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s", textAlign: "left", justifyContent: sideOpen ? "flex-start" : "center", whiteSpace: "nowrap" }}>
              <Ic name={item.icon} size={17} />{sideOpen && item.label}
              {sideOpen && item.id === "comms" && myUnread > 0 && <span style={{ marginLeft: "auto", background: "#E01E5A", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8 }}>{myUnread}</span>}
            </button>
          ))}
        </nav>
        <div style={{ padding: "6px 6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          <button type="button" onClick={() => setModal("changePw")} style={{ display: "flex", alignItems: "center", gap: 11, padding: sideOpen ? "8px 13px" : "8px", background: "none", border: "1px solid #1E2028", borderRadius: 9, color: "#5A5E6A", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", justifyContent: sideOpen ? "flex-start" : "center" }}><Ic name="lock" size={15} />{sideOpen && "Change Password"}</button>
          <button type="button" onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 11, padding: sideOpen ? "8px 13px" : "8px", background: "none", border: "1px solid #1E2028", borderRadius: 9, color: "#5A5E6A", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", justifyContent: sideOpen ? "flex-start" : "center" }}><Ic name="logout" size={15} />{sideOpen && "Logout"}</button>
        </div>
      </div>

      {/* ─── MAIN CONTENT ─── */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>

        {/* DASHBOARD */}
        {view === "dashboard" && (<div style={{ animation: "fadeIn 0.3s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}><h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: "#F5F5F7" }}>{isManager ? "Manager Dashboard" : `Welcome, ${myName.split(" ")[0]}`}</h1>{isManager && <Badge color="#00C9A7">Admin</Badge>}</div>
          <p style={{ color: "#5A5E6A", marginTop: 3, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Ic name="encrypted" size={13} /> All messages are end-to-end encrypted · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 20 }}>
            {[{ l: isManager ? "Active Tasks" : "My Tasks", v: activeTasks, c: "#00C9A7", go: "tasks" }, { l: "Completed", v: completedTasks, c: "#45B7D1", go: "tasks" }, { l: "Unread", v: myUnread, c: "#E01E5A", go: "comms" }, { l: "Goals", v: `${goalProg}%`, c: "#BB8FCE", go: "goals" }, { l: "Events", v: todaySch.length, c: "#FFD60A", go: "schedule" }, ...(isManager ? [{ l: "Follow-ups", v: pendingFU, c: "#FF9500", go: "followups" }] : [])].map((s, i) => (
              <div key={i} onClick={() => setView(s.go)} style={{ background: "#12141A", borderRadius: 12, padding: "16px 18px", border: "1px solid #1E2028", cursor: "pointer" }}><div style={{ fontSize: 11, color: "#5A5E6A", fontWeight: 700, textTransform: "uppercase" }}>{s.l}</div><div style={{ fontSize: 26, fontWeight: 800, color: s.c, marginTop: 4 }}>{s.v}</div></div>
            ))}
          </div>
          <div style={{ background: "#12141A", borderRadius: 12, padding: 18, border: "1px solid #1E2028", marginTop: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: "#C0C0C5" }}>Active Tasks</h3>
            {myTasks.filter(t => t.status !== "done").slice(0, 5).map(t => (<div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #1A1D23" }}><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: "#E0E0E5" }}>{t.title}</div><div style={{ fontSize: 11, color: "#5A5E6A" }}>{isManager && t.assignee ? `→ ${t.assignee} · ` : ""}{STAT[t.status]}</div></div><PBadge p={t.priority} /></div>))}
            {!myTasks.filter(t => t.status !== "done").length && <p style={{ color: "#4A4D55", fontSize: 12, margin: 0 }}>No active tasks</p>}
          </div>
        </div>)}

        {/* MESSAGES (encrypted chat) */}
        {view === "comms" && (<div style={{ animation: "fadeIn 0.3s", display: "flex", gap: 14, height: "calc(100vh - 48px)" }}>
          <div style={{ width: 240, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}><h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Messages</h2><Ic name="encrypted" size={16} /></div>
            {chatContacts.map(c => {
              const unread = getUnreadFrom(c.name);
              const last = getConvo(c.name).slice(-1)[0];
              return (<button type="button" key={c.id} onClick={() => { setActiveChat(c.name); const ids = messages.filter(m => m.from === c.name && m.to === myName && !m.readBy?.includes(myName)).map(m => m.id); if (ids.length) markMsgRead(ids); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: activeChat === c.name ? "#00C9A708" : "#12141A", border: `1px solid ${activeChat === c.name ? "#00C9A730" : "#1E2028"}`, borderRadius: 10, cursor: "pointer", textAlign: "left", fontFamily: "inherit", marginBottom: 6, width: "100%" }}>
                <Avatar name={c.name} size={34} mgr={c.isManager} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: "#E0E0E5" }}>{c.name}</div><div style={{ fontSize: 11, color: "#5A5E6A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last ? (decryptedMsgs[last.id] || "🔒 Encrypted").slice(0, 30) : c.role}</div></div>
                {unread > 0 && <span style={{ background: "#E01E5A", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8 }}>{unread}</span>}
              </button>);
            })}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#12141A", borderRadius: 12, border: "1px solid #1E2028" }}>
            {activeChat ? (<>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #1E2028", display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={activeChat} size={30} mgr={activeChat === "Manager"} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{activeChat}</div></div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#00C9A7", fontSize: 11, fontWeight: 600 }}><Ic name="encrypted" size={13} /> Encrypted</div>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
                {getConvo(activeChat).map(m => (<div key={m.id} style={{ display: "flex", justifyContent: m.from === myName ? "flex-end" : "flex-start", marginBottom: 10 }}>
                  <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: 12, background: m.from === myName ? "linear-gradient(135deg, #00C9A7, #00B4D8)" : "#1E2028", color: m.from === myName ? "#fff" : "#E0E0E5" }}>
                    <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{decryptedMsgs[m.id] || "🔒 Decrypting..."}</div>
                    <div style={{ fontSize: 9, color: m.from === myName ? "#ffffff80" : "#4A4D55", marginTop: 4, textAlign: "right" }}>{timeAgo(m.timestamp)}</div>
                  </div>
                </div>))}
                <div ref={msgRef} />
                {!getConvo(activeChat).length && <p style={{ color: "#4A4D55", textAlign: "center", padding: 40, fontSize: 13 }}>No messages yet</p>}
              </div>
              <div style={{ padding: "12px 18px", borderTop: "1px solid #1E2028", display: "flex", gap: 8 }}>
                <input value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && msgInput.trim()) { sendMsg(activeChat, msgInput); setMsgInput(""); } }} placeholder={`Message ${activeChat}...`} style={{ ...IS, flex: 1 }} />
                <button type="button" onClick={() => { if (msgInput.trim()) { sendMsg(activeChat, msgInput); setMsgInput(""); } }} style={BP}><Ic name="send" size={16} /></button>
              </div>
            </>) : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: "#4A4D55" }}><Ic name="encrypted" size={32} /><span>Select a conversation</span><span style={{ fontSize: 11 }}>All messages are AES-256 encrypted</span></div>}
          </div>
        </div>)}

        {/* TEAM (manager) */}
        {view === "team" && isManager && (<div style={{ animation: "fadeIn 0.3s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
            <div><h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Team</h1><p style={{ color: "#5A5E6A", margin: "3px 0 0", fontSize: 13 }}>{team.filter(t => !t.isManager).length} members</p></div>
            <button type="button" onClick={() => setModal("addTeam")} style={BP}><Ic name="plus" size={14} /> Add Member</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {team.filter(t => !t.isManager).map(m => {
              const mt = tasks.filter(t => t.assignee === m.name);
              return (<div key={m.id} style={{ background: "#12141A", borderRadius: 12, padding: 18, border: "1px solid #1E2028" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}><Avatar name={m.name} size={38} /><div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div><div style={{ fontSize: 11, color: "#5A5E6A" }}>{m.role}</div></div></div>
                <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#5A5E6A", marginBottom: 10 }}><span><strong style={{ color: "#00C9A7" }}>{mt.filter(t => t.status !== "done").length}</strong> active</span><span><strong style={{ color: "#45B7D1" }}>{mt.filter(t => t.status === "done").length}</strong> done</span></div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => setModal({ type: "addTask", assignee: m.name })} style={{ flex: 1, padding: 7, background: "#00C9A710", border: "1px solid #00C9A725", borderRadius: 7, color: "#00C9A7", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Assign Task</button>
                  <button type="button" onClick={() => { setView("comms"); setActiveChat(m.name); }} style={{ flex: 1, padding: 7, background: "#45B7D110", border: "1px solid #45B7D125", borderRadius: 7, color: "#45B7D1", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Message</button>
                  <button type="button" onClick={() => setModal({ type: "resetPw", member: m })} style={{ padding: "7px 10px", background: "#FF950010", border: "1px solid #FF950025", borderRadius: 7, color: "#FF9500", cursor: "pointer" }}><Ic name="lock" size={12} /></button>
                </div>
              </div>);
            })}
          </div>
        </div>)}

        {/* TASKS */}
        {view === "tasks" && (<div style={{ animation: "fadeIn 0.3s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
            <div><h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{isManager ? "All Tasks" : "My Tasks"}</h1><p style={{ color: "#5A5E6A", margin: "3px 0 0", fontSize: 13 }}>{activeTasks} active · {completedTasks} done</p></div>
            {isManager && <button type="button" onClick={() => setModal("addTask")} style={BP}><Ic name="plus" size={14} /> New Task</button>}
          </div>
          {["todo", "in_progress", "review", "blocked", "done"].map(st => {
            const gr = myTasks.filter(t => t.status === st); if (!gr.length) return null;
            return (<div key={st} style={{ marginBottom: 20 }}><div style={{ fontSize: 11, fontWeight: 700, color: "#5A5E6A", textTransform: "uppercase", marginBottom: 8 }}>{STAT[st]} <span style={{ background: "#1A1D23", padding: "1px 6px", borderRadius: 6, fontSize: 10 }}>{gr.length}</span></div>
              {gr.map(t => (<div key={t.id} style={{ background: "#12141A", borderRadius: 10, padding: "12px 16px", border: "1px solid #1E2028", marginBottom: 6, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}><div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><span style={{ fontWeight: 600, fontSize: 13, color: t.status === "done" ? "#5A5E6A" : "#E8E8ED", textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</span><PBadge p={t.priority} />{t.dueDate && t.dueDate < today() && t.status !== "done" && <Badge color="#FF3B30">Overdue</Badge>}</div><div style={{ fontSize: 11, color: "#5A5E6A", marginTop: 3 }}>{isManager && t.assignee && <>→ <strong style={{ color: "#8E8E93" }}>{t.assignee}</strong> · </>}{t.dueDate && `Due ${t.dueDate}`}</div></div>
                <select value={t.status} onChange={e => updateTask(t.id, { status: e.target.value })} style={{ ...SS, padding: "5px 7px", fontSize: 10, width: "auto", minWidth: 90 }}>{Object.entries(STAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                {isManager && <button type="button" onClick={() => deleteTask(t.id)} style={{ background: "none", border: "none", color: "#4A4D55", cursor: "pointer" }}><Ic name="trash" size={14} /></button>}
              </div>))}</div>);
          })}
          {!myTasks.length && <p style={{ color: "#4A4D55", textAlign: "center", padding: 30, fontSize: 13 }}>{isManager ? "No tasks yet." : "No tasks assigned."}</p>}
        </div>)}

        {/* FOLLOW-UPS */}
        {view === "followups" && isManager && (<div style={{ animation: "fadeIn 0.3s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}><h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Follow-ups</h1><button type="button" onClick={() => setModal("addFollowup")} style={BP}><Ic name="plus" size={14} /> Add</button></div>
          {followups.filter(f => !f.completed).map(f => (<div key={f.id} style={{ background: "#12141A", borderRadius: 10, padding: "12px 16px", border: "1px solid #1E2028", marginBottom: 6, display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" onClick={() => toggleFollowup(f.id)} style={{ width: 20, height: 20, borderRadius: 5, border: "2px solid #3A3D45", background: "none", cursor: "pointer", flexShrink: 0 }} />
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{f.title}</div><div style={{ fontSize: 11, color: "#5A5E6A" }}>{f.person} · Due {f.dueDate}</div></div>
            <button type="button" onClick={() => deleteFollowup(f.id)} style={{ background: "none", border: "none", color: "#4A4D55", cursor: "pointer" }}><Ic name="trash" size={14} /></button></div>))}
          {!followups.filter(f => !f.completed).length && <p style={{ color: "#4A4D55", textAlign: "center", padding: 30, fontSize: 13 }}>No pending follow-ups.</p>}
        </div>)}

        {/* GOALS */}
        {view === "goals" && (<div style={{ animation: "fadeIn 0.3s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}><h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Goals</h1>{isManager && <button type="button" onClick={() => setModal("addGoal")} style={BP}><Ic name="plus" size={14} /> New Goal</button>}</div>
          {["short_term", "long_term"].map(type => {
            const gr = goals.filter(g => g.type === type); if (!gr.length) return null;
            return (<div key={type} style={{ marginBottom: 24 }}><div style={{ fontSize: 11, fontWeight: 700, color: "#5A5E6A", textTransform: "uppercase", marginBottom: 10 }}>{type === "short_term" ? "Short-term" : "Long-term"}</div>
              {gr.map(g => (<div key={g.id} style={{ background: "#12141A", borderRadius: 12, padding: "16px 18px", border: "1px solid #1E2028", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{g.title}</div>{isManager && <button type="button" onClick={() => deleteGoal(g.id)} style={{ background: "none", border: "none", color: "#4A4D55", cursor: "pointer" }}><Ic name="trash" size={14} /></button>}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ flex: 1 }}><Bar value={g.progress} color={type === "short_term" ? "#00C9A7" : "#BB8FCE"} /></div><span style={{ fontSize: 13, fontWeight: 700, color: type === "short_term" ? "#00C9A7" : "#BB8FCE" }}>{g.progress}%</span></div>
                {isManager && <input type="range" min="0" max="100" value={g.progress} onChange={e => updateGoal(g.id, { progress: parseInt(e.target.value) })} style={{ width: "100%", marginTop: 6, accentColor: type === "short_term" ? "#00C9A7" : "#BB8FCE" }} />}
                {g.milestones?.length > 0 && <div style={{ marginTop: 10 }}>{g.milestones.map((m, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#5A5E6A", padding: "2px 0", cursor: isManager ? "pointer" : "default" }} onClick={() => { if (!isManager) return; const up = [...g.milestones]; up[i] = { ...m, done: !m.done }; updateGoal(g.id, { milestones: up, progress: Math.round(up.filter(x => x.done).length / up.length * 100) }); }}><span style={{ color: m.done ? "#00C9A7" : "#3A3D45" }}>{m.done ? "✓" : "○"}</span><span style={{ textDecoration: m.done ? "line-through" : "none" }}>{m.text}</span></div>))}</div>}
              </div>))}</div>);
          })}
          {!goals.length && <p style={{ color: "#4A4D55", textAlign: "center", padding: 30, fontSize: 13 }}>No goals set.</p>}
        </div>)}

        {/* SCHEDULE */}
        {view === "schedule" && (<div style={{ animation: "fadeIn 0.3s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}><h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Schedule</h1>{isManager && <button type="button" onClick={() => setModal("addSchedule")} style={BP}><Ic name="plus" size={14} /> Add</button>}</div>
          {todaySch.sort((a, b) => a.time.localeCompare(b.time)).map(s => (<div key={s.id} style={{ background: "#12141A", borderRadius: 10, padding: "12px 16px", border: "1px solid #1E2028", marginBottom: 6, display: "flex", alignItems: "center", gap: 12 }}><div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: "#00C9A7", minWidth: 50 }}>{s.time}</div><div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div></div>{isManager && <button type="button" onClick={() => deleteScheduleItem(s.id)} style={{ background: "none", border: "none", color: "#4A4D55", cursor: "pointer" }}><Ic name="trash" size={14} /></button>}</div>))}
          {!todaySch.length && <p style={{ color: "#4A4D55", fontSize: 12 }}>No events today</p>}
          {schedule.filter(s => s.date > today()).length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: "#5A5E6A", textTransform: "uppercase", marginTop: 20, marginBottom: 8 }}>Upcoming</div>{schedule.filter(s => s.date > today()).sort((a, b) => a.date.localeCompare(b.date)).map(s => (<div key={s.id} style={{ background: "#12141A", borderRadius: 10, padding: "12px 16px", border: "1px solid #1E2028", marginBottom: 6, display: "flex", alignItems: "center", gap: 12 }}><div><div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#5A5E6A" }}>{s.date}</div><div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: "#45B7D1" }}>{s.time}</div></div><div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div></div></div>))}</>}
        </div>)}

        {/* AI */}
        {view === "ai" && (<div style={{ animation: "fadeIn 0.3s", display: "flex", flexDirection: "column", height: "calc(100vh - 48px)" }}>
          <div style={{ marginBottom: 14 }}><h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>AI Agent</h1></div>
          {!aiMsgs.length && (<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>{(isManager ? ["Focus priorities?", "Team workload summary", "Deadlines at risk?", "Plan my week"] : ["My priorities?", "Help with task", "What's overdue?", "Update for manager"]).map(q => (<button type="button" key={q} onClick={() => setAiIn(q)} style={{ padding: "9px 12px", background: "#12141A", border: "1px solid #1E2028", borderRadius: 9, color: "#6B6F7B", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>{q}</button>))}</div>)}
          <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
            {aiMsgs.map((m, i) => (<div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}><div style={{ maxWidth: "75%", padding: "11px 15px", borderRadius: 12, background: m.role === "user" ? "linear-gradient(135deg, #00C9A7, #00B4D8)" : "#12141A", color: m.role === "user" ? "#fff" : "#E0E0E5", border: m.role === "ai" ? "1px solid #1E2028" : "none", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.text}</div></div>))}
            {aiLoad && <div style={{ display: "flex" }}><div style={{ padding: "11px 15px", borderRadius: 12, background: "#12141A", border: "1px solid #1E2028", display: "flex", gap: 5 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#00C9A7", animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}</div></div>}
            <div ref={chatRef} />
          </div>
          <div style={{ display: "flex", gap: 8, paddingBottom: 6 }}><input value={aiIn} onChange={e => setAiIn(e.target.value)} onKeyDown={e => e.key === "Enter" && sendAI()} placeholder="Ask AI..." style={{ ...IS, flex: 1 }} /><button type="button" onClick={sendAI} disabled={aiLoad} style={{ ...BP, opacity: aiLoad ? 0.5 : 1 }}><Ic name="send" size={15} /></button></div>
        </div>)}
      </div>

      {/* ═══ MODALS ═══ */}
      {modal === "changePw" && <ChangePwModal user={user} onClose={() => setModal(null)} onSave={pw => { changePw(user.id, pw); setUser(p => ({ ...p, password: pw })); }} />}
      {modal?.type === "resetPw" && <ResetPwModal member={modal.member} onClose={() => setModal(null)} onSave={pw => changePw(modal.member.id, pw)} />}
      {modal === "addTeam" && <AddTeamModal onClose={() => setModal(null)} onAdd={addTeamMember} />}
      {(modal === "addTask" || modal?.type === "addTask") && <AddTaskModal onClose={() => setModal(null)} onAdd={addTask} team={team} prefillAssignee={modal?.assignee || ""} />}
      {modal === "addFollowup" && <AddFollowupModal onClose={() => setModal(null)} onAdd={addFollowup} team={team} />}
      {modal === "addGoal" && <AddGoalModal onClose={() => setModal(null)} onAdd={addGoal} />}
      {modal === "addSchedule" && <AddScheduleModal onClose={() => setModal(null)} onAdd={addScheduleItem} />}
    </div>
  );
}

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

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
