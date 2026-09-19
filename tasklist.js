/* Canvas Styler — styled task list (content script)
 * Runs alongside content.js on the connected Canvas site.
 *
 * Modes (settings.taskList.mode):
 *   "off"      -> Canvas's built-in to-do list is hidden, nothing is shown.
 *   "default"  -> Canvas's built-in to-do list is left alone.
 *   "styled"   -> Canvas's built-in list is hidden and this interface is
 *                 inserted on the dashboard, above the course cards.
 *
 * Data comes from Canvas's own planner API (same origin, your login):
 *   GET  /api/v1/planner/items
 *   POST/PUT /api/v1/planner/overrides   (marks items complete / incomplete)
 *   GET  /api/v1/users/self/colors       (course colors from the course cards)
 */
(function () {
  if (window.__csxTaskListLoaded) return;
  window.__csxTaskListLoaded = true;

  const STORAGE_KEY = "csxSettings";
  const ROOT_ID = "csx-tasklist";
  const STYLE_ID = "csx-tl-style";
  const HIDE_ID = "csx-tl-hide";

  const ALL_TYPES = ["assignment", "quiz", "discussion_topic", "wiki_page", "planner_note", "announcement"];

  const TL_DEFAULTS = {
    mode: "default",
    types: ALL_TYPES,
    weekStart: 0,
    rings: true,
    cardLimit: 4,
    width: 440,
    period: "week",
    weekMode: "rolling",
    monthMode: "rolling",
    customStart: "",
    customEnd: "",
  };

  const NATIVE_TODO_SELECTOR = [
    "#dashboard-planner",
    ".StudentPlanner__Container",
    ".Sidebar__TodoListContainer",
    "#right-side .todo-list-header",
    "#right-side .to-do-list",
    "#right-side #planner-todosidebar",
    "#right-side .planner-todo-list",
    "#right-side [class*='todo' i]",
    "#right-side [id*='todo' i]",
    "#right-side [class*='TodoList' i]",
    "#right-side [data-testid*='todo' i]",
    "#right-side .coming_up",
    "#right-side [class*='coming_up' i]",
    "#right-side [class*='ComingUp' i]",
    "#right-side [id*='coming_up' i]",
    "[data-csx-hidden='1']",
  ].join(",\n");

  const PALETTE = ["#2a9d8f", "#e76f51", "#264653", "#e9c46a", "#7b5ea7", "#3a7ca5", "#c1666b", "#6a8a51"];
  const TYPE_LABELS = {
    assignment: "Assignment",
    quiz: "Quiz",
    discussion_topic: "Discussion",
    wiki_page: "Page",
    planner_note: "Note",
    announcement: "Announcement",
    sub_assignment: "Assignment",
    assessment_request: "Peer review",
  };

  // Planner types that aren't in the filter list are grouped with assignments.
  function typeGroup(type) {
    return ALL_TYPES.includes(type) ? type : "assignment";
  }
  function visibleItems() {
    const t = cfg();
    const allowed = Array.isArray(t.types) ? t.types : ALL_TYPES;
    return state.items.filter((i) => allowed.includes(typeGroup(i.type)));
  }

  // Task cards follow the Style tab's "Card background" color. Text color
  // flips to light when that background is dark so cards stay readable.
  function applyCardColors() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const bg = isEnabled() && settings.vars && settings.vars.cardBg;
    if (!bg) {
      ["--csx-card-bg", "--csx-card-fg", "--csx-card-meta"].forEach((p) => root.style.removeProperty(p));
      return;
    }
    root.style.setProperty("--csx-card-bg", bg);
    const m = /^#?([0-9a-f]{6})$/i.exec(bg);
    if (m) {
      const n = parseInt(m[1], 16);
      const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
      const dark = lum < 0.5;
      root.style.setProperty("--csx-card-fg", dark ? "#f4f6f8" : "#2d3b45");
      root.style.setProperty("--csx-card-meta", dark ? "#c3cad1" : "#5b6770");
    }
  }

  let settings = null;
  let prevTLJson = "";
  let mounted = false;
  const state = {
    offset: 0,
    tab: "incomplete",
    expanded: false,
    loadedOnce: false,
    items: [],
    loading: false,
    error: "",
    colors: null,
    seq: 0,
  };

  /* ---------------- helpers ---------------- */
  function cfg() {
    return Object.assign({}, TL_DEFAULTS, (settings && settings.taskList) || {});
  }
  function isEnabled() {
    return settings && settings.enabled !== false;
  }
  function mode() {
    return isEnabled() ? cfg().mode : "default";
  }
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function endOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function parseYMD(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 864e5); }
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML.replace(/"/g, "&quot;");
  }
  function fmtShort(d) { return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }

  /* ---------------- time period ---------------- */
  // Returns { all:true } | { invalid:true } | { start, end } (local dates).
  function getRange(t, offset) {
    const today = startOfDay(new Date());
    switch (t.period) {
      case "all":
        return { all: true };
      case "today": {
        const d = addDays(today, offset);
        return { start: d, end: d };
      }
      case "week": {
        let base = today;
        if (t.weekMode === "calendar") {
          const diff = (today.getDay() - Number(t.weekStart) + 7) % 7;
          base = addDays(today, -diff);
        }
        const start = addDays(base, offset * 7);
        return { start, end: addDays(start, 6) };
      }
      case "month": {
        if (t.monthMode === "calendar") {
          const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
          const end = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
          return { start, end };
        }
        const start = addDays(today, offset * 30);
        return { start, end: addDays(start, 29) };
      }
      case "custom": {
        let s = parseYMD(t.customStart);
        let e = parseYMD(t.customEnd);
        if (!s || !e) return { invalid: true };
        if (e < s) [s, e] = [e, s];
        const len = daysBetween(s, e) + 1;
        const start = addDays(s, offset * len);
        return { start, end: addDays(start, len - 1) };
      }
      default:
        return { all: true };
    }
  }

  function rangeLabel(r) {
    if (r.all) return "All tasks";
    if (r.invalid) return "Pick dates in settings";
    if (ymd(r.start) === ymd(r.end)) return fmtShort(r.start);
    return `${fmtShort(r.start)} to ${fmtShort(r.end)}`;
  }

  /* ---------------- Canvas API ---------------- */
  function csrf() {
    const m = document.cookie.match(/(?:^|;\s*)_csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  async function api(path, opts) {
    const o = opts || {};
    const headers = { Accept: "application/json+canvas-string-ids, application/json" };
    if (o.method && o.method !== "GET") {
      headers["Content-Type"] = "application/json";
      headers["X-CSRF-Token"] = csrf();
    }
    const res = await fetch(path, {
      method: o.method || "GET",
      credentials: "same-origin",
      headers,
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
    if (!res.ok) throw new Error(`Canvas returned ${res.status}`);
    return res;
  }

  async function fetchAllPages(url) {
    let out = [];
    let next = url;
    for (let i = 0; i < 10 && next; i++) {
      const res = await api(next);
      const data = await res.json();
      if (Array.isArray(data)) out = out.concat(data);
      const link = res.headers.get("Link") || "";
      const m = link.match(/<([^>]+)>;\s*rel="next"/);
      next = m ? m[1] : null;
    }
    return out;
  }

  async function loadColors() {
    if (state.colors) return state.colors;
    try {
      const res = await api("/api/v1/users/self/colors");
      const data = await res.json();
      state.colors = (data && data.custom_colors) || {};
    } catch (e) {
      state.colors = {};
    }
    return state.colors;
  }

  function colorFor(courseId) {
    const c = state.colors && state.colors["course_" + courseId];
    if (c) return c;
    let h = 0;
    const s = String(courseId);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  function normalize(raw) {
    if (!raw || raw.plannable_type === "calendar_event") return null;
    const courseId = raw.course_id || (raw.plannable && raw.plannable.course_id);
    if (!courseId) return null;
    const p = raw.plannable || {};
    const ov = raw.planner_override;
    const sub = raw.submissions && typeof raw.submissions === "object" ? raw.submissions : null;
    let completed;
    if (ov && typeof ov.marked_complete === "boolean") completed = ov.marked_complete;
    else completed = !!(sub && (sub.submitted || sub.graded || sub.excused));
    let url = raw.html_url || "";
    if (url.startsWith("/")) url = location.origin + url;
    return {
      key: raw.plannable_type + ":" + raw.plannable_id,
      type: raw.plannable_type,
      id: raw.plannable_id,
      courseId: String(courseId),
      courseName: raw.context_name || "Course",
      title: p.title || p.name || "Untitled",
      due: raw.plannable_date || p.due_at || p.todo_date || null,
      points: p.points_possible,
      url,
      completed,
      overrideId: ov && ov.id ? ov.id : null,
    };
  }

  async function load() {
    const t = cfg();
    const range = getRange(t, state.offset);
    const my = ++state.seq;
    state.error = "";
    if (range.invalid) {
      state.items = [];
      state.loading = false;
      render();
      return;
    }
    state.loading = true;
    render();
    try {
      await loadColors();
      let start, end;
      if (range.all) {
        const today = startOfDay(new Date());
        start = addDays(today, -365);
        end = endOfDay(addDays(today, 365));
      } else {
        start = startOfDay(range.start);
        end = endOfDay(range.end);
      }
      const qs = new URLSearchParams({
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        per_page: "100",
      });
      const raw = await fetchAllPages("/api/v1/planner/items?" + qs.toString());
      if (my !== state.seq) return;
      state.items = raw.map(normalize).filter(Boolean).sort((a, b) => {
        return (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity);
      });
    } catch (e) {
      if (my !== state.seq) return;
      state.items = [];
      state.error = "Couldn't load tasks from Canvas. " + e.message;
    }
    state.loading = false;
    render();
  }

  async function setComplete(key, complete) {
    const item = state.items.find((i) => i.key === key);
    if (!item) return;
    const before = item.completed;
    item.completed = complete;
    state.error = "";
    render();
    try {
      let res;
      if (item.overrideId) {
        res = await api(`/api/v1/planner/overrides/${item.overrideId}`, {
          method: "PUT",
          body: { marked_complete: complete },
        });
      } else {
        res = await api("/api/v1/planner/overrides", {
          method: "POST",
          body: { plannable_type: item.type, plannable_id: item.id, marked_complete: complete },
        });
      }
      const ov = await res.json();
      if (ov && ov.id) item.overrideId = ov.id;
    } catch (e) {
      item.completed = before;
      state.error = "Couldn't update that task in Canvas. " + e.message;
      render();
    }
  }

  /* ---------------- rendering ---------------- */
  function ringHTML(c, done, total, color) {
    const R = 24, C = 2 * Math.PI * R;
    const pct = total ? done / total : 0;
    return `<div class="csx-tl-ring" title="${esc(c)}">
      <svg viewBox="0 0 60 60" width="64" height="64" aria-hidden="true">
        <circle cx="30" cy="30" r="${R}" fill="none" stroke="#e3e6ea" stroke-width="6"/>
        <circle cx="30" cy="30" r="${R}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
          stroke-dasharray="${(C * pct).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 30 30)"/>
        <text x="30" y="34" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">${Math.round(pct * 100)}%</text>
      </svg>
      <div class="csx-tl-ring-count">${done}/${total}</div>
      <div class="csx-tl-ring-name">${esc(c)}</div>
    </div>`;
  }

  function fmtDue(iso) {
    if (!iso) return "No due date";
    const d = new Date(iso);
    return "Due " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " +
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function cardHTML(i) {
    const pts = i.points != null ? `${i.points} pts` : "No points";
    const btn = i.completed
      ? `<button class="csx-tl-act csx-tl-reset" data-act="reset" data-key="${esc(i.key)}" aria-label="Mark ${esc(i.title)} as incomplete" title="Mark incomplete">&#8634;</button>`
      : `<button class="csx-tl-act csx-tl-check" data-act="complete" data-key="${esc(i.key)}" aria-label="Mark ${esc(i.title)} as complete" title="Mark complete"></button>`;
    const title = i.url
      ? `<a class="csx-tl-title" href="${esc(i.url)}">${esc(i.title)}</a>`
      : `<span class="csx-tl-title">${esc(i.title)}</span>`;
    return `<div class="csx-tl-card" style="--csx-c:${esc(colorFor(i.courseId))}">
      <div class="csx-tl-body">
        ${title}
        <div class="csx-tl-meta">${esc(fmtDue(i.due))} | ${esc(pts)}</div>
        <div class="csx-tl-meta">${esc(i.courseName)} | ${esc(TYPE_LABELS[i.type] || "Task")}</div>
      </div>
      ${btn}
    </div>`;
  }

  function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const t = cfg();
    const range = getRange(t, state.offset);
    const noNav = !!range.all || !!range.invalid;
    const visible = visibleItems();
    const incomplete = visible.filter((i) => !i.completed);
    const complete = visible.filter((i) => i.completed);
    const shown = state.tab === "complete" ? complete : incomplete;

    let rings = "";
    if (t.rings) {
      const byCourse = new Map();
      visible.forEach((i) => {
        if (!byCourse.has(i.courseId)) byCourse.set(i.courseId, { name: i.courseName, done: 0, total: 0 });
        const c = byCourse.get(i.courseId);
        c.total++;
        if (i.completed) c.done++;
      });
      rings = Array.from(byCourse.entries())
        .map(([id, c]) => ringHTML(c.name, c.done, c.total, colorFor(id)))
        .join("");
      if (rings) rings = `<div class="csx-tl-rings">${rings}</div>`;
    }

    let list;
    if (state.loading) list = `<div class="csx-tl-empty">Loading tasks…</div>`;
    else if (range.invalid) list = `<div class="csx-tl-empty">Choose a start and end date in the Task List settings.</div>`;
    else if (!shown.length)
      list = `<div class="csx-tl-empty">${state.tab === "complete" ? "Nothing completed in this period yet." : "No tasks to complete in this period."}</div>`;
    else {
      const limit = Math.max(1, parseInt(t.cardLimit, 10) || 4);
      const visible = state.expanded ? shown : shown.slice(0, limit);
      list = visible.map(cardHTML).join("");
      if (shown.length > limit) {
        list += state.expanded
          ? `<button class="csx-tl-more" data-act="less">Show less</button>`
          : `<button class="csx-tl-more" data-act="more">Show ${shown.length - limit} more</button>`;
      }
    }

    root.innerHTML = `
      <div class="csx-tl-grip csx-tl-grip-l" data-grip="l" role="separator" aria-orientation="vertical" aria-label="Resize task list (drag, or use arrow keys; double-click to reset)" tabindex="0"></div>
      <div class="csx-tl-grip csx-tl-grip-r" data-grip="r" role="separator" aria-orientation="vertical" aria-label="Resize task list (drag, or use arrow keys; double-click to reset)" tabindex="0"></div>
      <div class="csx-tl-head">
        <button class="csx-tl-nav" data-act="prev" aria-label="Previous period" ${noNav ? "disabled" : ""}>&#8249;</button>
        <div class="csx-tl-range" aria-live="polite">${esc(rangeLabel(range))}</div>
        <button class="csx-tl-nav" data-act="next" aria-label="Next period" ${noNav ? "disabled" : ""}>&#8250;</button>
      </div>
      ${rings}
      <div class="csx-tl-tabs" role="tablist">
        <button role="tab" class="csx-tl-tab ${state.tab === "incomplete" ? "on" : ""}" data-act="tab-incomplete" aria-selected="${state.tab === "incomplete"}">Incomplete (${incomplete.length})</button>
        <button role="tab" class="csx-tl-tab ${state.tab === "complete" ? "on" : ""}" data-act="tab-complete" aria-selected="${state.tab === "complete"}">Completed (${complete.length})</button>
      </div>
      ${state.error ? `<div class="csx-tl-error" role="alert">${esc(state.error)}</div>` : ""}
      <div class="csx-tl-list">${list}</div>`;
  }

  function onClick(e) {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const act = el.getAttribute("data-act");
    if (act === "prev") { state.offset--; state.expanded = false; load(); }
    else if (act === "next") { state.offset++; state.expanded = false; load(); }
    else if (act === "tab-incomplete") { state.tab = "incomplete"; state.expanded = false; render(); }
    else if (act === "tab-complete") { state.tab = "complete"; state.expanded = false; render(); }
    else if (act === "more") { state.expanded = true; render(); }
    else if (act === "less") { state.expanded = false; render(); }
    else if (act === "complete") setComplete(el.getAttribute("data-key"), true);
    else if (act === "reset") setComplete(el.getAttribute("data-key"), false);
  }

  /* ---------------- resizing ---------------- */
  const MIN_W = 300;
  const DEFAULT_W = 440;
  let dragging = false;

  function clampWidth(w) {
    const max = Math.max(MIN_W, Math.min(900, window.innerWidth - 420));
    return Math.round(Math.min(max, Math.max(MIN_W, w)));
  }
  function setWidthVar(w) {
    document.documentElement.style.setProperty("--csx-tl-w", w + "px");
  }
  function applyWidth() {
    const w = Number(cfg().width);
    setWidthVar(clampWidth(Number.isFinite(w) && w > 0 ? w : DEFAULT_W));
  }
  function saveWidth(w) {
    chrome.storage.local.get([STORAGE_KEY], (r) => {
      const s = r[STORAGE_KEY] || {};
      s.taskList = Object.assign({}, s.taskList || {}, { width: w });
      chrome.storage.local.set({ [STORAGE_KEY]: s });
    });
  }
  function currentWidth() {
    const wrap = document.getElementById("right-side-wrapper");
    return wrap ? wrap.getBoundingClientRect().width : DEFAULT_W;
  }

  function onGripDown(e) {
    const grip = e.target.closest(".csx-tl-grip");
    if (!grip || e.button > 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = currentWidth();
    const dir = grip.getAttribute("data-grip") === "l" ? -1 : 1; // left edge: drag left = wider
    let w = startW;
    dragging = true;
    document.documentElement.classList.add("csx-tl-resizing");
    const move = (ev) => {
      w = clampWidth(startW + dir * (ev.clientX - startX));
      setWidthVar(w);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      document.documentElement.classList.remove("csx-tl-resizing");
      dragging = false;
      saveWidth(w);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  }

  function onGripKey(e) {
    const grip = e.target.closest && e.target.closest(".csx-tl-grip");
    if (!grip || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const leftEdge = grip.getAttribute("data-grip") === "l";
    const grow = leftEdge ? e.key === "ArrowLeft" : e.key === "ArrowRight";
    const w = clampWidth(currentWidth() + (grow ? 20 : -20));
    setWidthVar(w);
    saveWidth(w);
  }

  function onGripDouble(e) {
    if (!e.target.closest(".csx-tl-grip")) return;
    setWidthVar(clampWidth(DEFAULT_W));
    saveWidth(DEFAULT_W);
  }

  /* ---------------- mounting / styles ---------------- */
  function ensureStyle() {
    if (document.getElementById(STYLE_ID) || !document.head) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
#${ROOT_ID}{position:relative;box-sizing:border-box;width:100%;max-width:100%;margin:0 0 16px;padding:14px;background:none;border-left:1px solid #d9dde2;color:#2d3b45}
#${ROOT_ID} *{box-sizing:border-box}
#${ROOT_ID} button{font-family:inherit;cursor:pointer}
.csx-tl-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
.csx-tl-range{font-size:16px;font-weight:700;flex:1;min-width:0;text-align:center}
.csx-tl-nav{width:32px;height:32px;border:1px solid #c7cdd1;border-radius:50%;background:#fff;font-size:20px;line-height:1;color:inherit}
.csx-tl-nav:hover:not(:disabled){background:#f1f3f5}
.csx-tl-nav:disabled{opacity:.35;cursor:default}
.csx-tl-rings{display:flex;gap:14px;overflow-x:auto;padding:4px 2px 12px}
.csx-tl-rings>:first-child{margin-left:auto}
.csx-tl-rings>:last-child{margin-right:auto}
.csx-tl-ring{flex:0 0 auto;width:84px;text-align:center}
.csx-tl-ring svg{display:block;margin:0 auto}
.csx-tl-ring-count{font-size:12px;font-weight:600;margin-top:2px}
.csx-tl-ring-name{font-size:11px;color:#5b6770;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.csx-tl-tabs{display:flex;border-bottom:2px solid #e3e6ea;margin-bottom:12px}
.csx-tl-tab{flex:1;padding:9px 6px;border:none;background:none;font-size:14px;color:#5b6770;border-bottom:3px solid transparent;margin-bottom:-2px}
.csx-tl-tab.on{color:#2d3b45;font-weight:700;border-bottom-color:#2d3b45}
.csx-tl-list{display:flex;flex-direction:column;gap:8px}
.csx-tl-card{display:flex;align-items:center;gap:12px;padding:10px 12px 10px 14px;background:var(--csx-card-bg,#fff);border:1px solid #e3e6ea;border-left:6px solid var(--csx-c,#888);border-radius:6px}
.csx-tl-body{flex:1;min-width:0}
.csx-tl-title{display:block;font-weight:700;font-size:15px;color:var(--csx-card-fg,#2d3b45);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
a.csx-tl-title:hover{text-decoration:underline}
.csx-tl-meta{font-size:12px;color:var(--csx-card-meta,#5b6770);margin-top:2px}
.csx-tl-act{flex:0 0 auto;width:28px;height:28px;border-radius:6px;border:2px solid var(--csx-c,#888);background:var(--csx-card-bg,#fff);color:var(--csx-c,#888);font-size:17px;line-height:1;padding:0}
.csx-tl-check:hover{background:var(--csx-c,#888)}
.csx-tl-check:hover::after{content:"\\2713";color:#fff;font-size:16px}
.csx-tl-reset:hover{background:var(--csx-c,#888);color:#fff}
.csx-tl-more{align-self:center;margin-top:4px;padding:7px 18px;border:1px solid #c7cdd1;border-radius:20px;background:#fff;font-size:13px;color:#2d3b45}
.csx-tl-more:hover{background:#f1f3f5}
.csx-tl-empty{padding:22px 0;text-align:center;color:#6b7785}
.csx-tl-error{margin-bottom:10px;padding:8px 10px;border-radius:6px;background:#fff0f0;color:#a4141d;font-size:13px}
@media (prefers-reduced-motion:no-preference){.csx-tl-act,.csx-tl-nav{transition:background .12s}}
@media (min-width:1000px){
html.csx-tl-wide #right-side-wrapper{width:var(--csx-tl-w,440px) !important;min-width:var(--csx-tl-w,440px) !important;max-width:none !important;flex:0 0 var(--csx-tl-w,440px) !important}
html.csx-tl-wide #right-side{width:100% !important;max-width:none !important}
html.csx-tl-wide .csx-tl-grip{display:block}
}
.csx-tl-grip{display:none;position:absolute;top:0;bottom:0;width:8px;cursor:ew-resize;z-index:2;touch-action:none;border-radius:8px}
.csx-tl-grip-l{left:0}
.csx-tl-grip-r{right:0}
.csx-tl-grip:hover,.csx-tl-grip:focus-visible{background:rgba(0,118,182,.28);outline:none}
html.csx-tl-resizing,html.csx-tl-resizing *{cursor:ew-resize !important;user-select:none !important}
`;
    document.head.appendChild(s);
  }

  // Canvas's sidebar markup varies (and uses generated class names), so besides
  // the selectors above, find the block by its "To Do" heading and hide the
  // widest ancestor that doesn't also contain the other sidebar sections.
  function clearNativeMarks() {
    document.querySelectorAll("[data-csx-hidden]").forEach((el) => el.removeAttribute("data-csx-hidden"));
  }

  const SIDEBAR_SECTIONS = [/^to[\s-]?do\b/i, /^coming up\b/i, /^recent feedback\b/i, /^recent grades\b/i];
  const HIDDEN_SECTIONS = [SIDEBAR_SECTIONS[0], SIDEBAR_SECTIONS[1]]; // To Do + Coming Up
  const HEADING_SEL = "h1,h2,h3,h4,h5,h6,[role='heading']";

  function containsOtherSection(el, mine) {
    if (/start a new course|view grades?/i.test(el.textContent)) return true;
    return Array.from(el.querySelectorAll(HEADING_SEL)).some((h) => {
      const t = h.textContent.trim();
      return t.length <= 30 && SIDEBAR_SECTIONS.some((r) => r !== mine && r.test(t));
    });
  }

  function markNativeByHeading() {
    const side = document.getElementById("right-side");
    if (!side) return;
    side.querySelectorAll(HEADING_SEL).forEach((h) => {
      if (h.closest("#" + ROOT_ID)) return;
      const txt = h.textContent.trim();
      if (txt.length > 30) return;
      const mine = HIDDEN_SECTIONS.find((r) => r.test(txt));
      if (!mine) return;
      let el = h;
      while (el.parentElement && el.parentElement !== side && !containsOtherSection(el.parentElement, mine)) {
        el = el.parentElement;
      }
      if (el.id !== ROOT_ID) el.setAttribute("data-csx-hidden", "1");
    });
  }

  function setNativeHidden(hide) {
    let tag = document.getElementById(HIDE_ID);
    if (!hide) {
      if (tag) tag.remove();
      clearNativeMarks();
      return;
    }
    if (!document.head) return;
    if (!tag) {
      tag = document.createElement("style");
      tag.id = HIDE_ID;
      document.head.appendChild(tag);
    }
    tag.textContent = `${NATIVE_TODO_SELECTOR} {\n  display: none !important;\n}\n`;
    markNativeByHeading();
  }

  function unmount() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    mounted = false;
    state.loadedOnce = false;
    document.documentElement.classList.remove("csx-tl-wide");
    document.documentElement.style.removeProperty("--csx-tl-w");
  }

  function ensureMounted() {
    if (mode() !== "styled") return;
    if (document.getElementById(ROOT_ID)) return;
    const side = document.getElementById("right-side");
    const cards = document.getElementById("DashboardCard_Container");
    // Only on the dashboard: it has the card container and/or the sidebar.
    if (!cards && !document.getElementById("dashboard")) return;
    if (!side && !(cards && cards.parentNode)) return;
    ensureStyle();
    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.setAttribute("aria-label", "Task list");
    root.addEventListener("click", onClick);
    root.addEventListener("pointerdown", onGripDown);
    root.addEventListener("keydown", onGripKey);
    root.addEventListener("dblclick", onGripDouble);
    applyWidth();
    if (side) {
      side.insertBefore(root, side.firstChild); // where Canvas's To Do list lives
      document.documentElement.classList.add("csx-tl-wide");
    } else cards.parentNode.insertBefore(root, cards);
    mounted = true;
    applyCardColors();
    render();
    if (state.loadedOnce) return; // re-mounted after Canvas rebuilt the sidebar; keep data
    state.loadedOnce = true;
    load();
  }

  function apply() {
    const m = mode();
    setNativeHidden(m === "off" || m === "styled");
    if (m !== "styled") { unmount(); return; }
    ensureMounted();
  }

  function onSettings(next) {
    settings = next || {};
    // cardLimit, width and types only affect rendering, so they're left out of the reload check.
    const tlJson = JSON.stringify(Object.assign({}, cfg(), { cardLimit: 0, width: 0, types: 0 }));
    const changed = tlJson !== prevTLJson;
    if (changed) {
      const prev = prevTLJson ? JSON.parse(prevTLJson) : null;
      const cur = cfg();
      if (!prev || prev.period !== cur.period || prev.customStart !== cur.customStart ||
          prev.customEnd !== cur.customEnd || prev.weekMode !== cur.weekMode ||
          prev.monthMode !== cur.monthMode || prev.weekStart !== cur.weekStart) {
        state.offset = 0;
      }
    }
    prevTLJson = tlJson;
    const wasMounted = !!document.getElementById(ROOT_ID);
    apply();
    if (wasMounted && !dragging && mode() === "styled") applyWidth();
    if (wasMounted) applyCardColors();
    if (changed && wasMounted && mode() === "styled") load();
    else if (wasMounted) render();
  }

  chrome.storage.local.get([STORAGE_KEY], (r) => onSettings(r[STORAGE_KEY] || {}));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) onSettings(changes[STORAGE_KEY].newValue || {});
  });

  // Canvas builds the dashboard after load; keep trying to mount, and re-mount if removed.
  let debounce = null;
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (!settings) return;
      const m = mode();
      if (m === "off" || m === "styled") markNativeByHeading();
      ensureMounted();
    }, 50);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
