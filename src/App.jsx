import { useState, useEffect, useRef, useCallback } from "react";
import { saveData, loadData } from "./firebase.js";

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().split("T")[0];
const timeAgo = (ts) => { const d = Date.now() - new Date(ts).getTime(); if (d < 60000) return "just now"; if (d < 3600000) return `${Math.floor(d / 60000)}m ago`; if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`; return `${Math.floor(d / 86400000)}d ago`; };
const STAT = { todo: "To Do", in_progress: "In Progress", review: "In Review", done: "Done", blocked: "Blocked" };
const PCOL = { urgent: { b: "#FF3B30", l: "Urgent" }, high: { b: "#FF9500", l: "High" }, medium: { b: "#FFD60A", l: "Medium" }, low: { b: "#34C759", l: "Low" } };

async function callAI(prompt, sys) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: sys || "You are a concise productivity AI.", messages: [{ role: "user", content: prompt }] }) });
    const d = await r.json(); return d.content?.map(b => b.text || "").join("\n") || "No response.";
  } catch { return "AI unavailable."; }
}

const INIT = {
  team: [{ id: "mgr", name: "Manager", role: "Manager", isManager: true, password: "admin123", recoveryPin: "9999" }],
  tasks: [], goals: [], schedule: [], followups: [], messages: [], projects: [],
};

/* ═══ ICONS ═══ */
function Ic({ name, size = 18 }) {
  const s = { width: size, height: size, flexShrink: 0 };
  const p = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    team: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    tasks: <><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    goals: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    schedule: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    ai: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/>,
    followup: <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
    comms: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
    project: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    close: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    encrypted: <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></>,
    key: <><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></>,
  };
  const sw = ["check"].includes(name) ? "2.5" : ["plus","send","close"].includes(name) ? "2" : "1.8";
  return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{p[name]||null}</svg>;
}

/* ═══ UI ═══ */
function Av({ name, size = 32, mgr }) {
  const c = mgr ? "#00C9A7" : ["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#98D8C8","#BB8FCE","#85C1E9","#F7DC6F"][(name||"?").charCodeAt(0)%10];
  return <div style={{ width:size, height:size, borderRadius:"50%", background:`linear-gradient(135deg,${c},${c}88)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.36, fontWeight:700, color:"#fff", flexShrink:0, border:mgr?"2px solid #00C9A7":"none" }}>{mgr?"★":(name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>;
}
function Bg({ children, color="#8E8E93" }) { return <span style={{ display:"inline-flex", padding:"2px 8px", borderRadius:6, fontSize:11, fontWeight:600, background:color+"20", color }}>{children}</span>; }
function PB({ p }) { const c=PCOL[p]||PCOL.medium; return <Bg color={c.b}>{c.l}</Bg>; }
function Br({ value, color="#00C9A7" }) { return <div style={{ width:"100%", background:"#1A1D23", borderRadius:6, height:6, overflow:"hidden" }}><div style={{ width:`${Math.min(100,Math.max(0,value))}%`, height:"100%", background:color, borderRadius:6, transition:"width 0.4s" }}/></div>; }

const IS = { width:"100%", padding:"10px 14px", background:"#12141A", border:"1px solid #2A2D35", borderRadius:9, color:"#F0F0F0", fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
const SS = { ...IS, cursor:"pointer" };
const BP = { padding:"10px 22px", background:"linear-gradient(135deg,#00C9A7,#00B4D8)", border:"none", borderRadius:9, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" };
const BS = { padding:"10px 22px", background:"#2A2D35", border:"none", borderRadius:9, color:"#C0C0C5", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" };

function FF({ label, children }) { return <div style={{ marginBottom:16 }}><label style={{ display:"block", fontSize:11, fontWeight:700, color:"#6B6F7B", marginBottom:6, letterSpacing:"0.05em", textTransform:"uppercase" }}>{label}</label>{children}</div>; }

function Modal({ title, onClose, children, width=520 }) {
  return <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }} onClick={onClose}>
    <div style={{ background:"#1A1D23", borderRadius:16, border:"1px solid #2A2D35", width:"100%", maxWidth:width, maxHeight:"85vh", overflow:"auto", boxShadow:"0 24px 80px rgba(0,0,0,0.5)" }} onClick={e=>e.stopPropagation()}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 20px", borderBottom:"1px solid #2A2D35" }}><span style={{ fontSize:15, fontWeight:700, color:"#F0F0F0" }}>{title}</span><button type="button" onClick={onClose} style={{ background:"none", border:"none", color:"#6B6F7B", cursor:"pointer", padding:4 }}><Ic name="close" size={16}/></button></div>
      <div style={{ padding:22 }}>{children}</div>
    </div>
  </div>;
}

function PwInput({ value, onChange, placeholder }) {
  const [s,setS]=useState(false);
  return <div style={{ position:"relative" }}><input type={s?"text":"password"} value={value} onChange={onChange} placeholder={placeholder||"••••••••"} style={{ ...IS, paddingRight:42 }}/><button type="button" onClick={()=>setS(p=>!p)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#5A5E6A", cursor:"pointer" }}><Ic name={s?"eyeOff":"eye"} size={16}/></button></div>;
}

/* ═══ MAIN APP ═══ */
export default function App() {
  const [user,setUser]=useState(null);
  const [loading,setLoading]=useState(true);
  const [D,setD]=useState(INIT);
  const [view,setView]=useState("dashboard");
  const [sideOpen,setSideOpen]=useState(true);
  const [modal,setModal]=useState(null);
  const [aiMsgs,setAiMsgs]=useState([]);
  const [aiIn,setAiIn]=useState("");
  const [aiLoad,setAiLoad]=useState(false);
  const [activeChat,setActiveChat]=useState(null);
  const [msgInput,setMsgInput]=useState("");
  const [loginId,setLoginId]=useState("");
  const [loginPw,setLoginPw]=useState("");
  const [loginErr,setLoginErr]=useState("");
  const [saving,setSaving]=useState(false);
  const chatRef=useRef(null);
  const msgRef=useRef(null);
  const dataRef=useRef(D);

  // Keep ref in sync
  useEffect(()=>{dataRef.current=D;},[D]);

  // Load once on mount
  useEffect(()=>{
    (async()=>{
      const d=await loadData();
      if(d) setD({...INIT,...d, projects:d.projects||[]});
      setLoading(false);
    })();
  },[]);

  // Poll for updates every 6 seconds (only when logged in)
  useEffect(()=>{
    if(!user) return;
    const interval=setInterval(async()=>{
      const d=await loadData();
      if(d) setD(prev=>{
        // Only update if remote data has more items (simple conflict resolution)
        const remote={...INIT,...d, projects:d.projects||[]};
        if(JSON.stringify(remote)!==JSON.stringify(prev)) return remote;
        return prev;
      });
    },6000);
    return ()=>clearInterval(interval);
  },[user]);

  useEffect(()=>{chatRef.current?.scrollIntoView({behavior:"smooth"});},[aiMsgs]);
  useEffect(()=>{msgRef.current?.scrollIntoView({behavior:"smooth"});},[D.messages,activeChat]);

  // ── SAVE HELPER: call this after every data change ──
  const persist=useCallback(async(newD)=>{
    setD(newD);
    setSaving(true);
    await saveData(newD);
    setSaving(false);
  },[]);

  // ── UPDATER: updates a key and saves ──
  const doUpdate=useCallback((key,fn)=>{
    setD(prev=>{
      const next={...prev,[key]:typeof fn==="function"?fn(prev[key]):fn};
      saveData(next); // fire and forget
      return next;
    });
  },[]);

  const {team,tasks,goals,schedule,followups,messages,projects}=D;
  const isManager=user?.isManager;
  const myName=user?.name;
  const myTasks=isManager?tasks:tasks.filter(t=>t.assignee===myName);
  const myUnread=messages.filter(m=>m.to===myName&&!m.readBy?.includes(myName)).length;

  // ── Actions ──
  const addMsg=(to,body,type="message")=>{
    doUpdate("messages",p=>[...p,{id:uid(),timestamp:new Date().toISOString(),readBy:[],from:myName,to,type,body}]);
  };

  const markRead=(ids)=>doUpdate("messages",p=>p.map(m=>ids.includes(m.id)?{...m,readBy:[...new Set([...(m.readBy||[]),myName])]}:m));
  const changePw=(mid,pw)=>doUpdate("team",p=>p.map(t=>t.id===mid?{...t,password:pw}:t));

  const addTask=(t)=>{
    doUpdate("tasks",p=>[...p,{id:uid(),createdAt:today(),status:"todo",...t}]);
    if(t.assignee&&t.assignee!=="Manager"){
      setTimeout(()=>addMsg(t.assignee,`📋 New task: "${t.title}"\nPriority: ${PCOL[t.priority]?.l||"Medium"}\nDue: ${t.dueDate||"No deadline"}`,"task"),100);
    }
  };

  const updateTask=(id,up)=>{
    doUpdate("tasks",p=>p.map(t=>t.id===id?{...t,...up}:t));
    if(up.status&&!isManager){
      const tk=tasks.find(t=>t.id===id);
      if(tk) setTimeout(()=>addMsg("Manager",`✅ "${tk.title}" → ${STAT[up.status]}`,"status"),100);
    }
  };

  const deleteTask=(id)=>doUpdate("tasks",p=>p.filter(t=>t.id!==id));
  const addGoal=(g)=>doUpdate("goals",p=>[...p,{id:uid(),createdAt:today(),progress:0,...g}]);
  const updateGoal=(id,up)=>doUpdate("goals",p=>p.map(g=>g.id===id?{...g,...up}:g));
  const deleteGoal=(id)=>doUpdate("goals",p=>p.filter(g=>g.id!==id));
  const addScheduleItem=(i)=>doUpdate("schedule",p=>[...p,{id:uid(),...i}]);
  const deleteScheduleItem=(id)=>doUpdate("schedule",p=>p.filter(s=>s.id!==id));

  const addFollowup=(f)=>{
    doUpdate("followups",p=>[...p,{id:uid(),completed:false,createdAt:today(),...f}]);
    if(f.person&&f.person!=="Manager") setTimeout(()=>addMsg(f.person,`🔔 Follow-up: "${f.title}"\nDue: ${f.dueDate}${f.notes?"\n"+f.notes:""}`,"followup"),100);
  };

  const toggleFollowup=(id)=>doUpdate("followups",p=>p.map(f=>f.id===id?{...f,completed:!f.completed}:f));
  const deleteFollowup=(id)=>doUpdate("followups",p=>p.filter(f=>f.id!==id));
  const addTeamMember=(m)=>doUpdate("team",p=>[...p,{id:uid(),...m}]);

  // Projects
  const addProject=(p)=>doUpdate("projects",prev=>[...prev,{id:uid(),createdAt:today(),status:"active",...p}]);
  const deleteProject=(id)=>doUpdate("projects",p=>p.filter(x=>x.id!==id));

  const sendMsg=(to,body)=>{if(body.trim()) addMsg(to,body);};
  const getConvo=(person)=>messages.filter(m=>(m.from===myName&&m.to===person)||(m.from===person&&m.to===myName)).sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
  const getUnreadFrom=(person)=>messages.filter(m=>m.from===person&&m.to===myName&&!m.readBy?.includes(myName)).length;

  const sendAI=async()=>{
    if(!aiIn.trim()||aiLoad)return;
    const msg=aiIn.trim();setAiIn("");setAiMsgs(p=>[...p,{role:"user",text:msg}]);setAiLoad(true);
    const ctx=`User:${myName}(${user.role})\nTasks:${myTasks.filter(t=>t.status!=="done").map(t=>`"${t.title}"[${STAT[t.status]}]`).join(";")}`;
    const r=await callAI(msg,`You are Nexus Agent. Data:\n${ctx}\nBe concise.`);
    setAiMsgs(p=>[...p,{role:"ai",text:r}]);setAiLoad(false);
  };

  const activeTasks=myTasks.filter(t=>t.status!=="done").length;
  const completedTasks=myTasks.filter(t=>t.status==="done").length;
  const pendingFU=(isManager?followups:followups.filter(f=>f.person===myName)).filter(f=>!f.completed).length;
  const goalProg=goals.length?Math.round(goals.reduce((s,g)=>s+(g.progress||0),0)/goals.length):0;
  const todaySch=schedule.filter(s=>s.date===today());
  const chatContacts=isManager?team.filter(t=>!t.isManager):[{id:"mgr",name:"Manager",role:"Manager",isManager:true}];

  // Login
  const handleLogin=()=>{
    if(!loginId||!loginPw){setLoginErr("Select name & enter password");return;}
    const m=team.find(t=>t.id===loginId);
    if(!m){setLoginErr("User not found");return;}
    if(m.password!==loginPw){setLoginErr("Wrong password");return;}
    setLoginErr("");setUser(m);
  };

  const handleLogout=()=>{setUser(null);setView("dashboard");setActiveChat(null);setAiMsgs([]);setLoginPw("");setLoginId("");};

  // ── Loading ──
  if(loading) return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0D0F14",color:"#00C9A7",fontFamily:"'DM Sans',sans-serif"}}><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><div style={{width:36,height:36,border:"3px solid #00C9A720",borderTopColor:"#00C9A7",borderRadius:"50%",animation:"spin .8s linear infinite"}}/></div>;

  // ── Login Screen ──
  if(!user) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0D0F14",fontFamily:"'DM Sans',sans-serif",padding:20}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}input:focus,select:focus{border-color:#00C9A7!important;box-shadow:0 0 0 3px #00C9A715}*{box-sizing:border-box}`}</style>
      <div style={{width:"100%",maxWidth:400,animation:"fadeIn .5s ease"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:64,height:64,borderRadius:18,background:"linear-gradient(135deg,#00C9A7,#00B4D8)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",boxShadow:"0 12px 40px #00C9A730",animation:"float 3s ease-in-out infinite"}}><Ic name="shield" size={30}/></div>
          <h1 style={{fontSize:28,fontWeight:800,color:"#F5F5F7",margin:"0 0 4px"}}>Nexus Agent</h1>
          <p style={{color:"#5A5E6A",fontSize:13,margin:0,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Ic name="encrypted" size={14}/> Fully encrypted workspace</p>
        </div>
        <div style={{background:"#12141A",borderRadius:14,padding:24,border:"1px solid #1E2028"}}>
          <FF label="Who are you?"><select value={loginId} onChange={e=>{setLoginId(e.target.value);setLoginErr("");}} style={SS}><option value="">Select your name...</option>{team.map(m=><option key={m.id} value={m.id}>{m.name} — {m.role}{m.isManager?" (Admin)":""}</option>)}</select></FF>
          <FF label="Password"><PwInput value={loginPw} onChange={e=>{setLoginPw(e.target.value);setLoginErr("");}}/></FF>
          {loginErr&&<div style={{background:"#FF3B3015",border:"1px solid #FF3B3030",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#FF6B6B"}}>{loginErr}</div>}
          <button type="button" onClick={handleLogin} style={{...BP,width:"100%",padding:12,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:(loginId&&loginPw)?1:0.5}}><Ic name="lock" size={16}/> Sign In</button>
          <button type="button" onClick={()=>setModal("recover")} style={{width:"100%",marginTop:10,padding:8,background:"none",border:"1px solid #1E2028",borderRadius:8,color:"#5A5E6A",fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Ic name="key" size={14}/> Forgot Password?</button>
        </div>
        <p style={{color:"#3A3D45",fontSize:11,textAlign:"center",marginTop:14}}>Default manager password: admin123 · Recovery PIN: 9999</p>
      </div>
      {/* Password Recovery Modal */}
      {modal==="recover"&&(()=>{
        const R=()=>{
          const [pin,setPin]=useState("");const [newPw,setNewPw]=useState("");const [err,setErr]=useState("");const [done,setDone]=useState(false);
          const submit=()=>{
            const mgr=team.find(t=>t.isManager);
            if(!mgr){setErr("No manager found");return;}
            if(pin!==(mgr.recoveryPin||"9999")){setErr("Wrong recovery PIN");return;}
            if(newPw.length<4){setErr("Min 4 characters");return;}
            const newTeam=team.map(t=>t.isManager?{...t,password:newPw}:t);
            const newD={...D,team:newTeam};
            setD(newD);saveData(newD);setDone(true);
          };
          if(done) return <Modal title="Password Reset!" onClose={()=>setModal(null)} width={380}><div style={{textAlign:"center",padding:10}}><div style={{width:48,height:48,borderRadius:"50%",background:"#00C9A720",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",color:"#00C9A7"}}><Ic name="check" size={24}/></div><p style={{color:"#E0E0E5",fontWeight:600}}>Manager password has been reset!</p><p style={{color:"#5A5E6A",fontSize:12}}>You can now log in with your new password.</p><button type="button" onClick={()=>setModal(null)} style={{...BP,marginTop:10}}>Done</button></div></Modal>;
          return <Modal title="Recover Manager Password" onClose={()=>setModal(null)} width={420}>
            <p style={{color:"#5A5E6A",fontSize:12,margin:"0 0 16px"}}>Enter your 4-digit recovery PIN to reset the manager password.</p>
            <FF label="Recovery PIN"><input value={pin} onChange={e=>{setPin(e.target.value);setErr("");}} style={IS} placeholder="Enter 4-digit PIN" maxLength={4}/></FF>
            <FF label="New Password"><PwInput value={newPw} onChange={e=>{setNewPw(e.target.value);setErr("");}}/></FF>
            {err&&<div style={{background:"#FF3B3015",border:"1px solid #FF3B3030",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#FF6B6B"}}>{err}</div>}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={submit} style={BP}>Reset Password</button></div>
          </Modal>;
        };
        return <R/>;
      })()}
    </div>
  );

  // ── Nav ──
  const navItems=[
    {id:"dashboard",icon:"dashboard",label:"Dashboard"},
    ...(isManager?[{id:"team",icon:"team",label:"Team"}]:[]),
    {id:"tasks",icon:"tasks",label:isManager?"All Tasks":"My Tasks"},
    {id:"projects",icon:"project",label:"Projects"},
    {id:"comms",icon:"comms",label:"Messages"},
    ...(isManager?[{id:"followups",icon:"followup",label:"Follow-ups"}]:[]),
    {id:"goals",icon:"goals",label:"Goals"},
    {id:"schedule",icon:"schedule",label:"Schedule"},
    {id:"ai",icon:"ai",label:"AI Agent"},
  ];

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"'DM Sans',sans-serif",background:"#0D0F14",color:"#E8E8ED",overflow:"hidden"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}*{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:#2A2D35 transparent}*::-webkit-scrollbar{width:5px}*::-webkit-scrollbar-thumb{background:#2A2D35;border-radius:3px}input:focus,select:focus,textarea:focus{border-color:#00C9A7!important;box-shadow:0 0 0 3px #00C9A715}textarea{resize:vertical}button:hover{filter:brightness(1.08)}`}</style>

      {/* SIDEBAR */}
      <div style={{width:sideOpen?220:60,background:"#12141A",borderRight:"1px solid #1E2028",display:"flex",flexDirection:"column",transition:"width .2s",flexShrink:0,overflow:"hidden"}}>
        <div style={{padding:sideOpen?"14px 16px":"14px 10px",borderBottom:"1px solid #1E2028",display:"flex",alignItems:"center",gap:10,cursor:"pointer",minHeight:58}} onClick={()=>setSideOpen(p=>!p)}>
          <Av name={myName} size={32} mgr={isManager}/>{sideOpen&&<div style={{overflow:"hidden"}}><div style={{fontSize:13,fontWeight:700,color:"#F0F0F0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{myName}</div><div style={{fontSize:10,color:isManager?"#00C9A7":"#5A5E6A"}}>{user.role}</div></div>}
        </div>
        <nav style={{flex:1,padding:"10px 6px",display:"flex",flexDirection:"column",gap:2}}>
          {navItems.map(i=><button type="button" key={i.id} onClick={()=>setView(i.id)} style={{display:"flex",alignItems:"center",gap:11,padding:sideOpen?"9px 13px":"9px",background:view===i.id?"#00C9A710":"transparent",border:"none",borderRadius:9,color:view===i.id?"#00C9A7":"#5A5E6A",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit",textAlign:"left",justifyContent:sideOpen?"flex-start":"center",whiteSpace:"nowrap"}}><Ic name={i.icon} size={17}/>{sideOpen&&i.label}{sideOpen&&i.id==="comms"&&myUnread>0&&<span style={{marginLeft:"auto",background:"#E01E5A",color:"#fff",fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:8}}>{myUnread}</span>}</button>)}
        </nav>
        <div style={{padding:"6px 6px 10px",display:"flex",flexDirection:"column",gap:4}}>
          {saving&&sideOpen&&<div style={{padding:"4px 13px",fontSize:10,color:"#00C9A7",display:"flex",alignItems:"center",gap:4}}><Ic name="encrypted" size={10}/> Saving encrypted...</div>}
          <button type="button" onClick={()=>setModal("changePw")} style={{display:"flex",alignItems:"center",gap:11,padding:sideOpen?"8px 13px":"8px",background:"none",border:"1px solid #1E2028",borderRadius:9,color:"#5A5E6A",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit",justifyContent:sideOpen?"flex-start":"center"}}><Ic name="lock" size={15}/>{sideOpen&&"Change Password"}</button>
          <button type="button" onClick={handleLogout} style={{display:"flex",alignItems:"center",gap:11,padding:sideOpen?"8px 13px":"8px",background:"none",border:"1px solid #1E2028",borderRadius:9,color:"#5A5E6A",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit",justifyContent:sideOpen?"flex-start":"center"}}><Ic name="logout" size={15}/>{sideOpen&&"Logout"}</button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{flex:1,overflow:"auto",padding:"24px 28px"}}>

        {/* DASHBOARD */}
        {view==="dashboard"&&<div style={{animation:"fadeIn .3s"}}>
          <h1 style={{fontSize:26,fontWeight:800,margin:0,color:"#F5F5F7"}}>{isManager?"Manager Dashboard":`Welcome, ${myName.split(" ")[0]}`}</h1>
          <p style={{color:"#5A5E6A",marginTop:3,fontSize:13}}><Ic name="encrypted" size={12}/> Encrypted · {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginTop:20}}>
            {[{l:"Tasks",v:activeTasks,c:"#00C9A7",go:"tasks"},{l:"Done",v:completedTasks,c:"#45B7D1",go:"tasks"},{l:"Unread",v:myUnread,c:"#E01E5A",go:"comms"},{l:"Projects",v:projects.length,c:"#FF9500",go:"projects"},{l:"Goals",v:`${goalProg}%`,c:"#BB8FCE",go:"goals"},{l:"Events",v:todaySch.length,c:"#FFD60A",go:"schedule"}].map((s,i)=><div key={i} onClick={()=>setView(s.go)} style={{background:"#12141A",borderRadius:12,padding:"14px 16px",border:"1px solid #1E2028",cursor:"pointer"}}><div style={{fontSize:10,color:"#5A5E6A",fontWeight:700,textTransform:"uppercase"}}>{s.l}</div><div style={{fontSize:24,fontWeight:800,color:s.c,marginTop:4}}>{s.v}</div></div>)}
          </div>
          <div style={{background:"#12141A",borderRadius:12,padding:16,border:"1px solid #1E2028",marginTop:14}}>
            <h3 style={{fontSize:13,fontWeight:700,margin:"0 0 10px",color:"#C0C0C5"}}>Active Tasks</h3>
            {myTasks.filter(t=>t.status!=="done").slice(0,5).map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #1A1D23"}}><div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:"#E0E0E5"}}>{t.title}</div><div style={{fontSize:10,color:"#5A5E6A"}}>{t.assignee?`→${t.assignee} · `:""}{STAT[t.status]}</div></div><PB p={t.priority}/></div>)}
            {!myTasks.filter(t=>t.status!=="done").length&&<p style={{color:"#4A4D55",fontSize:11,margin:0}}>No active tasks</p>}
          </div>
        </div>}

        {/* MESSAGES */}
        {view==="comms"&&<div style={{animation:"fadeIn .3s",display:"flex",gap:14,height:"calc(100vh - 48px)"}}>
          <div style={{width:220,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}><h2 style={{fontSize:17,fontWeight:800,margin:0}}>Messages</h2><Ic name="encrypted" size={14}/></div>
            {chatContacts.map(c=>{const ur=getUnreadFrom(c.name);const last=getConvo(c.name).slice(-1)[0];return <button type="button" key={c.id} onClick={()=>{setActiveChat(c.name);const ids=messages.filter(m=>m.from===c.name&&m.to===myName&&!m.readBy?.includes(myName)).map(m=>m.id);if(ids.length)markRead(ids);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:activeChat===c.name?"#00C9A708":"#12141A",border:`1px solid ${activeChat===c.name?"#00C9A730":"#1E2028"}`,borderRadius:10,cursor:"pointer",textAlign:"left",fontFamily:"inherit",marginBottom:6,width:"100%"}}><Av name={c.name} size={32} mgr={c.isManager}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:"#E0E0E5"}}>{c.name}</div><div style={{fontSize:10,color:"#5A5E6A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{last?.body?.slice(0,25)||c.role}</div></div>{ur>0&&<span style={{background:"#E01E5A",color:"#fff",fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:8}}>{ur}</span>}</button>;})}
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",background:"#12141A",borderRadius:12,border:"1px solid #1E2028"}}>
            {activeChat?<><div style={{padding:"12px 16px",borderBottom:"1px solid #1E2028",display:"flex",alignItems:"center",gap:10}}><Av name={activeChat} size={28} mgr={activeChat==="Manager"}/><div style={{fontSize:13,fontWeight:700}}>{activeChat}</div><div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4,color:"#00C9A7",fontSize:10}}><Ic name="encrypted" size={12}/>Encrypted</div></div>
              <div style={{flex:1,overflow:"auto",padding:16}}>{getConvo(activeChat).map(m=><div key={m.id} style={{display:"flex",justifyContent:m.from===myName?"flex-end":"flex-start",marginBottom:8}}><div style={{maxWidth:"75%",padding:"9px 13px",borderRadius:12,background:m.from===myName?"linear-gradient(135deg,#00C9A7,#00B4D8)":"#1E2028",color:m.from===myName?"#fff":"#E0E0E5"}}><div style={{fontSize:12,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.body}</div><div style={{fontSize:8,color:m.from===myName?"#ffffff70":"#4A4D55",marginTop:3,textAlign:"right"}}>{timeAgo(m.timestamp)}</div></div></div>)}<div ref={msgRef}/>{!getConvo(activeChat).length&&<p style={{color:"#4A4D55",textAlign:"center",padding:30,fontSize:12}}>No messages yet. Send one!</p>}</div>
              <div style={{padding:"10px 16px",borderTop:"1px solid #1E2028",display:"flex",gap:8}}><input value={msgInput} onChange={e=>setMsgInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&msgInput.trim()){sendMsg(activeChat,msgInput);setMsgInput("");}}} placeholder={`Message ${activeChat}...`} style={{...IS,flex:1}}/><button type="button" onClick={()=>{if(msgInput.trim()){sendMsg(activeChat,msgInput);setMsgInput("");}}} style={BP}><Ic name="send" size={16}/></button></div>
            </>:<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8,color:"#4A4D55"}}><Ic name="encrypted" size={28}/><span style={{fontSize:12}}>Select a conversation</span></div>}
          </div>
        </div>}

        {/* TEAM */}
        {view==="team"&&isManager&&<div style={{animation:"fadeIn .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h1 style={{fontSize:24,fontWeight:800,margin:0}}>Team</h1><button type="button" onClick={()=>setModal("addTeam")} style={BP}><Ic name="plus" size={14}/> Add</button></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
            {team.filter(t=>!t.isManager).map(m=>{const mt=tasks.filter(t=>t.assignee===m.name);return <div key={m.id} style={{background:"#12141A",borderRadius:12,padding:16,border:"1px solid #1E2028"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><Av name={m.name} size={36}/><div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{m.name}</div><div style={{fontSize:10,color:"#5A5E6A"}}>{m.role}</div></div></div>
              <div style={{display:"flex",gap:8,fontSize:10,color:"#5A5E6A",marginBottom:10}}><span><strong style={{color:"#00C9A7"}}>{mt.filter(t=>t.status!=="done").length}</strong> active</span><span><strong style={{color:"#45B7D1"}}>{mt.filter(t=>t.status==="done").length}</strong> done</span></div>
              <div style={{display:"flex",gap:5}}>
                <button type="button" onClick={()=>setModal({type:"addTask",assignee:m.name})} style={{flex:1,padding:6,background:"#00C9A710",border:"1px solid #00C9A725",borderRadius:7,color:"#00C9A7",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Assign</button>
                <button type="button" onClick={()=>{setView("comms");setActiveChat(m.name);}} style={{flex:1,padding:6,background:"#45B7D110",border:"1px solid #45B7D125",borderRadius:7,color:"#45B7D1",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Message</button>
                <button type="button" onClick={()=>setModal({type:"resetPw",member:m})} style={{padding:"6px 8px",background:"#FF950010",border:"1px solid #FF950025",borderRadius:7,color:"#FF9500",cursor:"pointer"}}><Ic name="lock" size={11}/></button>
              </div>
            </div>;})}
          </div>
        </div>}

        {/* TASKS */}
        {view==="tasks"&&<div style={{animation:"fadeIn .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h1 style={{fontSize:24,fontWeight:800,margin:0}}>{isManager?"All Tasks":"My Tasks"}</h1>{isManager&&<button type="button" onClick={()=>setModal("addTask")} style={BP}><Ic name="plus" size={14}/> New Task</button>}</div>
          {["todo","in_progress","review","blocked","done"].map(st=>{const gr=myTasks.filter(t=>t.status===st);if(!gr.length)return null;return <div key={st} style={{marginBottom:18}}><div style={{fontSize:10,fontWeight:700,color:"#5A5E6A",textTransform:"uppercase",marginBottom:6}}>{STAT[st]} <span style={{background:"#1A1D23",padding:"1px 5px",borderRadius:5,fontSize:9}}>{gr.length}</span></div>{gr.map(t=><div key={t.id} style={{background:"#12141A",borderRadius:10,padding:"10px 14px",border:"1px solid #1E2028",marginBottom:5,display:"flex",alignItems:"center",gap:10}}><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}><span style={{fontWeight:600,fontSize:12,color:t.status==="done"?"#5A5E6A":"#E8E8ED",textDecoration:t.status==="done"?"line-through":"none"}}>{t.title}</span><PB p={t.priority}/>{t.dueDate&&t.dueDate<today()&&t.status!=="done"&&<Bg color="#FF3B30">Overdue</Bg>}{t.project&&<Bg color="#FF9500">{t.project}</Bg>}</div><div style={{fontSize:10,color:"#5A5E6A",marginTop:2}}>{isManager&&t.assignee&&<>→ <strong style={{color:"#8E8E93"}}>{t.assignee}</strong> · </>}{t.dueDate&&`Due ${t.dueDate}`}</div></div><select value={t.status} onChange={e=>updateTask(t.id,{status:e.target.value})} style={{...SS,padding:"4px 6px",fontSize:9,width:"auto",minWidth:85}}>{Object.entries(STAT).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>{isManager&&<button type="button" onClick={()=>deleteTask(t.id)} style={{background:"none",border:"none",color:"#4A4D55",cursor:"pointer"}}><Ic name="trash" size={13}/></button>}</div>)}</div>;})}
          {!myTasks.length&&<p style={{color:"#4A4D55",textAlign:"center",padding:30,fontSize:12}}>No tasks.</p>}
        </div>}

        {/* PROJECTS */}
        {view==="projects"&&<div style={{animation:"fadeIn .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h1 style={{fontSize:24,fontWeight:800,margin:0}}>Projects</h1>{isManager&&<button type="button" onClick={()=>setModal("addProject")} style={BP}><Ic name="plus" size={14}/> New Project</button>}</div>
          {projects.map(pr=>{
            const prTasks=tasks.filter(t=>t.project===pr.name);
            const done=prTasks.filter(t=>t.status==="done").length;
            const prog=prTasks.length?Math.round(done/prTasks.length*100):0;
            return <div key={pr.id} style={{background:"#12141A",borderRadius:12,padding:18,border:"1px solid #1E2028",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div><div style={{fontWeight:700,fontSize:15}}>{pr.name}</div>{pr.description&&<div style={{fontSize:11,color:"#5A5E6A",marginTop:3}}>{pr.description}</div>}</div>
                <div style={{display:"flex",gap:6}}>
                  {isManager&&<button type="button" onClick={()=>setModal({type:"addTask",project:pr.name})} style={{padding:"6px 12px",background:"#00C9A710",border:"1px solid #00C9A725",borderRadius:7,color:"#00C9A7",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>+ Task</button>}
                  {isManager&&<button type="button" onClick={()=>deleteProject(pr.id)} style={{background:"none",border:"none",color:"#4A4D55",cursor:"pointer"}}><Ic name="trash" size={14}/></button>}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><div style={{flex:1}}><Br value={prog} color="#FF9500"/></div><span style={{fontSize:12,fontWeight:700,color:"#FF9500"}}>{prog}%</span></div>
              <div style={{fontSize:11,color:"#5A5E6A",marginBottom:8}}>{prTasks.length} tasks · {done} done · {prTasks.length-done} remaining</div>
              {prTasks.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderTop:"1px solid #1A1D23"}}>
                <div style={{flex:1}}><span style={{fontSize:11,fontWeight:600,color:t.status==="done"?"#5A5E6A":"#E0E0E5",textDecoration:t.status==="done"?"line-through":"none"}}>{t.title}</span>{t.assignee&&<span style={{fontSize:10,color:"#5A5E6A"}}> → {t.assignee}</span>}</div>
                <Bg color={STAT[t.status]==="Done"?"#34C759":"#6B6F7B"}>{STAT[t.status]}</Bg>
              </div>)}
            </div>;
          })}
          {!projects.length&&<p style={{color:"#4A4D55",textAlign:"center",padding:30,fontSize:12}}>{isManager?"No projects yet. Create one!":"No projects."}</p>}
        </div>}

        {/* FOLLOW-UPS */}
        {view==="followups"&&isManager&&<div style={{animation:"fadeIn .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h1 style={{fontSize:24,fontWeight:800,margin:0}}>Follow-ups</h1><button type="button" onClick={()=>setModal("addFollowup")} style={BP}><Ic name="plus" size={14}/> Add</button></div>
          {followups.filter(f=>!f.completed).map(f=><div key={f.id} style={{background:"#12141A",borderRadius:10,padding:"10px 14px",border:"1px solid #1E2028",marginBottom:5,display:"flex",alignItems:"center",gap:10}}>
            <button type="button" onClick={()=>toggleFollowup(f.id)} style={{width:18,height:18,borderRadius:5,border:"2px solid #3A3D45",background:"none",cursor:"pointer",flexShrink:0}}/>
            <div style={{flex:1}}><div style={{fontWeight:600,fontSize:12}}>{f.title}</div><div style={{fontSize:10,color:"#5A5E6A"}}>{f.person} · Due {f.dueDate}</div></div>
            <button type="button" onClick={()=>deleteFollowup(f.id)} style={{background:"none",border:"none",color:"#4A4D55",cursor:"pointer"}}><Ic name="trash" size={13}/></button></div>)}
          {!followups.filter(f=>!f.completed).length&&<p style={{color:"#4A4D55",textAlign:"center",padding:30,fontSize:12}}>No pending follow-ups.</p>}
        </div>}

        {/* GOALS */}
        {view==="goals"&&<div style={{animation:"fadeIn .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h1 style={{fontSize:24,fontWeight:800,margin:0}}>Goals</h1>{isManager&&<button type="button" onClick={()=>setModal("addGoal")} style={BP}><Ic name="plus" size={14}/> New</button>}</div>
          {["short_term","long_term"].map(type=>{const gr=goals.filter(g=>g.type===type);if(!gr.length)return null;return <div key={type} style={{marginBottom:20}}><div style={{fontSize:10,fontWeight:700,color:"#5A5E6A",textTransform:"uppercase",marginBottom:8}}>{type==="short_term"?"Short-term":"Long-term"}</div>{gr.map(g=><div key={g.id} style={{background:"#12141A",borderRadius:12,padding:"14px 16px",border:"1px solid #1E2028",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div style={{fontWeight:700,fontSize:13}}>{g.title}</div>{isManager&&<button type="button" onClick={()=>deleteGoal(g.id)} style={{background:"none",border:"none",color:"#4A4D55",cursor:"pointer"}}><Ic name="trash" size={13}/></button>}</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{flex:1}}><Br value={g.progress} color={type==="short_term"?"#00C9A7":"#BB8FCE"}/></div><span style={{fontSize:12,fontWeight:700,color:type==="short_term"?"#00C9A7":"#BB8FCE"}}>{g.progress}%</span></div>
            {isManager&&<input type="range" min="0" max="100" value={g.progress} onChange={e=>updateGoal(g.id,{progress:parseInt(e.target.value)})} style={{width:"100%",marginTop:6,accentColor:type==="short_term"?"#00C9A7":"#BB8FCE"}}/>}
            {g.milestones?.length>0&&<div style={{marginTop:8}}>{g.milestones.map((m,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#5A5E6A",padding:"2px 0",cursor:isManager?"pointer":"default"}} onClick={()=>{if(!isManager)return;const up=[...g.milestones];up[i]={...m,done:!m.done};updateGoal(g.id,{milestones:up,progress:Math.round(up.filter(x=>x.done).length/up.length*100)});}}><span style={{color:m.done?"#00C9A7":"#3A3D45"}}>{m.done?"✓":"○"}</span><span style={{textDecoration:m.done?"line-through":"none"}}>{m.text}</span></div>)}</div>}
          </div>)}</div>;})}
          {!goals.length&&<p style={{color:"#4A4D55",textAlign:"center",padding:30,fontSize:12}}>No goals.</p>}
        </div>}

        {/* SCHEDULE */}
        {view==="schedule"&&<div style={{animation:"fadeIn .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h1 style={{fontSize:24,fontWeight:800,margin:0}}>Schedule</h1>{isManager&&<button type="button" onClick={()=>setModal("addSchedule")} style={BP}><Ic name="plus" size={14}/> Add</button>}</div>
          {todaySch.sort((a,b)=>a.time.localeCompare(b.time)).map(s=><div key={s.id} style={{background:"#12141A",borderRadius:10,padding:"10px 14px",border:"1px solid #1E2028",marginBottom:5,display:"flex",alignItems:"center",gap:10}}><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,color:"#00C9A7",minWidth:45}}>{s.time}</div><div style={{flex:1,fontWeight:600,fontSize:12}}>{s.title}</div>{isManager&&<button type="button" onClick={()=>deleteScheduleItem(s.id)} style={{background:"none",border:"none",color:"#4A4D55",cursor:"pointer"}}><Ic name="trash" size={13}/></button>}</div>)}
          {!todaySch.length&&<p style={{color:"#4A4D55",fontSize:11}}>No events today</p>}
        </div>}

        {/* AI */}
        {view==="ai"&&<div style={{animation:"fadeIn .3s",display:"flex",flexDirection:"column",height:"calc(100vh - 48px)"}}>
          <h1 style={{fontSize:24,fontWeight:800,margin:"0 0 12px"}}>AI Agent</h1>
          {!aiMsgs.length&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>{(isManager?["Focus priorities?","Team workload","Deadlines?","Plan week"]:["My priorities?","Help with task","Overdue?","Update manager"]).map(q=><button type="button" key={q} onClick={()=>setAiIn(q)} style={{padding:"8px 10px",background:"#12141A",border:"1px solid #1E2028",borderRadius:9,color:"#6B6F7B",fontSize:11,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>{q}</button>)}</div>}
          <div style={{flex:1,overflowY:"auto",marginBottom:10}}>{aiMsgs.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:8}}><div style={{maxWidth:"75%",padding:"10px 14px",borderRadius:12,background:m.role==="user"?"linear-gradient(135deg,#00C9A7,#00B4D8)":"#12141A",color:m.role==="user"?"#fff":"#E0E0E5",border:m.role==="ai"?"1px solid #1E2028":"none",fontSize:12,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.text}</div></div>)}{aiLoad&&<div style={{display:"flex"}}><div style={{padding:"10px 14px",borderRadius:12,background:"#12141A",border:"1px solid #1E2028",display:"flex",gap:5}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#00C9A7",animation:`pulse 1.2s ease-in-out ${i*.2}s infinite`}}/>)}</div></div>}<div ref={chatRef}/></div>
          <div style={{display:"flex",gap:8,paddingBottom:6}}><input value={aiIn} onChange={e=>setAiIn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendAI()} placeholder="Ask AI..." style={{...IS,flex:1}}/><button type="button" onClick={sendAI} disabled={aiLoad} style={{...BP,opacity:aiLoad?.5:1}}><Ic name="send" size={14}/></button></div>
        </div>}
      </div>

      {/* ═══ MODALS ═══ */}
      {modal==="changePw"&&(()=>{const C=()=>{const [c,setC]=useState("");const [n,setN]=useState("");const [cf,setCf]=useState("");const [e,setE]=useState("");const [d,setDn]=useState(false);
        const sub=()=>{if(c!==user.password){setE("Wrong current password");return;}if(n.length<4){setE("Min 4 chars");return;}if(n!==cf){setE("Don't match");return;}changePw(user.id,n);setUser(p=>({...p,password:n}));setDn(true);};
        if(d) return <Modal title="Done" onClose={()=>setModal(null)} width={360}><div style={{textAlign:"center"}}><p style={{color:"#00C9A7",fontWeight:700}}>✓ Password updated!</p><button type="button" onClick={()=>setModal(null)} style={{...BP,marginTop:10}}>Close</button></div></Modal>;
        return <Modal title="Change Password" onClose={()=>setModal(null)} width={400}><FF label="Current"><PwInput value={c} onChange={x=>{setC(x.target.value);setE("");}}/></FF><FF label="New"><PwInput value={n} onChange={x=>{setN(x.target.value);setE("");}}/></FF><FF label="Confirm"><PwInput value={cf} onChange={x=>{setCf(x.target.value);setE("");}}/></FF>{e&&<div style={{background:"#FF3B3015",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#FF6B6B"}}>{e}</div>}<div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={sub} style={BP}>Update</button></div></Modal>;
      };return <C/>;})()}

      {modal?.type==="resetPw"&&(()=>{const R=()=>{const [p,setP]=useState("");const [d,setDn]=useState(false);
        if(d) return <Modal title="Done" onClose={()=>setModal(null)} width={360}><div style={{textAlign:"center"}}><p style={{color:"#00C9A7",fontWeight:700}}>✓ Password reset for {modal.member.name}!</p><button type="button" onClick={()=>setModal(null)} style={{...BP,marginTop:10}}>Done</button></div></Modal>;
        return <Modal title={`Reset — ${modal.member.name}`} onClose={()=>setModal(null)} width={400}><FF label="New Password"><PwInput value={p} onChange={e=>setP(e.target.value)}/></FF><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(p.length>=4){changePw(modal.member.id,p);setDn(true);}}} style={{...BP,opacity:p.length>=4?1:0.4}}>Reset</button></div></Modal>;
      };return <R/>;})()}

      {modal==="addTeam"&&(()=>{const C=()=>{const [n,setN]=useState("");const [r,setR]=useState("");const [p,setP]=useState("");const ok=n.trim()&&r.trim()&&p.length>=4;
        return <Modal title="Add Team Member" onClose={()=>setModal(null)}><FF label="Name"><input value={n} onChange={e=>setN(e.target.value)} style={IS} placeholder="e.g. Rahul Kumar" autoFocus/></FF><FF label="Role"><input value={r} onChange={e=>setR(e.target.value)} style={IS} placeholder="e.g. Full Stack Dev"/></FF><FF label="Password"><PwInput value={p} onChange={e=>setP(e.target.value)} placeholder="Min 4 chars"/></FF><div style={{background:"#FF950010",border:"1px solid #FF950025",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#FF9500"}}>🔑 Share this password with {n||"them"}</div><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(ok){addTeamMember({name:n.trim(),role:r.trim(),password:p});setModal(null);}}} style={{...BP,opacity:ok?1:0.4,pointerEvents:ok?"auto":"none"}}>Add</button></div></Modal>;
      };return <C/>;})()}

      {(modal==="addTask"||modal?.type==="addTask")&&(()=>{const C=()=>{const [t,setT]=useState("");const [d,setDe]=useState("");const [a,setA]=useState(modal?.assignee||"");const [p,setP]=useState("medium");const [du,setDu]=useState("");const [pr,setPr]=useState(modal?.project||"");
        return <Modal title="Assign Task" onClose={()=>setModal(null)}><FF label="Title"><input value={t} onChange={e=>setT(e.target.value)} style={IS} placeholder="e.g. Redesign homepage" autoFocus/></FF><FF label="Description"><textarea value={d} onChange={e=>setDe(e.target.value)} rows={2} style={IS}/></FF><FF label="Assign To"><select value={a} onChange={e=>setA(e.target.value)} style={SS}><option value="">Unassigned</option>{team.filter(x=>!x.isManager).map(m=><option key={m.id} value={m.name}>{m.name}</option>)}</select></FF><FF label="Project"><select value={pr} onChange={e=>setPr(e.target.value)} style={SS}><option value="">No project</option>{projects.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></FF><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><FF label="Priority"><select value={p} onChange={e=>setP(e.target.value)} style={SS}><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></FF><FF label="Due"><input value={du} onChange={e=>setDu(e.target.value)} type="date" style={IS}/></FF></div><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(t.trim()){addTask({title:t.trim(),description:d,assignee:a,priority:p,dueDate:du,project:pr});setModal(null);}}} style={{...BP,opacity:t.trim()?1:0.4,pointerEvents:t.trim()?"auto":"none"}}>Create</button></div></Modal>;
      };return <C/>;})()}

      {modal==="addProject"&&(()=>{const C=()=>{const [n,setN]=useState("");const [d,setDe]=useState("");
        return <Modal title="New Project" onClose={()=>setModal(null)}><FF label="Project Name"><input value={n} onChange={e=>setN(e.target.value)} style={IS} placeholder="e.g. Website Redesign" autoFocus/></FF><FF label="Description"><textarea value={d} onChange={e=>setDe(e.target.value)} rows={2} style={IS} placeholder="What's this project about?"/></FF><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(n.trim()){addProject({name:n.trim(),description:d});setModal(null);}}} style={{...BP,opacity:n.trim()?1:0.4,pointerEvents:n.trim()?"auto":"none"}}>Create</button></div></Modal>;
      };return <C/>;})()}

      {modal==="addFollowup"&&(()=>{const C=()=>{const m=team.filter(t=>!t.isManager);const [t,setT]=useState("");const [p,setP]=useState(m[0]?.name||"");const [d,setDe]=useState("");const [n,setN]=useState("");
        return <Modal title="Add Follow-up" onClose={()=>setModal(null)}><FF label="Subject"><input value={t} onChange={e=>setT(e.target.value)} style={IS} placeholder="e.g. Check progress" autoFocus/></FF><FF label="Person"><select value={p} onChange={e=>setP(e.target.value)} style={SS}>{m.map(x=><option key={x.id} value={x.name}>{x.name}</option>)}</select></FF><FF label="Due Date"><input value={d} onChange={e=>setDe(e.target.value)} type="date" style={IS}/></FF><FF label="Notes"><textarea value={n} onChange={e=>setN(e.target.value)} rows={2} style={IS}/></FF><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(t.trim()&&d){addFollowup({title:t.trim(),person:p,dueDate:d,notes:n});setModal(null);}}} style={{...BP,opacity:(t.trim()&&d)?1:0.4,pointerEvents:(t.trim()&&d)?"auto":"none"}}>Add</button></div></Modal>;
      };return <C/>;})()}

      {modal==="addGoal"&&(()=>{const C=()=>{const [t,setT]=useState("");const [d,setDe]=useState("");const [ty,setTy]=useState("short_term");const [dl,setDl]=useState("");const [ms,setMs]=useState("");
        return <Modal title="New Goal" onClose={()=>setModal(null)}><FF label="Title"><input value={t} onChange={e=>setT(e.target.value)} style={IS} autoFocus/></FF><FF label="Description"><textarea value={d} onChange={e=>setDe(e.target.value)} rows={2} style={IS}/></FF><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><FF label="Type"><select value={ty} onChange={e=>setTy(e.target.value)} style={SS}><option value="short_term">Short-term</option><option value="long_term">Long-term</option></select></FF><FF label="Deadline"><input value={dl} onChange={e=>setDl(e.target.value)} type="date" style={IS}/></FF></div><FF label="Milestones (one per line)"><textarea value={ms} onChange={e=>setMs(e.target.value)} rows={3} style={IS} placeholder={"Research\nWireframes\nMVP"}/></FF><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(t.trim()){addGoal({title:t.trim(),description:d,type:ty,deadline:dl,milestones:ms.split("\n").filter(Boolean).map(x=>({text:x.trim(),done:false}))});setModal(null);}}} style={{...BP,opacity:t.trim()?1:0.4,pointerEvents:t.trim()?"auto":"none"}}>Create</button></div></Modal>;
      };return <C/>;})()}

      {modal==="addSchedule"&&(()=>{const C=()=>{const [t,setT]=useState("");const [d,setDe]=useState(today());const [ti,setTi]=useState("");
        return <Modal title="Schedule Event" onClose={()=>setModal(null)}><FF label="Event"><input value={t} onChange={e=>setT(e.target.value)} style={IS} placeholder="e.g. Sprint planning" autoFocus/></FF><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><FF label="Date"><input value={d} onChange={e=>setDe(e.target.value)} type="date" style={IS}/></FF><FF label="Time"><input value={ti} onChange={e=>setTi(e.target.value)} type="time" style={IS}/></FF></div><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(t.trim()&&ti){addScheduleItem({title:t.trim(),date:d,time:ti});setModal(null);}}} style={{...BP,opacity:(t.trim()&&ti)?1:0.4,pointerEvents:(t.trim()&&ti)?"auto":"none"}}>Add</button></div></Modal>;
      };return <C/>;})()}
    </div>
  );
}
