/* ==== Housemates Chore Helper – Local mode (no Firebase) ==== */

/* ---------- APP CONFIG ---------- */
const HOUSE_CODE = atob("Nzg3OQ==");
const MEMBERS = [
  "Sandhra & Sandrima",
  "Priyanka & Jatin",
  "Jibin & Josna",
  "Melvin"
];

// Map older individual names to grouped labels (if any show up in history)
const NAME_TO_GROUP = {
  "Sandhra":"Sandhra & Sandrima",
  "Sandrima":"Sandhra & Sandrima",
  "Priyanka":"Priyanka & Jatin",
  "Jathin":"Priyanka & Jatin",
  "Jatin":"Priyanka & Jatin",
  "Jibin":"Jibin & Josna",
  "Joshna":"Jibin & Josna",
  "Josna":"Jibin & Josna",
  "Melvin":"Melvin"
};
const groupLabelFor = (name) => MEMBERS.includes(name) ? name : (NAME_TO_GROUP[name] || name);

/* ---------- ACCESS GUARD ---------- */
const CURRENT_USER_KEY = "rch_currentUser";
const me = localStorage.getItem(CURRENT_USER_KEY);
const savedCode = localStorage.getItem('rch_houseCode');
if ((location.pathname.toLowerCase().endsWith("index.html") || location.pathname === "/")
    && (!me || !MEMBERS.includes(me) || savedCode !== HOUSE_CODE)) {
  location.href = "login.html";
}

/* ---------- STORAGE KEYS (per house) ---------- */
const houseCode = savedCode || HOUSE_CODE;
const KEY_TASKS   = `rch_tasks_${houseCode}`;
const KEY_LOGS    = `rch_logs_${houseCode}`;
const KEY_AREALOG = `rch_arealogs_${houseCode}`;
const KEY_META    = `rch_meta_${houseCode}`;

/* ---------- DEFAULTS VERSION (for merging new defaults later) ---------- */
const DEFAULTS_VERSION = "2025-08-25-1";
const KEY_DEFAULTS_VER = `rch_defaults_version_${houseCode}`;

/* ---------- HELPERS ---------- */
const sid    = () => Math.random().toString(36).slice(2, 10);
const pretty = (iso) => new Date(iso).toLocaleString();
function monthKey(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  return `${y}-${m}`;
}
const isMobile = () => window.matchMedia("(max-width: 520px)").matches;

function startOfWeekThursday(d = new Date()){
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate()); // local midnight
  const day = date.getDay();            // 0=Sun..6=Sat
  const diff = (day - 4 + 7) % 7;       // days since Thursday (4)
  date.setDate(date.getDate() - diff);
  date.setHours(0,0,0,0);
  return date;
}
function weekKey(d = new Date()){
  const s = startOfWeekThursday(d);
  const y = s.getFullYear();
  const m = String(s.getMonth()+1).padStart(2,'0');
  const day = String(s.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function lastWeekRangeISO(now = new Date()){
  const end = startOfWeekThursday(now);               // this week's Thu 00:00
  const start = new Date(end.getTime() - 7*86400000); // previous Thu 00:00
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/* ---------- DEFAULT TASKS (seed once) ---------- */
function makeTask(area, title){
  return { id:sid(), area, title, done:false, completedBy:"", completedAt:"", isDefault:true };
}
const defaultTasks =
  // Kitchen
  [
    "Garbage Bin Wash 1,2,3","Fridge (Outside/Inside)","Sink & Faucet",
    "Cabinet & Handles","Floor – Sweep & Mop","Microwave(Outside/Inside) ",
    "Burner","Countertops 1,2,3"
  ].map(t => makeTask("Kitchen", t))

  // Living Room
  .concat([
    "Dining & Coffee Table","Table Cloth","Sofa Wipe & Fluff Cushions","Tv Stand",
    "Windows / Glassdoor","Washbasin","Closet","Waste Bin","Mirror","Stain Removal"
  ].map(t => makeTask("Living Room", t)))

  // Shoe Rack Area
  .concat([
    "Wipe/Sweep Shoe Rack & Floor","Stairs","Door / Window","Sofa Wipe & Fluff Cushions","Prayer Table"
  ].map(t => makeTask("Shoe Rack Area", t)))

  // Washroom
  .concat([
    "Wipe/Sweep","Washbasin","Closet","Bathtub","Waste Bin","Mirror"
  ].map(t => makeTask("Washroom", t)))

  // Laundry Room
  .concat([
    "Wipe/Sweep Walking Area & Laundry room","Waste Bin","Washing Machine","Dryer",
     "Wipe/Sweep","Washbasin","Closet","Bathtub","Waste Bin","Mirror"
  ].map(t => makeTask("Laundry Room", t)));

/* ---------- SIMPLE STORE (localStorage) ---------- */
function load(key, fallback){
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---------- STATE ---------- */
let tasks    = load(KEY_TASKS,   []);
let logs     = load(KEY_LOGS,    []);
let areaLogs = load(KEY_AREALOG, []);
let houseMeta= load(KEY_META,    {});
let activeFilter = "All";

/* ---------- DOM ---------- */
const tabs       = document.querySelectorAll(".tab");
const taskList   = document.getElementById("taskList");
const listTitle  = document.getElementById("listTitle");
const areaSelect = document.getElementById("areaSelect");
const taskInput  = document.getElementById("taskInput");
const addBtn     = document.getElementById("addBtn");
const helloUser  = document.getElementById("helloUser");
const signOutBtn = document.getElementById("signOutBtn");
const mainListHeader = document.querySelector('main .list-header');
const headerFilters  = mainListHeader?.querySelector('.filters');
const toastEl = document.getElementById("toast");

if (helloUser && me) helloUser.textContent = `Hello, ${me}`;

/* ---------- TOAST ---------- */
function showToast(msg){
  if(!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(()=> toastEl.classList.remove("show"), 2300);
}

/* ---------- SEED IF EMPTY ---------- */
function seedIfEmpty(){
  if (!Array.isArray(tasks) || tasks.length === 0){
    tasks = defaultTasks.slice();
    save(KEY_TASKS, tasks);
  }
}

/* ---------- APPLY NEW DEFAULTS (migrator) ---------- */
function applyDefaultsIfVersionChanged(){
  const current = localStorage.getItem(KEY_DEFAULTS_VER);
  if (current === DEFAULTS_VERSION) return; // already applied

  const existing = new Set(tasks.map(t => `${t.area}::${t.title}`.toLowerCase()));
  const additions = [];
  for (const d of defaultTasks){
    const k = `${d.area}::${d.title}`.toLowerCase();
    if (!existing.has(k)){
      additions.push({ ...d, id: sid(), isDefault: true, done:false, completedBy:"", completedAt:"" });
    }
  }
  if (additions.length){
    tasks = tasks.concat(additions);
    save(KEY_TASKS, tasks);
  }
  localStorage.setItem(KEY_DEFAULTS_VER, DEFAULTS_VERSION);
}

/* ---------- ALL-DONE BANNER ---------- */
let allDoneBanner = null;
function ensureAllDoneBanner(){
  if (allDoneBanner) return;
  allDoneBanner = document.createElement('div');
  allDoneBanner.id = 'allDoneBanner';
  allDoneBanner.className = 'pill';
  allDoneBanner.style.display = 'none';
  allDoneBanner.textContent = 'THIS WEEK CHORES DONE — COME BACK NEXT WEEK';
  mainListHeader?.insertAdjacentElement('afterend', allDoneBanner);
}
function updateAllDoneBanner(){
  ensureAllDoneBanner();
  const { all } = getCounts();
  const allDone = all.total > 0 && all.done === all.total;
  allDoneBanner.style.display = allDone ? '' : 'none';
}

/* ---------- MISSED LAST WEEK BANNER ---------- */
let missedBanner = null;
function ensureMissedBanner(){
  if (missedBanner) return;
  missedBanner = document.createElement('div');
  missedBanner.className = 'pill';
  missedBanner.style.background = '#fef2f2';
  missedBanner.style.color = '#991b1b';
  missedBanner.style.margin = '10px 0';
  missedBanner.style.display = 'none';
  missedBanner.style.lineHeight = '1.35';
  missedBanner.style.padding = '12px 14px';
  missedBanner.setAttribute('role', 'status');
  mainListHeader?.insertAdjacentElement('afterend', missedBanner);
}
function lastWeekLabel(){
  const { startISO, endISO } = lastWeekRangeISO(new Date());
  const s = new Date(startISO);
  const e = new Date(new Date(endISO).getTime() - 1);
  const fmt = d => d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
  return `${fmt(s)} – ${fmt(e)}`;
}

/* NEW: Only show the missed banner Tue–Wed (and Thu morning) */
function shouldShowMissedBannerNow(now = new Date()){
  const day = now.getDay();   // 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu
  const hr  = now.getHours();
  if (day === 2 || day === 3) return true;       // Tue, Wed (all day)
  if (day === 4 && hr < 12)    return true;       // Thu before noon
  return false;
}

function renderMissedBanner(missedNames){
  ensureMissedBanner();
  const period = lastWeekLabel();
  const missed = Array.isArray(missedNames) ? missedNames.filter(Boolean) : [];
  const wk = weekKey();
  const dismissedKey = `rch_missed_dismissed_${wk}`;
  if (localStorage.getItem(dismissedKey) === '1') {
    missedBanner.style.display = 'none';
    return;
  }
  const leftHtml = missed.length === 0
    ? `<div style="font-weight:700;margin-bottom:4px;">Last week (${period})</div>
       <div>🎉 Everyone completed at least one task.</div>`
    : `<div style="font-weight:700;margin-bottom:4px;">Last week (${period})</div>
       <div>⚠️ Did not complete any tasks: <b>${missed.join(', ')}</b></div>`;
  missedBanner.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
      <div>${leftHtml}</div>
      <button type="button" id="dismissMissedBtn" class="btn ghost small" aria-label="Dismiss reminder" title="Dismiss">✕</button>
    </div>`;
  const btn = missedBanner.querySelector('#dismissMissedBtn');
  if (btn) btn.onclick = () => {
    localStorage.setItem(dismissedKey, '1');
    missedBanner.style.display = 'none';
  };
  missedBanner.style.display = '';
}
function showMissedFromLastWeekIfAny(){
  const wk = weekKey();
  // NEW: gate by weekday/time
  if (!shouldShowMissedBannerNow()){
    if (missedBanner) missedBanner.style.display = 'none';
    return;
  }
  if (houseMeta?.missedWeekKey === wk) {
    renderMissedBanner(houseMeta?.missedMembers || []);
  } else if (missedBanner){
    missedBanner.style.display = 'none';
  }
}

/* ---------- COUNTS / TAB BADGES ---------- */
function getCounts(){
  const counts = {};
  for (const t of tasks){
    if(!counts[t.area]) counts[t.area] = {done:0,total:0};
    counts[t.area].total++;
    if (t.done) counts[t.area].done++;
  }
  const all = Object.values(counts).reduce((acc,c)=>({done:acc.done+c.done,total:acc.total+c.total}), {done:0,total:0});
  return {counts, all};
}
function updateTabBadges(){
  const {counts, all} = getCounts();
  document.querySelectorAll(".tab").forEach(btn=>{
    const area = btn.dataset.filter;
    let done=0, total=0;
    if (area === "All"){ done = all.done; total = all.total; }
    else if (counts[area]){ done = counts[area].done; total = counts[area].total; }
    btn.innerHTML = `${area} <span class="badge">${done}/${total}</span>`;
  });
}

/* ---------- COMPLETE AREA QUICK ACTION ---------- */
let completeAreaBtn = null;
function ensureCompleteAreaBtn(){
  if (!headerFilters || completeAreaBtn) return;
  completeAreaBtn = document.createElement('button');
  completeAreaBtn.id = 'completeAreaBtn';
  completeAreaBtn.className = 'btn ok small';
  completeAreaBtn.style.display = 'none';
  completeAreaBtn.addEventListener('click', completeCurrentArea);
  const historyBtn = document.getElementById("openAreaHistoryBtn");
  if (historyBtn){ headerFilters.insertBefore(completeAreaBtn, historyBtn); }
  else { headerFilters.appendChild(completeAreaBtn); }
}
function updateCompleteAreaBtn(){
  ensureCompleteAreaBtn();
  if (!completeAreaBtn) return;
  if (activeFilter === "All"){ completeAreaBtn.style.display = 'none'; return; }
  const area = activeFilter;
  const remaining = tasks.filter(t => t.area === area && !t.done).length;
  completeAreaBtn.style.display = (remaining > 0 && remaining <= 2) ? '' : 'none';
  if (remaining > 0) completeAreaBtn.textContent = `Complete ${area} (${remaining} left)`;
}

/* ---------- WEEKLY RESET (Thu→Thu) + MISSED LIST ---------- */
function ensureWeeklyReset(){
  const wk = weekKey();     // current week
  const nowMeta = houseMeta || {};
  if (nowMeta.currentWeekKey === wk) return;

  // Who did at least one task last week?
  const { startISO, endISO } = lastWeekRangeISO(new Date());
  const didSet = new Set(
    logs
      .filter(l => l.when >= startISO && l.when < endISO)
      .map(l => groupLabelFor(l.user))
  );
  const MISSED = MEMBERS.filter(name => !didSet.has(name));

  // Reset tasks
  tasks = tasks.map(t => ({ ...t, done:false, completedBy:"", completedAt:"" }));
  save(KEY_TASKS, tasks);

  // Save meta
  houseMeta = {
    ...nowMeta,
    currentWeekKey: wk,
    lastResetAt: new Date().toISOString(),
    missedWeekKey: wk,
    missedMembers: MISSED
  };
  save(KEY_META, houseMeta);
}

/* ---------- ACTIONS ---------- */
function toggleDone(id){
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return;

  const t = tasks[idx];
  if (t.done){
    tasks[idx] = { ...t, done:false, completedBy:"", completedAt:"" };
    save(KEY_TASKS, tasks);
    renderTasks();
    return;
  }

  const when = new Date().toISOString();
  tasks[idx] = { ...t, done:true, completedBy: me || "Someone", completedAt: when };
  save(KEY_TASKS, tasks);

  logs.push({
    user: me || "Someone",
    when, taskId: t.id, title: t.title, area: t.area, createdAt: when
  });
  save(KEY_LOGS, logs);

  const remaining = tasks.some(x => x.area === t.area && !x.done);
  if (!remaining){
    areaLogs.push({ user: me || "Someone", area: t.area, when, createdAt: when });
    save(KEY_AREALOG, areaLogs);
    showToast(`Task completed for the week (${t.area})`);
  }

  renderTasks();
}

function completeCurrentArea(){
  if (activeFilter === "All") return;
  const area = activeFilter;
  const when = new Date().toISOString();

  let changed = false;
  tasks = tasks.map(t=>{
    if (t.area === area && !t.done){
      changed = true;
      logs.push({ user: me || "Someone", when, taskId: t.id, title: t.title, area: t.area, createdAt: when });
      return { ...t, done:true, completedBy: me || "Someone", completedAt: when };
    }
    return t;
  });
  if (!changed) return;

  save(KEY_TASKS, tasks);
  save(KEY_LOGS,  logs);

  areaLogs.push({ user: me || "Someone", area, when, createdAt: when });
  save(KEY_AREALOG, areaLogs);

  showToast(`Task completed for the week (${area})`);
  renderTasks();
}

function addTask(area, title){
  const id = sid();
  const t = { id, area, title, done:false, completedBy:"", completedAt:"", isDefault:false };
  tasks.push(t);
  save(KEY_TASKS, tasks);
  renderTasks();
}

/* HARD-DELETE: actually remove the task from storage */
function removeTask(id){
  const before = tasks.length;
  tasks = tasks.filter(t => t.id !== id);
  if (tasks.length !== before){
    save(KEY_TASKS, tasks);
    showToast("Task deleted");
    renderTasks();
  }
}

/* ---------- RENDER ---------- */
function renderTasks(){
  if(!taskList) return;
  if (listTitle) listTitle.textContent = `${activeFilter} – Tasks`; // guard
  taskList.innerHTML = "";

  // Hide any legacy “[Deleted]” rows
  const filtered = tasks.filter(t =>
    (activeFilter==="All" ? true : t.area===activeFilter) &&
    t.title !== "[Deleted]"
  );

  if(filtered.length===0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" style="text-align:center;">No tasks yet.</td>`;
    taskList.appendChild(tr);
    updateTabBadges();
    updateCompleteAreaBtn();
    updateAllDoneBanner();
    return;
  }

  if (isMobile()) {
    filtered.forEach(t=>{
      const status = t.done
        ? `Completed by ${t.completedBy || "—"} · ${t.completedAt ? pretty(t.completedAt) : ""}`
        : "Not complete";
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.innerHTML = `
        <div class="task-card ${t.done ? "done": ""}">
          <div class="task-card__top">
            <span class="task-card__area">${t.area}</span>
            <div class="task-card__actions">
              <button class="btn ok small" data-action="toggle" data-id="${t.id}">
                ${t.done ? "Undo" : "Done"}
              </button>
              ${!t.isDefault ? `<button class="btn danger small" data-action="delete" data-id="${t.id}">Delete</button>` : ""}
            </div>
          </div>
          <div class="task-card__title">${t.title}</div>
          <div class="task-card__status">${status}</div>
        </div>`;
      tr.appendChild(td);
      taskList.appendChild(tr);
    });
  } else {
    filtered.forEach(t=>{
      const row = document.createElement("tr");
      if(t.done) row.classList.add("done");
      const status = t.done
        ? `Completed by ${t.completedBy || "—"} · ${t.completedAt ? pretty(t.completedAt) : ""}`
        : "Not complete";

      let actionBtns = `
        <button class="btn ok small" data-action="toggle" data-id="${t.id}">
          ${t.done ? "Undo" : "Done"}
        </button>`;
      if(!t.isDefault){
        actionBtns += ` <button class="btn danger small" data-action="delete" data-id="${t.id}">Delete</button>`;
      }

      row.innerHTML = `
        <td>${t.area}</td>
        <td class="task-title" data-id="${t.id}">${t.title}</td>
        <td>${status}</td>
        <td>${actionBtns}</td>`;
      taskList.appendChild(row);
    });
  }

  updateTabBadges();
  updateCompleteAreaBtn();
  updateAllDoneBanner();
}

/* ---------- AREA HISTORY (modal) ---------- */
const appMain            = document.getElementById("appMain");
const areaHistoryModal   = document.getElementById("areaHistoryModal");
const openAreaHistoryBtn = document.getElementById("openAreaHistoryBtn");
const closeAreaHistoryBtn= document.getElementById("closeAreaHistoryBtn");
const areaHistoryList    = document.getElementById("areaHistoryList");
const areaHistMember     = document.getElementById("areaHistMember");
const areaHistArea       = document.getElementById("areaHistArea");
const areaHistMonth      = document.getElementById("areaHistMonth");
const areaExportBtn      = document.getElementById("areaExportBtn");

function renderAreaHistory(){
  if(!areaHistoryList) return;

  let rows = areaLogs.map(r => ({ ...r, user: groupLabelFor(r.user) }));
  let member = areaHistMember?.value || "Me";
  if (member === "Me") member = me;
  const area  = areaHistArea?.value || "All";
  const month = areaHistMonth?.value || "";

  if (member !== "All") rows = rows.filter(r => r.user === member);
  if (area !== "All")   rows = rows.filter(r => r.area === area);
  if (month)            rows = rows.filter(r => monthKey(r.when) === month);

  rows.sort((a,b)=> new Date(b.when) - new Date(a.when));

  areaHistoryList.innerHTML = "";
  if (rows.length === 0){
    areaHistoryList.innerHTML = `<tr><td colspan="3" style="text-align:center;">No area completions.</td></tr>`;
    return;
  }
  rows.forEach(r=>{
    areaHistoryList.innerHTML += `
      <tr>
        <td data-label="Date/Time">${pretty(r.when)}</td>
        <td data-label="Member">${r.user}</td>
        <td data-label="Area">${r.area}</td>
      </tr>`;
  });
}

/* ---------- CSV EXPORT ---------- */
function exportAreaCsv(){
  let rows = areaLogs.map(r => ({ ...r, user: groupLabelFor(r.user) }));
  let member = areaHistMember?.value || "Me";
  if (member === "Me") member = me;
  const area  = areaHistArea?.value || "All";
  const month = areaHistMonth?.value || "";

  if (member !== "All") rows = rows.filter(r => r.user === member);
  if (area !== "All")   rows = rows.filter(r => r.area === area);
  if (month)            rows = rows.filter(r => monthKey(r.when) === month);

  rows.sort((a,b)=> new Date(b.when) - new Date(a.when));

  const header = ["Date/Time","Member","Area"];
  const lines = [header.join(",")].concat(
    rows.map(r => [
      `"${pretty(r.when).replace(/"/g,'""')}"`,
      `"${r.user.replace(/"/g,'""')}"`,
      `"${r.area.replace(/"/g,'""')}"`
    ].join(","))
  );
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const fname = `area-completions_${member}-${area}-${month || "all"}.csv`.replace(/\s+/g,'_');
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- EVENTS ---------- */
tabs.forEach(btn=>{
  btn?.addEventListener("click", ()=>{
    tabs.forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    renderTasks();
  });
});
addBtn?.addEventListener("click", ()=>{
  const title = taskInput.value.trim();
  if(!title) return;
  const area = areaSelect.value;
  addTask(area, title);
  taskInput.value = "";
});
taskInput?.addEventListener("keydown", e => { if(e.key === "Enter") addBtn.click(); });

signOutBtn?.addEventListener("click", ()=>{
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem("rch_houseCode");
  location.href = "login.html";
});

taskList?.addEventListener("click", e=>{
  const btn = e.target.closest("button"); if(!btn) return;
  const action = btn.getAttribute("data-action");
  const id = btn.getAttribute("data-id");
  if(action === "toggle") toggleDone(id);
  if(action === "delete") removeTask(id);
});

/* ---------- Accessible modal ---------- */
let lastFocus = null;
function getFocusable(container){
  return Array.from(container.querySelectorAll(
    'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
  )).filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
}
function openAreaModal() {
  if (areaHistMember) areaHistMember.value = "Me";
  if (areaHistArea)   areaHistArea.value = "All";
  if (areaHistMonth) {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    areaHistMonth.value = `${y}-${m}`;
  }
  lastFocus = document.activeElement;
  areaHistoryModal?.removeAttribute("hidden");
  appMain?.setAttribute("aria-hidden","true");
  const dialog = areaHistoryModal.querySelector('.modal');
  const f = getFocusable(dialog);
  (f[0] || dialog)?.focus();
  renderAreaHistory();
}
function closeAreaModal() {
  areaHistoryModal?.setAttribute("hidden", "");
  appMain?.removeAttribute("aria-hidden");
  lastFocus?.focus();
}
openAreaHistoryBtn?.addEventListener("click", openAreaModal);
closeAreaHistoryBtn?.addEventListener("click", closeAreaModal);
areaHistoryModal?.addEventListener("click", (e)=>{ if (e.target === areaHistoryModal) closeAreaModal(); });
document.addEventListener("keydown", (e)=>{ if (e.key === "Escape" && areaHistoryModal && !areaHistoryModal.hasAttribute("hidden")) closeAreaModal(); });
areaHistoryModal?.addEventListener("keydown", (e)=>{
  if (e.key !== "Tab") return;
  const dialog = areaHistoryModal.querySelector('.modal');
  const focusables = getFocusable(dialog);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last  = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
});
// Filters + export (modal)
areaHistMember?.addEventListener("change", renderAreaHistory);
areaHistArea?.addEventListener("change", renderAreaHistory);
areaHistMonth?.addEventListener("change", renderAreaHistory);
areaExportBtn?.addEventListener("click", exportAreaCsv);

/* ---------- INIT ---------- */
seedIfEmpty();
applyDefaultsIfVersionChanged();   // bring in your latest default tasks
ensureWeeklyReset();
renderTasks();
showMissedFromLastWeekIfAny();

// Rerun weekly rollover on focus / hourly
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    ensureWeeklyReset();
    showMissedFromLastWeekIfAny();
    renderTasks();
  }
});
setInterval(() => {
  ensureWeeklyReset();
  showMissedFromLastWeekIfAny();
  renderTasks();
}, 60 * 60 * 1000);

// Re-render on resize to switch layouts
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderTasks, 150);
});

// Maintenance & test helpers (optional)
window.wipeTasksAndReseed = () => {
  tasks = [];
  save(KEY_TASKS, tasks);
  seedIfEmpty();
  localStorage.removeItem(KEY_DEFAULTS_VER); // force re-merge on next load
  applyDefaultsIfVersionChanged();
  alert('Tasks wiped and reseeded with latest defaults.');
};

// Force weekly reset + banner (for testing without waiting for Thursday)
window.forceWeeklyReset = () => {
  const before = houseMeta.currentWeekKey;
  houseMeta.currentWeekKey = "1970-01-01"; // force mismatch
  save(KEY_META, houseMeta);
  ensureWeeklyReset();
  showMissedFromLastWeekIfAny();
  console.log("Weekly reset forced (was:", before, "now:", houseMeta.currentWeekKey, ")");
};

window.forceMissedBanner = () => {
  houseMeta.missedWeekKey = weekKey();
  houseMeta.missedMembers = MEMBERS.slice();
  save(KEY_META, houseMeta);
  showMissedFromLastWeekIfAny();
  console.log("Missed banner forced for:", houseMeta.missedMembers);
};
