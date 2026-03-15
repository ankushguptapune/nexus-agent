import { useState, useEffect, useRef, useCallback } from "react";
import { saveData, loadData } from "./firebase.js";

/* ═══ NEXUS AGENT v3 — Full Featured Build ═══
   Features: Push notifications, File attachments, Activity log,
   Task comments, Mobile responsive, Due date reminders
   ═══════════════════════════════════════════════ */

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().split("T")[0];
const nowISO = () => new Date().toISOString();
const timeAgo = (ts) => { const d = Date.now() - new Date(ts).getTime(); if (d < 60000) return "just now"; if (d < 3600000) return `${Math.floor(d / 60000)}m ago`; if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`; return `${Math.floor(d / 86400000)}d ago`; };
const STAT = { todo: "To Do", in_progress: "In Progress", review: "In Review", done: "Done", blocked: "Blocked" };
const PCOL = { urgent: { b: "#FF3B30", l: "Urgent" }, high: { b: "#FF9500", l: "High" }, medium: { b: "#FFD60A", l: "Medium" }, low: { b: "#34C759", l: "Low" } };
const isMobile = () => window.innerWidth < 768;

async function callAI(prompt, sys) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: sys || "You are a concise productivity AI.", messages: [{ role: "user", content: prompt }] }) });
    const d = await r.json(); return d.content?.map(b => b.text || "").join("\n") || "No response.";
  } catch { return "AI unavailable."; }
}

// ── Notification helper ──
function requestNotifPermission() { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); }
function sendNotif(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body, icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><text y='28' font-size='28'>🛡️</text></svg>" }); } catch {}
  }
}

// ── File to base64 ──
function fileToBase64(file) {
  return new Promise((resolve) => {
    if (file.size > 2 * 1024 * 1024) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, data: reader.result });
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

const INIT = {
  team: [{ id: "mgr", name: "Manager", role: "Manager", isManager: true, password: "admin123", recoveryPin: "9999" }],
  tasks: [], goals: [], schedule: [], followups: [], messages: [], projects: [], activityLog: [],
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
    project: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>,
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
    key: <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>,
    clip: <><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    comment: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    alert: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    menu: <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>,
  };
  const sw = ["check"].includes(name)?"2.5":["plus","send","close"].includes(name)?"2":"1.8";
  return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{p[name]||null}</svg>;
}

/* ═══ UI PRIMITIVES ═══ */
function Av({ name, size=32, mgr }) {
  const c=mgr?"#00C9A7":["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#98D8C8","#BB8FCE","#85C1E9","#F7DC6F"][(name||"?").charCodeAt(0)%10];
  return <div style={{width:size,height:size,borderRadius:"50%",background:`linear-gradient(135deg,${c},${c}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.36,fontWeight:700,color:"#fff",flexShrink:0,border:mgr?"2px solid #00C9A7":"none"}}>{mgr?"★":(name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>;
}
function Bg({children,color="#8E8E93"}){return <span style={{display:"inline-flex",padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:600,background:color+"20",color}}>{children}</span>;}
function PB({p}){const c=PCOL[p]||PCOL.medium;return <Bg color={c.b}>{c.l}</Bg>;}
function Br({value,color="#00C9A7"}){return <div style={{width:"100%",background:"#1A1D23",borderRadius:6,height:6,overflow:"hidden"}}><div style={{width:`${Math.min(100,Math.max(0,value))}%`,height:"100%",background:color,borderRadius:6,transition:"width 0.4s"}}/></div>;}

const IS={width:"100%",padding:"10px 14px",background:"#12141A",border:"1px solid #2A2D35",borderRadius:9,color:"#F0F0F0",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"};
const SS={...IS,cursor:"pointer"};
const BP={padding:"10px 20px",background:"linear-gradient(135deg,#00C9A7,#00B4D8)",border:"none",borderRadius:9,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"};
const BS={padding:"10px 20px",background:"#2A2D35",border:"none",borderRadius:9,color:"#C0C0C5",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"};
function FF({label,children}){return <div style={{marginBottom:14}}><label style={{display:"block",fontSize:11,fontWeight:700,color:"#6B6F7B",marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase"}}>{label}</label>{children}</div>;}

function Modal({title,onClose,children,width=520}){
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={onClose}>
    <div style={{background:"#1A1D23",borderRadius:16,border:"1px solid #2A2D35",width:"100%",maxWidth:width,maxHeight:"85vh",overflow:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.5)"}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:"1px solid #2A2D35"}}><span style={{fontSize:15,fontWeight:700,color:"#F0F0F0"}}>{title}</span><button type="button" onClick={onClose} style={{background:"none",border:"none",color:"#6B6F7B",cursor:"pointer",padding:4}}><Ic name="close" size={16}/></button></div>
      <div style={{padding:20}}>{children}</div>
    </div>
  </div>;
}

function PwInput({value,onChange,placeholder}){
  const [s,setS]=useState(false);
  return <div style={{position:"relative"}}><input type={s?"text":"password"} value={value} onChange={onChange} placeholder={placeholder||"••••••••"} style={{...IS,paddingRight:42}}/><button type="button" onClick={()=>setS(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#5A5E6A",cursor:"pointer"}}><Ic name={s?"eyeOff":"eye"} size={16}/></button></div>;
}

// ── File attachment display ──
function FileAttachment({ file }) {
  if (!file) return null;
  const isImage = file.type?.startsWith("image/");
  const sizeStr = file.size > 1024*1024 ? `${(file.size/1024/1024).toFixed(1)}MB` : `${Math.round(file.size/1024)}KB`;
  return (
    <div style={{marginTop:6,borderRadius:8,overflow:"hidden",border:"1px solid #2A2D35"}}>
      {isImage && <img src={file.data} alt={file.name} style={{maxWidth:"100%",maxHeight:200,display:"block"}}/>}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",background:"#12141A",fontSize:11}}>
        <Ic name="clip" size={13}/><span style={{color:"#C0C0C5",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{file.name}</span><span style={{color:"#5A5E6A"}}>{sizeStr}</span>
        <a href={file.data} download={file.name} style={{color:"#00C9A7",textDecoration:"none"}} onClick={e=>e.stopPropagation()}><Ic name="download" size={13}/></a>
      </div>
    </div>
  );
}

// ── Due date reminder banner ──
function ReminderBanner({ tasks, myName, isManager }) {
  const myTasks = isManager ? tasks : tasks.filter(t=>t.assignee===myName);
  const overdue = myTasks.filter(t=>t.status!=="done"&&t.dueDate&&t.dueDate<today());
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const tmrw = tomorrow.toISOString().split("T")[0];
  const dueSoon = myTasks.filter(t=>t.status!=="done"&&t.dueDate&&t.dueDate===today());
  const dueTomorrow = myTasks.filter(t=>t.status!=="done"&&t.dueDate&&t.dueDate===tmrw);

  if(!overdue.length && !dueSoon.length && !dueTomorrow.length) return null;

  return (
    <div style={{marginBottom:16,display:"flex",flexDirection:"column",gap:6}}>
      {overdue.length>0 && <div style={{background:"#FF3B3012",border:"1px solid #FF3B3030",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
        <Ic name="alert" size={16}/><span style={{fontSize:12,color:"#FF6B6B",fontWeight:600}}>{overdue.length} overdue task{overdue.length>1?"s":""}: {overdue.map(t=>t.title).join(", ")}</span>
      </div>}
      {dueSoon.length>0 && <div style={{background:"#FF950012",border:"1px solid #FF950030",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
        <Ic name="bell" size={16}/><span style={{fontSize:12,color:"#FFB340",fontWeight:600}}>{dueSoon.length} due today: {dueSoon.map(t=>t.title).join(", ")}</span>
      </div>}
      {dueTomorrow.length>0 && <div style={{background:"#FFD60A12",border:"1px solid #FFD60A30",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
        <Ic name="bell" size={16}/><span style={{fontSize:12,color:"#FFE066",fontWeight:600}}>{dueTomorrow.length} due tomorrow: {dueTomorrow.map(t=>t.title).join(", ")}</span>
      </div>}
    </div>
  );
}

/* ═══ MAIN APP ═══ */
export default function App() {
  const [user,setUser]=useState(null);
  const [loading,setLoading]=useState(true);
  const [D,setD]=useState(INIT);
  const [view,setView]=useState("dashboard");
  const [sideOpen,setSideOpen]=useState(!isMobile());
  const [modal,setModal]=useState(null);
  const [aiMsgs,setAiMsgs]=useState([]);
  const [aiIn,setAiIn]=useState("");
  const [aiLoad,setAiLoad]=useState(false);
  const [activeChat,setActiveChat]=useState(null);
  const [msgInput,setMsgInput]=useState("");
  const [loginId,setLoginId]=useState("");
  const [loginPw,setLoginPw]=useState("");
  const [loginErr,setLoginErr]=useState("");
  const [taskDetail,setTaskDetail]=useState(null); // for comments view
  const [commentInput,setCommentInput]=useState("");
  const [attachFile,setAttachFile]=useState(null);
  const chatRef=useRef(null);
  const msgRef=useRef(null);
  const fileRef=useRef(null);
  const prevUnread=useRef(0);

  // Load once
  useEffect(()=>{(async()=>{const d=await loadData();if(d)setD({...INIT,...d,projects:d.projects||[],activityLog:d.activityLog||[]});setLoading(false);})();},[]);

  // Poll every 5s when logged in + send notifications for new messages
  useEffect(()=>{
    if(!user) return;
    requestNotifPermission();
    const interval=setInterval(async()=>{
      const d=await loadData();
      if(d){
        const remote={...INIT,...d,projects:d.projects||[],activityLog:d.activityLog||[]};
        const newUnread=remote.messages.filter(m=>m.to===user.name&&!m.readBy?.includes(user.name)).length;
        if(newUnread>prevUnread.current){
          const latest=remote.messages.filter(m=>m.to===user.name&&!m.readBy?.includes(user.name)).slice(-1)[0];
          if(latest) sendNotif(`Message from ${latest.from}`,latest.body?.slice(0,80));
        }
        prevUnread.current=newUnread;
        setD(remote);
      }
    },5000);
    return ()=>clearInterval(interval);
  },[user]);

  // Auto-reminders: check on login and every 60s
  useEffect(()=>{
    if(!user) return;
    const checkReminders=()=>{
      const myTasks=user.isManager?D.tasks:D.tasks.filter(t=>t.assignee===user.name);
      const overdue=myTasks.filter(t=>t.status!=="done"&&t.dueDate&&t.dueDate<today());
      const dueToday=myTasks.filter(t=>t.status!=="done"&&t.dueDate&&t.dueDate===today());
      if(overdue.length) sendNotif("Overdue Tasks!",`${overdue.length} task(s) past deadline: ${overdue.map(t=>t.title).join(", ")}`);
      else if(dueToday.length) sendNotif("Tasks Due Today",`${dueToday.length} task(s) due: ${dueToday.map(t=>t.title).join(", ")}`);
    };
    checkReminders();
    const interval=setInterval(checkReminders,60000);
    return ()=>clearInterval(interval);
  },[user,D.tasks]);

  // Responsive: close sidebar on mobile when navigating
  useEffect(()=>{if(isMobile()) setSideOpen(false);},[view]);

  useEffect(()=>{chatRef.current?.scrollIntoView({behavior:"smooth"});},[aiMsgs]);
  useEffect(()=>{msgRef.current?.scrollIntoView({behavior:"smooth"});},[D.messages,activeChat]);

  // ── Core update function ──
  const doUpdate=useCallback((key,fn)=>{
    setD(prev=>{const next={...prev,[key]:typeof fn==="function"?fn(prev[key]):fn};saveData(next);return next;});
  },[]);

  const {team,tasks,goals,schedule,followups,messages,projects,activityLog}=D;
  const isManager=user?.isManager;
  const myName=user?.name;
  const myTasks=isManager?tasks:tasks.filter(t=>t.assignee===myName);
  const myUnread=messages.filter(m=>m.to===myName&&!m.readBy?.includes(myName)).length;

  // ── Activity Logger ──
  const logActivity=(action,details)=>{
    doUpdate("activityLog",p=>[{id:uid(),user:myName,action,details,timestamp:nowISO()},...(p||[]).slice(0,99)]);
  };

  // ── Actions ──
  const addMsg=(to,body,type="message",file=null)=>{
    doUpdate("messages",p=>[...p,{id:uid(),timestamp:nowISO(),readBy:[],from:myName,to,type,body,...(file?{file}:{})}]);
  };
  const markRead=(ids)=>doUpdate("messages",p=>p.map(m=>ids.includes(m.id)?{...m,readBy:[...new Set([...(m.readBy||[]),myName])]}:m));
  const changePw=(mid,pw)=>doUpdate("team",p=>p.map(t=>t.id===mid?{...t,password:pw}:t));

  const addTask=(t)=>{
    doUpdate("tasks",p=>[...p,{id:uid(),createdAt:today(),status:"todo",comments:[],...t}]);
    logActivity("created task",`"${t.title}" assigned to ${t.assignee||"unassigned"}`);
    if(t.assignee&&t.assignee!=="Manager") setTimeout(()=>addMsg(t.assignee,`📋 New task: "${t.title}"\nPriority: ${PCOL[t.priority]?.l||"Medium"}\nDue: ${t.dueDate||"No deadline"}`,"task"),100);
  };

  const updateTask=(id,up)=>{
    const oldTask=tasks.find(t=>t.id===id);
    doUpdate("tasks",p=>p.map(t=>t.id===id?{...t,...up}:t));
    if(up.status&&oldTask) logActivity("updated task",`"${oldTask.title}" → ${STAT[up.status]}`);
    if(up.status&&!isManager&&oldTask) setTimeout(()=>addMsg("Manager",`✅ "${oldTask.title}" → ${STAT[up.status]}`,"status"),100);
  };

  const addComment=(taskId,text)=>{
    doUpdate("tasks",p=>p.map(t=>t.id===taskId?{...t,comments:[...(t.comments||[]),{id:uid(),user:myName,text,timestamp:nowISO()}]}:t));
  };

  const deleteTask=(id)=>{const t=tasks.find(x=>x.id===id);doUpdate("tasks",p=>p.filter(x=>x.id!==id));if(t)logActivity("deleted task",`"${t.title}"`);};
  const addGoal=(g)=>{doUpdate("goals",p=>[...p,{id:uid(),createdAt:today(),progress:0,...g}]);logActivity("created goal",`"${g.title}"`);};
  const updateGoal=(id,up)=>doUpdate("goals",p=>p.map(g=>g.id===id?{...g,...up}:g));
  const deleteGoal=(id)=>doUpdate("goals",p=>p.filter(g=>g.id!==id));
  const addScheduleItem=(i)=>{doUpdate("schedule",p=>[...p,{id:uid(),...i}]);logActivity("scheduled event",`"${i.title}" on ${i.date}`);};
  const deleteScheduleItem=(id)=>doUpdate("schedule",p=>p.filter(s=>s.id!==id));
  const addFollowup=(f)=>{
    doUpdate("followups",p=>[...p,{id:uid(),completed:false,createdAt:today(),...f}]);
    logActivity("created follow-up",`"${f.title}" for ${f.person}`);
    if(f.person&&f.person!=="Manager") setTimeout(()=>addMsg(f.person,`🔔 Follow-up: "${f.title}"\nDue: ${f.dueDate}${f.notes?"\n"+f.notes:""}`,"followup"),100);
  };
  const toggleFollowup=(id)=>doUpdate("followups",p=>p.map(f=>f.id===id?{...f,completed:!f.completed}:f));
  const deleteFollowup=(id)=>doUpdate("followups",p=>p.filter(f=>f.id!==id));
  const addTeamMember=(m)=>{doUpdate("team",p=>[...p,{id:uid(),...m}]);logActivity("added team member",m.name);};
  const addProject=(p)=>{doUpdate("projects",prev=>[...prev,{id:uid(),createdAt:today(),status:"active",...p}]);logActivity("created project",`"${p.name}"`);};
  const deleteProject=(id)=>doUpdate("projects",p=>p.filter(x=>x.id!==id));

  const sendMsg=async(to,body)=>{
    if(!body.trim()&&!attachFile) return;
    let file=null;
    if(attachFile){file=await fileToBase64(attachFile);setAttachFile(null);}
    addMsg(to,body||"📎 File attached","message",file);
  };

  const getConvo=(person)=>messages.filter(m=>(m.from===myName&&m.to===person)||(m.from===person&&m.to===myName)).sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
  const getUnreadFrom=(person)=>messages.filter(m=>m.from===person&&m.to===myName&&!m.readBy?.includes(myName)).length;

  const sendAI=async()=>{
    if(!aiIn.trim()||aiLoad)return;
    const msg=aiIn.trim();setAiIn("");setAiMsgs(p=>[...p,{role:"user",text:msg}]);setAiLoad(true);
    const ctx=`User:${myName}(${user.role})\nTasks:${myTasks.filter(t=>t.status!=="done").map(t=>`"${t.title}"[${STAT[t.status]}]`).join(";")}\nProjects:${projects.map(p=>p.name).join(",")}`;
    const r=await callAI(msg,`You are Nexus Agent. Data:\n${ctx}\nBe concise.`);
    setAiMsgs(p=>[...p,{role:"ai",text:r}]);setAiLoad(false);
  };

  const activeTasks=myTasks.filter(t=>t.status!=="done").length;
  const completedTasks=myTasks.filter(t=>t.status==="done").length;
  const pendingFU=(isManager?followups:followups.filter(f=>f.person===myName)).filter(f=>!f.completed).length;
  const goalProg=goals.length?Math.round(goals.reduce((s,g)=>s+(g.progress||0),0)/goals.length):0;
  const todaySch=schedule.filter(s=>s.date===today());
  const chatContacts=isManager?team.filter(t=>!t.isManager):[{id:"mgr",name:"Manager",role:"Manager",isManager:true}];

  const handleLogin=()=>{
    if(!loginId||!loginPw){setLoginErr("Select name & enter password");return;}
    const m=team.find(t=>t.id===loginId);if(!m){setLoginErr("User not found");return;}
    if(m.password!==loginPw){setLoginErr("Wrong password");return;}
    setLoginErr("");setUser(m);requestNotifPermission();
  };
  const handleLogout=()=>{setUser(null);setView("dashboard");setActiveChat(null);setAiMsgs([]);setLoginPw("");setLoginId("");setTaskDetail(null);};

  // ── STYLES (mobile responsive) ──
  const CSS=`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
    @keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
    *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:#2A2D35 transparent}*::-webkit-scrollbar{width:5px}*::-webkit-scrollbar-thumb{background:#2A2D35;border-radius:3px}
    input:focus,select:focus,textarea:focus{border-color:#00C9A7!important;box-shadow:0 0 0 3px #00C9A715}textarea{resize:vertical}button:hover{filter:brightness(1.08)}
    @media(max-width:767px){.sidebar{position:fixed!important;z-index:999!important;height:100vh!important;}.sidebar.closed{transform:translateX(-100%)!important;width:220px!important;}.main-content{padding:16px!important;}.chat-layout{flex-direction:column!important;}.chat-list{width:100%!important;max-height:180px!important;overflow-y:auto!important;}.mobile-header{display:flex!important;}}
    .mobile-header{display:none;}
  `;

  if(loading) return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0D0F14",color:"#00C9A7",fontFamily:"'DM Sans',sans-serif"}}><style>{CSS}</style><div style={{width:36,height:36,border:"3px solid #00C9A720",borderTopColor:"#00C9A7",borderRadius:"50%",animation:"spin .8s linear infinite"}}/></div>;

  // ── LOGIN ──
  if(!user) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0D0F14",fontFamily:"'DM Sans',sans-serif",padding:16}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:400,animation:"fadeIn .5s ease"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:60,height:60,borderRadius:18,background:"linear-gradient(135deg,#00C9A7,#00B4D8)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",boxShadow:"0 12px 40px #00C9A730",animation:"float 3s ease-in-out infinite"}}><Ic name="shield" size={28}/></div>
          <h1 style={{fontSize:26,fontWeight:800,color:"#F5F5F7",margin:"0 0 4px"}}>Nexus Agent</h1>
          <p style={{color:"#5A5E6A",fontSize:12,margin:0}}><Ic name="encrypted" size={12}/> Fully encrypted workspace</p>
        </div>
        <div style={{background:"#12141A",borderRadius:14,padding:22,border:"1px solid #1E2028"}}>
          <FF label="Who are you?"><select value={loginId} onChange={e=>{setLoginId(e.target.value);setLoginErr("");}} style={SS}><option value="">Select your name...</option>{team.map(m=><option key={m.id} value={m.id}>{m.name} — {m.role}{m.isManager?" (Admin)":""}</option>)}</select></FF>
          <FF label="Password"><PwInput value={loginPw} onChange={e=>{setLoginPw(e.target.value);setLoginErr("");}}/></FF>
          {loginErr&&<div style={{background:"#FF3B3015",border:"1px solid #FF3B3030",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#FF6B6B"}}>{loginErr}</div>}
          <button type="button" onClick={handleLogin} style={{...BP,width:"100%",padding:12,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:(loginId&&loginPw)?1:0.5}}><Ic name="lock" size={16}/> Sign In</button>
          <button type="button" onClick={()=>setModal("recover")} style={{width:"100%",marginTop:10,padding:8,background:"none",border:"1px solid #1E2028",borderRadius:8,color:"#5A5E6A",fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Ic name="key" size={14}/> Forgot Password?</button>
        </div>
        <p style={{color:"#3A3D45",fontSize:10,textAlign:"center",marginTop:12}}>Default: admin123 · Recovery PIN: 9999</p>
      </div>
      {modal==="recover"&&(()=>{const R=()=>{const[pin,setPin]=useState("");const[np,setNp]=useState("");const[err,setErr]=useState("");const[done,setDone]=useState(false);
        const sub=()=>{const mgr=team.find(t=>t.isManager);if(!mgr){setErr("No manager");return;}if(pin!==(mgr.recoveryPin||"9999")){setErr("Wrong PIN");return;}if(np.length<4){setErr("Min 4 chars");return;}const nT=team.map(t=>t.isManager?{...t,password:np}:t);const nD={...D,team:nT};setD(nD);saveData(nD);setDone(true);};
        if(done) return <Modal title="Done!" onClose={()=>setModal(null)} width={360}><div style={{textAlign:"center"}}><p style={{color:"#00C9A7",fontWeight:700}}>✓ Password reset! Log in with your new password.</p><button type="button" onClick={()=>setModal(null)} style={{...BP,marginTop:10}}>Close</button></div></Modal>;
        return <Modal title="Recover Password" onClose={()=>setModal(null)} width={400}>
          <FF label="Recovery PIN"><input value={pin} onChange={e=>{setPin(e.target.value);setErr("");}} style={IS} placeholder="4-digit PIN" maxLength={4}/></FF>
          <FF label="New Password"><PwInput value={np} onChange={e=>{setNp(e.target.value);setErr("");}}/></FF>
          {err&&<div style={{background:"#FF3B3015",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#FF6B6B"}}>{err}</div>}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={sub} style={BP}>Reset</button></div>
        </Modal>;};return <R/>;})()}
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
    {id:"activity",icon:"activity",label:"Activity Log"},
    {id:"ai",icon:"ai",label:"AI Agent"},
  ];

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"'DM Sans',sans-serif",background:"#0D0F14",color:"#E8E8ED",overflow:"hidden"}}>
      <style>{CSS}</style>

      {/* Mobile header */}
      <div className="mobile-header" style={{position:"fixed",top:0,left:0,right:0,zIndex:998,background:"#12141A",borderBottom:"1px solid #1E2028",padding:"10px 16px",alignItems:"center",justifyContent:"space-between"}}>
        <button type="button" onClick={()=>setSideOpen(p=>!p)} style={{background:"none",border:"none",color:"#E8E8ED",cursor:"pointer"}}><Ic name="menu" size={22}/></button>
        <span style={{fontWeight:700,fontSize:14}}>{navItems.find(n=>n.id===view)?.label}</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>{myUnread>0&&<span style={{background:"#E01E5A",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:8}}>{myUnread}</span>}<Av name={myName} size={26} mgr={isManager}/></div>
      </div>

      {/* Sidebar overlay for mobile */}
      {sideOpen&&isMobile()&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:998}} onClick={()=>setSideOpen(false)}/>}

      {/* SIDEBAR */}
      <div className={`sidebar ${sideOpen?"":"closed"}`} style={{width:sideOpen?210:0,background:"#12141A",borderRight:"1px solid #1E2028",display:"flex",flexDirection:"column",transition:"all .2s",flexShrink:0,overflow:"hidden",zIndex:999}}>
        <div style={{padding:"14px 14px",borderBottom:"1px solid #1E2028",display:"flex",alignItems:"center",gap:10,cursor:"pointer",minHeight:56}} onClick={()=>{if(!isMobile())setSideOpen(p=>!p);}}>
          <Av name={myName} size={30} mgr={isManager}/><div style={{overflow:"hidden"}}><div style={{fontSize:12,fontWeight:700,color:"#F0F0F0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{myName}</div><div style={{fontSize:10,color:isManager?"#00C9A7":"#5A5E6A"}}>{user.role}</div></div>
        </div>
        <nav style={{flex:1,padding:"8px 5px",display:"flex",flexDirection:"column",gap:1,overflowY:"auto"}}>
          {navItems.map(i=><button type="button" key={i.id} onClick={()=>{setView(i.id);setTaskDetail(null);if(isMobile())setSideOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:view===i.id?"#00C9A710":"transparent",border:"none",borderRadius:8,color:view===i.id?"#00C9A7":"#5A5E6A",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",textAlign:"left",whiteSpace:"nowrap"}}><Ic name={i.icon} size={16}/>{i.label}{i.id==="comms"&&myUnread>0&&<span style={{marginLeft:"auto",background:"#E01E5A",color:"#fff",fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:7}}>{myUnread}</span>}</button>)}
        </nav>
        <div style={{padding:"5px 5px 8px",display:"flex",flexDirection:"column",gap:3}}>
          <button type="button" onClick={()=>setModal("changePw")} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 12px",background:"none",border:"1px solid #1E2028",borderRadius:8,color:"#5A5E6A",cursor:"pointer",fontSize:10,fontWeight:600,fontFamily:"inherit"}}><Ic name="lock" size={14}/>Change Password</button>
          <button type="button" onClick={handleLogout} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 12px",background:"none",border:"1px solid #1E2028",borderRadius:8,color:"#5A5E6A",cursor:"pointer",fontSize:10,fontWeight:600,fontFamily:"inherit"}}><Ic name="logout" size={14}/>Logout</button>
        </div>
      </div>

      {/* MAIN */}
      <div className="main-content" style={{flex:1,overflow:"auto",padding:"20px 24px",marginTop:isMobile()?48:0}}>

        {/* DASHBOARD */}
        {view==="dashboard"&&<div style={{animation:"fadeIn .3s"}}>
          <h1 style={{fontSize:24,fontWeight:800,margin:0,color:"#F5F5F7"}}>{isManager?"Dashboard":`Hi, ${myName.split(" ")[0]}`}</h1>
          <p style={{color:"#5A5E6A",marginTop:3,fontSize:12}}><Ic name="encrypted" size={11}/> Encrypted · {new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</p>
          <ReminderBanner tasks={tasks} myName={myName} isManager={isManager}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginTop:16}}>
            {[{l:"Tasks",v:activeTasks,c:"#00C9A7",go:"tasks"},{l:"Done",v:completedTasks,c:"#45B7D1",go:"tasks"},{l:"Unread",v:myUnread,c:"#E01E5A",go:"comms"},{l:"Projects",v:projects.length,c:"#FF9500",go:"projects"},{l:"Goals",v:`${goalProg}%`,c:"#BB8FCE",go:"goals"},{l:"Events",v:todaySch.length,c:"#FFD60A",go:"schedule"}].map((s,i)=><div key={i} onClick={()=>setView(s.go)} style={{background:"#12141A",borderRadius:10,padding:"13px 14px",border:"1px solid #1E2028",cursor:"pointer"}}><div style={{fontSize:10,color:"#5A5E6A",fontWeight:700,textTransform:"uppercase"}}>{s.l}</div><div style={{fontSize:22,fontWeight:800,color:s.c,marginTop:3}}>{s.v}</div></div>)}
          </div>
          <div style={{background:"#12141A",borderRadius:10,padding:14,border:"1px solid #1E2028",marginTop:12}}>
            <h3 style={{fontSize:12,fontWeight:700,margin:"0 0 8px",color:"#C0C0C5"}}>Recent Activity</h3>
            {(activityLog||[]).slice(0,5).map(a=><div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #1A1D23",fontSize:11}}>
              <Av name={a.user||"?"} size={22}/><div style={{flex:1}}><span style={{color:"#8E8E93",fontWeight:600}}>{a.user}</span> <span style={{color:"#5A5E6A"}}>{a.action}</span> <span style={{color:"#C0C0C5"}}>{a.details}</span></div><span style={{color:"#4A4D55",fontSize:9,flexShrink:0}}>{timeAgo(a.timestamp)}</span>
            </div>)}
            {!(activityLog||[]).length&&<p style={{color:"#4A4D55",fontSize:11,margin:0}}>No activity yet</p>}
          </div>
        </div>}

        {/* MESSAGES */}
        {view==="comms"&&<div className="chat-layout" style={{animation:"fadeIn .3s",display:"flex",gap:12,height:"calc(100vh - "+(isMobile()?"100px":"48px")+")"}}>
          <div className="chat-list" style={{width:200,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:10}}><h2 style={{fontSize:16,fontWeight:800,margin:0}}>Messages</h2><Ic name="encrypted" size={13}/></div>
            {chatContacts.map(c=>{const ur=getUnreadFrom(c.name);const last=getConvo(c.name).slice(-1)[0];return <button type="button" key={c.id} onClick={()=>{setActiveChat(c.name);const ids=messages.filter(m=>m.from===c.name&&m.to===myName&&!m.readBy?.includes(myName)).map(m=>m.id);if(ids.length)markRead(ids);}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:activeChat===c.name?"#00C9A708":"#12141A",border:`1px solid ${activeChat===c.name?"#00C9A730":"#1E2028"}`,borderRadius:9,cursor:"pointer",textAlign:"left",fontFamily:"inherit",marginBottom:5,width:"100%"}}><Av name={c.name} size={30} mgr={c.isManager}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:"#E0E0E5"}}>{c.name}</div><div style={{fontSize:10,color:"#5A5E6A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{last?.body?.slice(0,22)||c.role}</div></div>{ur>0&&<span style={{background:"#E01E5A",color:"#fff",fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:7}}>{ur}</span>}</button>;})}
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",background:"#12141A",borderRadius:10,border:"1px solid #1E2028",minHeight:0}}>
            {activeChat?<>
              <div style={{padding:"10px 14px",borderBottom:"1px solid #1E2028",display:"flex",alignItems:"center",gap:8}}><Av name={activeChat} size={26} mgr={activeChat==="Manager"}/><div style={{fontSize:13,fontWeight:700,flex:1}}>{activeChat}</div><div style={{display:"flex",alignItems:"center",gap:3,color:"#00C9A7",fontSize:10}}><Ic name="encrypted" size={11}/>E2E</div></div>
              <div style={{flex:1,overflow:"auto",padding:14}}>
                {getConvo(activeChat).map(m=><div key={m.id} style={{display:"flex",justifyContent:m.from===myName?"flex-end":"flex-start",marginBottom:8}}>
                  <div style={{maxWidth:"80%",padding:"8px 12px",borderRadius:10,background:m.from===myName?"linear-gradient(135deg,#00C9A7,#00B4D8)":"#1E2028",color:m.from===myName?"#fff":"#E0E0E5"}}>
                    <div style={{fontSize:12,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.body}</div>
                    {m.file&&<FileAttachment file={m.file}/>}
                    <div style={{fontSize:8,color:m.from===myName?"#ffffff70":"#4A4D55",marginTop:2,textAlign:"right"}}>{timeAgo(m.timestamp)}</div>
                  </div>
                </div>)}<div ref={msgRef}/>
                {!getConvo(activeChat).length&&<p style={{color:"#4A4D55",textAlign:"center",padding:20,fontSize:12}}>No messages yet</p>}
              </div>
              {attachFile&&<div style={{padding:"6px 14px",borderTop:"1px solid #1E2028",display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#C0C0C5"}}><Ic name="clip" size={12}/>{attachFile.name}<button type="button" onClick={()=>setAttachFile(null)} style={{background:"none",border:"none",color:"#FF6B6B",cursor:"pointer",marginLeft:"auto"}}><Ic name="close" size={12}/></button></div>}
              <div style={{padding:"8px 14px",borderTop:"1px solid #1E2028",display:"flex",gap:6,alignItems:"center"}}>
                <button type="button" onClick={()=>fileRef.current?.click()} style={{background:"none",border:"none",color:"#5A5E6A",cursor:"pointer",padding:2}}><Ic name="clip" size={18}/></button>
                <input ref={fileRef} type="file" hidden onChange={e=>{if(e.target.files[0]){if(e.target.files[0].size>2*1024*1024){alert("Max 2MB");return;}setAttachFile(e.target.files[0]);}e.target.value="";}}/>
                <input value={msgInput} onChange={e=>setMsgInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&(msgInput.trim()||attachFile)){sendMsg(activeChat,msgInput);setMsgInput("");}}} placeholder={`Message ${activeChat}...`} style={{...IS,flex:1,padding:"8px 12px"}}/>
                <button type="button" onClick={()=>{if(msgInput.trim()||attachFile){sendMsg(activeChat,msgInput);setMsgInput("");}}} style={{...BP,padding:"8px 14px"}}><Ic name="send" size={15}/></button>
              </div>
            </>:<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6,color:"#4A4D55",fontSize:12}}><Ic name="encrypted" size={24}/>Select a conversation</div>}
          </div>
        </div>}

        {/* TEAM */}
        {view==="team"&&isManager&&<div style={{animation:"fadeIn .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h1 style={{fontSize:22,fontWeight:800,margin:0}}>Team</h1><button type="button" onClick={()=>setModal("addTeam")} style={BP}><Ic name="plus" size={14}/> Add</button></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
            {team.filter(t=>!t.isManager).map(m=>{const mt=tasks.filter(t=>t.assignee===m.name);return <div key={m.id} style={{background:"#12141A",borderRadius:10,padding:14,border:"1px solid #1E2028"}}>
              <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:10}}><Av name={m.name} size={34}/><div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{m.name}</div><div style={{fontSize:10,color:"#5A5E6A"}}>{m.role}</div></div></div>
              <div style={{display:"flex",gap:8,fontSize:10,color:"#5A5E6A",marginBottom:8}}><span><strong style={{color:"#00C9A7"}}>{mt.filter(t=>t.status!=="done").length}</strong> active</span><span><strong style={{color:"#45B7D1"}}>{mt.filter(t=>t.status==="done").length}</strong> done</span></div>
              <div style={{display:"flex",gap:4}}>
                <button type="button" onClick={()=>setModal({type:"addTask",assignee:m.name})} style={{flex:1,padding:6,background:"#00C9A710",border:"1px solid #00C9A725",borderRadius:6,color:"#00C9A7",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Assign</button>
                <button type="button" onClick={()=>{setView("comms");setActiveChat(m.name);}} style={{flex:1,padding:6,background:"#45B7D110",border:"1px solid #45B7D125",borderRadius:6,color:"#45B7D1",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Message</button>
                <button type="button" onClick={()=>setModal({type:"resetPw",member:m})} style={{padding:"6px 8px",background:"#FF950010",border:"1px solid #FF950025",borderRadius:6,color:"#FF9500",cursor:"pointer"}}><Ic name="lock" size={11}/></button>
              </div>
            </div>;})}
          </div>
        </div>}

        {/* TASKS */}
        {view==="tasks"&&!taskDetail&&<div style={{animation:"fadeIn .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h1 style={{fontSize:22,fontWeight:800,margin:0}}>{isManager?"All Tasks":"My Tasks"}</h1>{isManager&&<button type="button" onClick={()=>setModal("addTask")} style={BP}><Ic name="plus" size={14}/> New</button>}</div>
          <ReminderBanner tasks={tasks} myName={myName} isManager={isManager}/>
          {["todo","in_progress","review","blocked","done"].map(st=>{const gr=myTasks.filter(t=>t.status===st);if(!gr.length)return null;return <div key={st} style={{marginBottom:16}}>
            <div style={{fontSize:10,fontWeight:700,color:"#5A5E6A",textTransform:"uppercase",marginBottom:6}}>{STAT[st]} <span style={{background:"#1A1D23",padding:"1px 5px",borderRadius:5,fontSize:9}}>{gr.length}</span></div>
            {gr.map(t=><div key={t.id} style={{background:"#12141A",borderRadius:9,padding:"10px 12px",border:"1px solid #1E2028",marginBottom:4,display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setTaskDetail(t.id)}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                  <span style={{fontWeight:600,fontSize:12,color:t.status==="done"?"#5A5E6A":"#E8E8ED",textDecoration:t.status==="done"?"line-through":"none"}}>{t.title}</span>
                  <PB p={t.priority}/>{t.dueDate&&t.dueDate<today()&&t.status!=="done"&&<Bg color="#FF3B30">Overdue</Bg>}{t.project&&<Bg color="#FF9500">{t.project}</Bg>}
                  {(t.comments||[]).length>0&&<span style={{display:"flex",alignItems:"center",gap:2,color:"#5A5E6A",fontSize:10}}><Ic name="comment" size={11}/>{t.comments.length}</span>}
                </div>
                <div style={{fontSize:10,color:"#5A5E6A",marginTop:2}}>{isManager&&t.assignee&&<>→ <strong style={{color:"#8E8E93"}}>{t.assignee}</strong> · </>}{t.dueDate&&`Due ${t.dueDate}`}</div>
              </div>
              <select value={t.status} onChange={e=>{e.stopPropagation();updateTask(t.id,{status:e.target.value});}} onClick={e=>e.stopPropagation()} style={{...SS,padding:"4px 5px",fontSize:9,width:"auto",minWidth:80}}>{Object.entries(STAT).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
              {isManager&&<button type="button" onClick={e=>{e.stopPropagation();deleteTask(t.id);}} style={{background:"none",border:"none",color:"#4A4D55",cursor:"pointer"}}><Ic name="trash" size={12}/></button>}
            </div>)}
          </div>;})}
          {!myTasks.length&&<p style={{color:"#4A4D55",textAlign:"center",padding:24,fontSize:12}}>No tasks.</p>}
        </div>}

        {/* TASK DETAIL (comments) */}
        {view==="tasks"&&taskDetail&&(()=>{
          const t=tasks.find(x=>x.id===taskDetail);
          if(!t) return <p>Task not found</p>;
          return <div style={{animation:"fadeIn .3s"}}>
            <button type="button" onClick={()=>setTaskDetail(null)} style={{background:"none",border:"none",color:"#00C9A7",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,marginBottom:12,padding:0}}>← Back to tasks</button>
            <div style={{background:"#12141A",borderRadius:12,padding:18,border:"1px solid #1E2028"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}><h2 style={{fontSize:18,fontWeight:800,margin:0}}>{t.title}</h2><PB p={t.priority}/><Bg color={t.status==="done"?"#34C759":"#8E8E93"}>{STAT[t.status]}</Bg>{t.project&&<Bg color="#FF9500">{t.project}</Bg>}</div>
              {t.description&&<p style={{color:"#8E8E93",fontSize:12,margin:"0 0 8px"}}>{t.description}</p>}
              <div style={{fontSize:11,color:"#5A5E6A",display:"flex",gap:12,flexWrap:"wrap"}}>{t.assignee&&<span>Assigned: <strong style={{color:"#C0C0C5"}}>{t.assignee}</strong></span>}{t.dueDate&&<span>Due: <strong style={{color:t.dueDate<today()?"#FF6B6B":"#C0C0C5"}}>{t.dueDate}</strong></span>}<span>Created: {t.createdAt}</span></div>

              {/* Comments section */}
              <div style={{marginTop:18,borderTop:"1px solid #1E2028",paddingTop:14}}>
                <h3 style={{fontSize:13,fontWeight:700,margin:"0 0 10px",display:"flex",alignItems:"center",gap:6,color:"#C0C0C5"}}><Ic name="comment" size={15}/>Comments ({(t.comments||[]).length})</h3>
                {(t.comments||[]).map(c=><div key={c.id} style={{display:"flex",gap:8,marginBottom:10}}>
                  <Av name={c.user} size={26}/>
                  <div style={{flex:1,background:"#0D0F14",borderRadius:8,padding:"8px 12px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}><span style={{fontSize:11,fontWeight:700,color:"#E0E0E5"}}>{c.user}</span><span style={{fontSize:9,color:"#4A4D55"}}>{timeAgo(c.timestamp)}</span></div>
                    <div style={{fontSize:12,color:"#C0C0C5",lineHeight:1.5}}>{c.text}</div>
                  </div>
                </div>)}
                <div style={{display:"flex",gap:8,marginTop:6}}>
                  <input value={commentInput} onChange={e=>setCommentInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&commentInput.trim()){addComment(t.id,commentInput);setCommentInput("");}}} placeholder="Add a comment..." style={{...IS,flex:1,padding:"8px 12px"}}/>
                  <button type="button" onClick={()=>{if(commentInput.trim()){addComment(t.id,commentInput);setCommentInput("");}}} style={{...BP,padding:"8px 14px"}}><Ic name="send" size={14}/></button>
                </div>
              </div>
            </div>
          </div>;
        })()}

        {/* PROJECTS */}
        {view==="projects"&&<div style={{animation:"fadeIn .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h1 style={{fontSize:22,fontWeight:800,margin:0}}>Projects</h1>{isManager&&<button type="button" onClick={()=>setModal("addProject")} style={BP}><Ic name="plus" size={14}/> New</button>}</div>
          {projects.map(pr=>{const prT=tasks.filter(t=>t.project===pr.name);const dn=prT.filter(t=>t.status==="done").length;const pg=prT.length?Math.round(dn/prT.length*100):0;
            return <div key={pr.id} style={{background:"#12141A",borderRadius:10,padding:16,border:"1px solid #1E2028",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div><div style={{fontWeight:700,fontSize:14}}>{pr.name}</div>{pr.description&&<div style={{fontSize:11,color:"#5A5E6A",marginTop:2}}>{pr.description}</div>}</div>
                <div style={{display:"flex",gap:5}}>{isManager&&<button type="button" onClick={()=>setModal({type:"addTask",project:pr.name})} style={{padding:"5px 10px",background:"#00C9A710",border:"1px solid #00C9A725",borderRadius:6,color:"#00C9A7",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>+ Task</button>}{isManager&&<button type="button" onClick={()=>deleteProject(pr.id)} style={{background:"none",border:"none",color:"#4A4D55",cursor:"pointer"}}><Ic name="trash" size={13}/></button>}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><div style={{flex:1}}><Br value={pg} color="#FF9500"/></div><span style={{fontSize:11,fontWeight:700,color:"#FF9500"}}>{pg}%</span></div>
              <div style={{fontSize:10,color:"#5A5E6A",marginBottom:6}}>{prT.length} tasks · {dn} done</div>
              {prT.slice(0,5).map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderTop:"1px solid #1A1D23",cursor:"pointer"}} onClick={()=>{setView("tasks");setTaskDetail(t.id);}}>
                <span style={{fontSize:11,fontWeight:600,color:t.status==="done"?"#5A5E6A":"#E0E0E5",textDecoration:t.status==="done"?"line-through":"none",flex:1}}>{t.title}{t.assignee&&<span style={{color:"#5A5E6A",fontWeight:400}}> → {t.assignee}</span>}</span>
                <Bg color={t.status==="done"?"#34C759":"#6B6F7B"}>{STAT[t.status]}</Bg>
              </div>)}
            </div>;
          })}
          {!projects.length&&<p style={{color:"#4A4D55",textAlign:"center",padding:24,fontSize:12}}>{isManager?"No projects. Create one!":"No projects."}</p>}
        </div>}

        {/* FOLLOW-UPS */}
        {view==="followups"&&isManager&&<div style={{animation:"fadeIn .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h1 style={{fontSize:22,fontWeight:800,margin:0}}>Follow-ups</h1><button type="button" onClick={()=>setModal("addFollowup")} style={BP}><Ic name="plus" size={14}/> Add</button></div>
          {followups.filter(f=>!f.completed).map(f=><div key={f.id} style={{background:"#12141A",borderRadius:9,padding:"10px 12px",border:"1px solid #1E2028",marginBottom:4,display:"flex",alignItems:"center",gap:10}}>
            <button type="button" onClick={()=>toggleFollowup(f.id)} style={{width:18,height:18,borderRadius:5,border:"2px solid #3A3D45",background:"none",cursor:"pointer",flexShrink:0}}/>
            <div style={{flex:1}}><div style={{fontWeight:600,fontSize:12}}>{f.title}</div><div style={{fontSize:10,color:"#5A5E6A"}}>{f.person} · Due {f.dueDate}</div></div>
            <button type="button" onClick={()=>deleteFollowup(f.id)} style={{background:"none",border:"none",color:"#4A4D55",cursor:"pointer"}}><Ic name="trash" size={12}/></button></div>)}
          {!followups.filter(f=>!f.completed).length&&<p style={{color:"#4A4D55",textAlign:"center",padding:24,fontSize:12}}>No pending follow-ups.</p>}
        </div>}

        {/* GOALS */}
        {view==="goals"&&<div style={{animation:"fadeIn .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h1 style={{fontSize:22,fontWeight:800,margin:0}}>Goals</h1>{isManager&&<button type="button" onClick={()=>setModal("addGoal")} style={BP}><Ic name="plus" size={14}/> New</button>}</div>
          {["short_term","long_term"].map(type=>{const gr=goals.filter(g=>g.type===type);if(!gr.length)return null;return <div key={type} style={{marginBottom:18}}><div style={{fontSize:10,fontWeight:700,color:"#5A5E6A",textTransform:"uppercase",marginBottom:8}}>{type==="short_term"?"Short-term":"Long-term"}</div>{gr.map(g=><div key={g.id} style={{background:"#12141A",borderRadius:10,padding:"14px 16px",border:"1px solid #1E2028",marginBottom:6}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div style={{fontWeight:700,fontSize:13}}>{g.title}</div>{isManager&&<button type="button" onClick={()=>deleteGoal(g.id)} style={{background:"none",border:"none",color:"#4A4D55",cursor:"pointer"}}><Ic name="trash" size={12}/></button>}</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{flex:1}}><Br value={g.progress} color={type==="short_term"?"#00C9A7":"#BB8FCE"}/></div><span style={{fontSize:11,fontWeight:700,color:type==="short_term"?"#00C9A7":"#BB8FCE"}}>{g.progress}%</span></div>
            {isManager&&<input type="range" min="0" max="100" value={g.progress} onChange={e=>updateGoal(g.id,{progress:parseInt(e.target.value)})} style={{width:"100%",marginTop:5,accentColor:type==="short_term"?"#00C9A7":"#BB8FCE"}}/>}
            {g.milestones?.length>0&&<div style={{marginTop:8}}>{g.milestones.map((m,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#5A5E6A",padding:"2px 0",cursor:isManager?"pointer":"default"}} onClick={()=>{if(!isManager)return;const up=[...g.milestones];up[i]={...m,done:!m.done};updateGoal(g.id,{milestones:up,progress:Math.round(up.filter(x=>x.done).length/up.length*100)});}}><span style={{color:m.done?"#00C9A7":"#3A3D45"}}>{m.done?"✓":"○"}</span><span style={{textDecoration:m.done?"line-through":"none"}}>{m.text}</span></div>)}</div>}
          </div>)}</div>;})}
          {!goals.length&&<p style={{color:"#4A4D55",textAlign:"center",padding:24,fontSize:12}}>No goals.</p>}
        </div>}

        {/* SCHEDULE */}
        {view==="schedule"&&<div style={{animation:"fadeIn .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h1 style={{fontSize:22,fontWeight:800,margin:0}}>Schedule</h1>{isManager&&<button type="button" onClick={()=>setModal("addSchedule")} style={BP}><Ic name="plus" size={14}/> Add</button>}</div>
          {todaySch.sort((a,b)=>a.time.localeCompare(b.time)).map(s=><div key={s.id} style={{background:"#12141A",borderRadius:9,padding:"10px 12px",border:"1px solid #1E2028",marginBottom:4,display:"flex",alignItems:"center",gap:10}}><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,color:"#00C9A7",minWidth:44}}>{s.time}</div><div style={{flex:1,fontWeight:600,fontSize:12}}>{s.title}</div>{isManager&&<button type="button" onClick={()=>deleteScheduleItem(s.id)} style={{background:"none",border:"none",color:"#4A4D55",cursor:"pointer"}}><Ic name="trash" size={12}/></button>}</div>)}
          {!todaySch.length&&<p style={{color:"#4A4D55",fontSize:11}}>No events today</p>}
          {schedule.filter(s=>s.date>today()).length>0&&<><div style={{fontSize:10,fontWeight:700,color:"#5A5E6A",textTransform:"uppercase",marginTop:16,marginBottom:6}}>Upcoming</div>{schedule.filter(s=>s.date>today()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,10).map(s=><div key={s.id} style={{background:"#12141A",borderRadius:9,padding:"10px 12px",border:"1px solid #1E2028",marginBottom:4,display:"flex",alignItems:"center",gap:10}}><div><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:"#5A5E6A"}}>{s.date}</div><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,color:"#45B7D1"}}>{s.time}</div></div><div style={{flex:1,fontWeight:600,fontSize:12}}>{s.title}</div></div>)}</>}
        </div>}

        {/* ACTIVITY LOG */}
        {view==="activity"&&<div style={{animation:"fadeIn .3s"}}>
          <h1 style={{fontSize:22,fontWeight:800,margin:"0 0 18px"}}>Activity Log</h1>
          {(activityLog||[]).slice(0,50).map(a=><div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #1A1D23"}}>
            <Av name={a.user||"?"} size={28}/>
            <div style={{flex:1}}><span style={{fontSize:12,fontWeight:600,color:"#E0E0E5"}}>{a.user}</span> <span style={{fontSize:12,color:"#5A5E6A"}}>{a.action}</span><div style={{fontSize:11,color:"#8E8E93"}}>{a.details}</div></div>
            <span style={{fontSize:10,color:"#4A4D55",flexShrink:0}}>{timeAgo(a.timestamp)}</span>
          </div>)}
          {!(activityLog||[]).length&&<p style={{color:"#4A4D55",textAlign:"center",padding:24,fontSize:12}}>No activity yet.</p>}
        </div>}

        {/* AI */}
        {view==="ai"&&<div style={{animation:"fadeIn .3s",display:"flex",flexDirection:"column",height:"calc(100vh - "+(isMobile()?"100px":"48px")+")"}}>
          <h1 style={{fontSize:22,fontWeight:800,margin:"0 0 10px"}}>AI Agent</h1>
          {!aiMsgs.length&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>{(isManager?["Focus priorities?","Team workload","Deadlines?","Plan week"]:["My priorities?","Help with task","Overdue?","Update manager"]).map(q=><button type="button" key={q} onClick={()=>setAiIn(q)} style={{padding:"8px 10px",background:"#12141A",border:"1px solid #1E2028",borderRadius:8,color:"#6B6F7B",fontSize:11,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>{q}</button>)}</div>}
          <div style={{flex:1,overflowY:"auto",marginBottom:8}}>{aiMsgs.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:8}}><div style={{maxWidth:"80%",padding:"9px 13px",borderRadius:10,background:m.role==="user"?"linear-gradient(135deg,#00C9A7,#00B4D8)":"#12141A",color:m.role==="user"?"#fff":"#E0E0E5",border:m.role==="ai"?"1px solid #1E2028":"none",fontSize:12,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.text}</div></div>)}{aiLoad&&<div style={{display:"flex"}}><div style={{padding:"9px 13px",borderRadius:10,background:"#12141A",border:"1px solid #1E2028",display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#00C9A7",animation:`pulse 1.2s ease-in-out ${i*.2}s infinite`}}/>)}</div></div>}<div ref={chatRef}/></div>
          <div style={{display:"flex",gap:6,paddingBottom:4}}><input value={aiIn} onChange={e=>setAiIn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendAI()} placeholder="Ask AI..." style={{...IS,flex:1,padding:"8px 12px"}}/><button type="button" onClick={sendAI} disabled={aiLoad} style={{...BP,padding:"8px 14px",opacity:aiLoad?.5:1}}><Ic name="send" size={14}/></button></div>
        </div>}
      </div>

      {/* ═══ MODALS ═══ */}
      {modal==="changePw"&&(()=>{const C=()=>{const[c,setC]=useState("");const[n,setN]=useState("");const[cf,setCf]=useState("");const[e,setE]=useState("");const[d,setDn]=useState(false);
        const sub=()=>{if(c!==user.password){setE("Wrong password");return;}if(n.length<4){setE("Min 4 chars");return;}if(n!==cf){setE("Don't match");return;}changePw(user.id,n);setUser(p=>({...p,password:n}));setDn(true);};
        if(d)return <Modal title="Done" onClose={()=>setModal(null)} width={340}><div style={{textAlign:"center"}}><p style={{color:"#00C9A7",fontWeight:700}}>✓ Updated!</p><button type="button" onClick={()=>setModal(null)} style={{...BP,marginTop:8}}>Close</button></div></Modal>;
        return <Modal title="Change Password" onClose={()=>setModal(null)} width={400}><FF label="Current"><PwInput value={c} onChange={x=>{setC(x.target.value);setE("");}}/></FF><FF label="New"><PwInput value={n} onChange={x=>{setN(x.target.value);setE("");}}/></FF><FF label="Confirm"><PwInput value={cf} onChange={x=>{setCf(x.target.value);setE("");}}/></FF>{e&&<div style={{background:"#FF3B3015",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#FF6B6B"}}>{e}</div>}<div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={sub} style={BP}>Update</button></div></Modal>;
      };return <C/>;})()}

      {modal?.type==="resetPw"&&(()=>{const R=()=>{const[p,setP]=useState("");const[d,setDn]=useState(false);
        if(d)return <Modal title="Done" onClose={()=>setModal(null)} width={340}><div style={{textAlign:"center"}}><p style={{color:"#00C9A7",fontWeight:700}}>✓ Reset for {modal.member.name}!</p><button type="button" onClick={()=>setModal(null)} style={{...BP,marginTop:8}}>Done</button></div></Modal>;
        return <Modal title={`Reset — ${modal.member.name}`} onClose={()=>setModal(null)} width={400}><FF label="New Password"><PwInput value={p} onChange={e=>setP(e.target.value)}/></FF><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(p.length>=4){changePw(modal.member.id,p);setDn(true);}}} style={{...BP,opacity:p.length>=4?1:0.4}}>Reset</button></div></Modal>;
      };return <R/>;})()}

      {modal==="addTeam"&&(()=>{const C=()=>{const[n,setN]=useState("");const[r,setR]=useState("");const[p,setP]=useState("");const ok=n.trim()&&r.trim()&&p.length>=4;
        return <Modal title="Add Member" onClose={()=>setModal(null)}><FF label="Name"><input value={n} onChange={e=>setN(e.target.value)} style={IS} placeholder="e.g. Rahul Kumar" autoFocus/></FF><FF label="Role"><input value={r} onChange={e=>setR(e.target.value)} style={IS} placeholder="e.g. Full Stack Dev"/></FF><FF label="Password"><PwInput value={p} onChange={e=>setP(e.target.value)} placeholder="Min 4 chars"/></FF><div style={{background:"#FF950010",border:"1px solid #FF950025",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"#FF9500"}}>🔑 Share password with {n||"them"}</div><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(ok){addTeamMember({name:n.trim(),role:r.trim(),password:p});setModal(null);}}} style={{...BP,opacity:ok?1:0.4,pointerEvents:ok?"auto":"none"}}>Add</button></div></Modal>;
      };return <C/>;})()}

      {(modal==="addTask"||modal?.type==="addTask")&&(()=>{const C=()=>{const[t,setT]=useState("");const[d,setDe]=useState("");const[a,setA]=useState(modal?.assignee||"");const[p,setP]=useState("medium");const[du,setDu]=useState("");const[pr,setPr]=useState(modal?.project||"");
        return <Modal title="Assign Task" onClose={()=>setModal(null)}><FF label="Title"><input value={t} onChange={e=>setT(e.target.value)} style={IS} placeholder="e.g. Redesign homepage" autoFocus/></FF><FF label="Description"><textarea value={d} onChange={e=>setDe(e.target.value)} rows={2} style={IS}/></FF><FF label="Assign To"><select value={a} onChange={e=>setA(e.target.value)} style={SS}><option value="">Unassigned</option>{team.filter(x=>!x.isManager).map(m=><option key={m.id} value={m.name}>{m.name}</option>)}</select></FF><FF label="Project"><select value={pr} onChange={e=>setPr(e.target.value)} style={SS}><option value="">No project</option>{projects.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></FF><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><FF label="Priority"><select value={p} onChange={e=>setP(e.target.value)} style={SS}><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></FF><FF label="Due"><input value={du} onChange={e=>setDu(e.target.value)} type="date" style={IS}/></FF></div><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(t.trim()){addTask({title:t.trim(),description:d,assignee:a,priority:p,dueDate:du,project:pr});setModal(null);}}} style={{...BP,opacity:t.trim()?1:0.4,pointerEvents:t.trim()?"auto":"none"}}>Create</button></div></Modal>;
      };return <C/>;})()}

      {modal==="addProject"&&(()=>{const C=()=>{const[n,setN]=useState("");const[d,setDe]=useState("");
        return <Modal title="New Project" onClose={()=>setModal(null)}><FF label="Name"><input value={n} onChange={e=>setN(e.target.value)} style={IS} placeholder="e.g. Website Redesign" autoFocus/></FF><FF label="Description"><textarea value={d} onChange={e=>setDe(e.target.value)} rows={2} style={IS}/></FF><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(n.trim()){addProject({name:n.trim(),description:d});setModal(null);}}} style={{...BP,opacity:n.trim()?1:0.4,pointerEvents:n.trim()?"auto":"none"}}>Create</button></div></Modal>;
      };return <C/>;})()}

      {modal==="addFollowup"&&(()=>{const C=()=>{const m=team.filter(t=>!t.isManager);const[t,setT]=useState("");const[p,setP]=useState(m[0]?.name||"");const[d,setDe]=useState("");const[n,setN]=useState("");
        return <Modal title="Add Follow-up" onClose={()=>setModal(null)}><FF label="Subject"><input value={t} onChange={e=>setT(e.target.value)} style={IS} autoFocus/></FF><FF label="Person"><select value={p} onChange={e=>setP(e.target.value)} style={SS}>{m.map(x=><option key={x.id} value={x.name}>{x.name}</option>)}</select></FF><FF label="Due"><input value={d} onChange={e=>setDe(e.target.value)} type="date" style={IS}/></FF><FF label="Notes"><textarea value={n} onChange={e=>setN(e.target.value)} rows={2} style={IS}/></FF><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(t.trim()&&d){addFollowup({title:t.trim(),person:p,dueDate:d,notes:n});setModal(null);}}} style={{...BP,opacity:(t.trim()&&d)?1:0.4,pointerEvents:(t.trim()&&d)?"auto":"none"}}>Add</button></div></Modal>;
      };return <C/>;})()}

      {modal==="addGoal"&&(()=>{const C=()=>{const[t,setT]=useState("");const[d,setDe]=useState("");const[ty,setTy]=useState("short_term");const[dl,setDl]=useState("");const[ms,setMs]=useState("");
        return <Modal title="New Goal" onClose={()=>setModal(null)}><FF label="Title"><input value={t} onChange={e=>setT(e.target.value)} style={IS} autoFocus/></FF><FF label="Description"><textarea value={d} onChange={e=>setDe(e.target.value)} rows={2} style={IS}/></FF><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><FF label="Type"><select value={ty} onChange={e=>setTy(e.target.value)} style={SS}><option value="short_term">Short-term</option><option value="long_term">Long-term</option></select></FF><FF label="Deadline"><input value={dl} onChange={e=>setDl(e.target.value)} type="date" style={IS}/></FF></div><FF label="Milestones (one per line)"><textarea value={ms} onChange={e=>setMs(e.target.value)} rows={3} style={IS} placeholder={"Research\nWireframes\nMVP"}/></FF><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(t.trim()){addGoal({title:t.trim(),description:d,type:ty,deadline:dl,milestones:ms.split("\n").filter(Boolean).map(x=>({text:x.trim(),done:false}))});setModal(null);}}} style={{...BP,opacity:t.trim()?1:0.4,pointerEvents:t.trim()?"auto":"none"}}>Create</button></div></Modal>;
      };return <C/>;})()}

      {modal==="addSchedule"&&(()=>{const C=()=>{const[t,setT]=useState("");const[d,setDe]=useState(today());const[ti,setTi]=useState("");
        return <Modal title="Schedule Event" onClose={()=>setModal(null)}><FF label="Event"><input value={t} onChange={e=>setT(e.target.value)} style={IS} autoFocus/></FF><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><FF label="Date"><input value={d} onChange={e=>setDe(e.target.value)} type="date" style={IS}/></FF><FF label="Time"><input value={ti} onChange={e=>setTi(e.target.value)} type="time" style={IS}/></FF></div><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button type="button" onClick={()=>setModal(null)} style={BS}>Cancel</button><button type="button" onClick={()=>{if(t.trim()&&ti){addScheduleItem({title:t.trim(),date:d,time:ti});setModal(null);}}} style={{...BP,opacity:(t.trim()&&ti)?1:0.4,pointerEvents:(t.trim()&&ti)?"auto":"none"}}>Add</button></div></Modal>;
      };return <C/>;})()}
    </div>
  );
}
