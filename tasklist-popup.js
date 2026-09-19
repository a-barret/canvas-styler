/* Canvas Styler — Task List tab (popup)
 * Loaded after popup.js and shares its `settings` object and `save()`.
 * popup.js calls hydrateTaskList() at the end of hydrateUI().
 */
const TL_POPUP_DEFAULTS = {
  mode: "default",
  weekStart: 0,
  rings: true,
  cardLimit: 4,
  period: "week",
  weekMode: "rolling",
  monthMode: "rolling",
  customStart: "",
  customEnd: "",
};

function tlState() {
  settings.taskList = Object.assign({}, TL_POPUP_DEFAULTS, settings.taskList || {});
  return settings.taskList;
}

function tlRefreshEnabled() {
  const t = tlState();
  const on = t.mode === "styled";
  const box = $("tlSettings");
  box.classList.toggle("disabled", !on);
  box.querySelectorAll("input, select, button").forEach((el) => { el.disabled = !on; });

  $("tlWeekModeRow").style.display = t.period === "week" ? "flex" : "none";
  $("tlWeekStartRow").style.display = t.period === "week" && t.weekMode === "calendar" ? "flex" : "none";
  $("tlMonthModeRow").style.display = t.period === "month" ? "flex" : "none";
  $("tlCustomRows").style.display = t.period === "custom" ? "block" : "none";
}

function hydrateTaskList() {
  const t = tlState();
  document.querySelectorAll(".tl-mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === t.mode));
  document.querySelectorAll(".tl-ring-btn").forEach((b) => b.classList.toggle("active", (b.dataset.val === "on") === !!t.rings));
  $("tlCardLimit").value = t.cardLimit;
  $("tlWeekStart").value = String(t.weekStart);
  $("tlPeriod").value = t.period;
  $("tlWeekMode").value = t.weekMode;
  $("tlMonthMode").value = t.monthMode;
  $("tlCustomStart").value = t.customStart || "";
  $("tlCustomEnd").value = t.customEnd || "";
  tlRefreshEnabled();
}

document.querySelectorAll(".tl-mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    tlState().mode = btn.dataset.val;
    save();
    hydrateTaskList();
  });
});

document.querySelectorAll(".tl-ring-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    tlState().rings = btn.dataset.val === "on";
    save();
    hydrateTaskList();
  });
});

function tlBindSelect(id, key, asNumber) {
  $(id).addEventListener("change", (e) => {
    tlState()[key] = asNumber ? Number(e.target.value) : e.target.value;
    save();
    tlRefreshEnabled();
  });
}
tlBindSelect("tlWeekStart", "weekStart", true);
tlBindSelect("tlPeriod", "period", false);
tlBindSelect("tlWeekMode", "weekMode", false);
tlBindSelect("tlMonthMode", "monthMode", false);

$("tlCardLimit").addEventListener("change", (e) => {
  let n = parseInt(e.target.value, 10);
  if (!Number.isFinite(n)) n = TL_POPUP_DEFAULTS.cardLimit;
  n = Math.min(50, Math.max(1, n));
  e.target.value = n;
  tlState().cardLimit = n;
  save();
});

$("tlCustomStart").addEventListener("change", (e) => { tlState().customStart = e.target.value; save(); });
$("tlCustomEnd").addEventListener("change", (e) => { tlState().customEnd = e.target.value; save(); });
