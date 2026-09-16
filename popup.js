const STORAGE_KEY = "csxSettings";
const DEFAULTS = { enabled: true, vars: {}, customCSS: "", courseImages: {}, customLogo: "" };

let settings = structuredClone(DEFAULTS);
let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ [STORAGE_KEY]: settings });
  }, 120);
}

function $(id) { return document.getElementById(id); }

/* ---------------- Tabs ---------------- */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("tab-" + btn.dataset.tab).classList.add("active");
  });
});

/* ---------------- Load existing settings into the UI ---------------- */
function hydrateUI() {
  $("enabledToggle").checked = settings.enabled !== false;

  const v = settings.vars || {};
  if (v.pageBg) $("pageBg").value = v.pageBg;
  if (v.navBg) $("navBg").value = v.navBg;
  if (v.navIconColor) $("navIconColor").value = v.navIconColor;
  if (v.accent) $("accent").value = v.accent;
  if (v.cardBg) $("cardBg").value = v.cardBg;

  const opacityPct = v.opacity ? Math.round(parseFloat(v.opacity) * 100) : 100;
  $("opacity").value = opacityPct;
  $("opacityVal").textContent = opacityPct + "%";

  const cw = v.cardWidth ? parseInt(v.cardWidth) : 262;
  $("cardWidth").value = cw;
  $("cardWidthVal").textContent = cw + "px";

  if (v.fontFamily) {
    const select = $("fontFamily");
    const known = Array.from(select.options).some((o) => o.value === v.fontFamily);
    if (known) {
      select.value = v.fontFamily;
    } else {
      select.value = "custom";
      $("customFontRow").style.display = "flex";
      $("customFontInput").value = v.fontFamily;
    }
  }
  if (v.fontColor) $("fontColor").value = v.fontColor;

  setToggleState($("boldBtn"), v.fontWeight === "700");
  setToggleState($("italicBtn"), v.fontStyle === "italic");
  setToggleState($("underlineBtn"), v.textDecoration === "underline");

  const bw = v.borderWidth ? parseInt(v.borderWidth) : 0;
  $("borderWidth").value = bw;
  $("borderWidthVal").textContent = bw + "px";
  if (v.borderStyle) $("borderStyle").value = v.borderStyle;
  if (v.borderColor) $("borderColor").value = v.borderColor;

  const br = v.borderRadius ? parseInt(v.borderRadius) : 6;
  $("borderRadius").value = br;
  $("borderRadiusVal").textContent = br + "px";

  if (v.shadow && v.shadow !== "none") {
    $("shadowToggle").checked = true;
    const sizeMatch = v.shadow.match(/0 (\d+)px/);
    const strengthMatch = v.shadow.match(/rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/);
    if (sizeMatch) {
      $("shadowSize").value = sizeMatch[1];
      $("shadowSizeVal").textContent = sizeMatch[1] + "px";
    }
    if (strengthMatch) {
      const pct = Math.round(parseFloat(strengthMatch[1]) * 100);
      $("shadowStrength").value = pct;
      $("shadowStrengthVal").textContent = pct + "%";
    }
  }

  $("customCSS").value = settings.customCSS || "";

  const logoPreview = $("logoPreview");
  if (settings.customLogo) {
    logoPreview.style.backgroundImage = `url('${settings.customLogo}')`;
    $("logoUrlInput").value = settings.customLogo.startsWith("data:") ? "" : settings.customLogo;
  } else {
    logoPreview.style.backgroundImage = "";
    $("logoUrlInput").value = "";
  }
}

function setToggleState(btn, on) {
  btn.classList.toggle("active", on);
  btn.dataset.on = on ? "1" : "0";
}

/* ---------------- Style controls ---------------- */
$("enabledToggle").addEventListener("change", (e) => {
  settings.enabled = e.target.checked;
  save();
});

function bindColor(id, key) {
  $(id).addEventListener("input", (e) => {
    settings.vars[key] = e.target.value;
    save();
  });
}
bindColor("pageBg", "pageBg");
bindColor("navBg", "navBg");
bindColor("navIconColor", "navIconColor");
bindColor("accent", "accent");
bindColor("cardBg", "cardBg");
bindColor("fontColor", "fontColor");
bindColor("borderColor", "borderColor");

/* ---------------- Logo ---------------- */
$("logoUrlInput").addEventListener("change", (e) => {
  const val = e.target.value.trim();
  settings.customLogo = val;
  $("logoPreview").style.backgroundImage = val ? `url('${val}')` : "";
  save();
});
$("logoFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    settings.customLogo = reader.result;
    $("logoPreview").style.backgroundImage = `url('${reader.result}')`;
    $("logoUrlInput").value = "";
    save();
  };
  reader.readAsDataURL(file);
});
$("removeLogoBtn").addEventListener("click", () => {
  settings.customLogo = "";
  $("logoPreview").style.backgroundImage = "";
  $("logoUrlInput").value = "";
  $("logoFileInput").value = "";
  save();
});

$("opacity").addEventListener("input", (e) => {
  const pct = parseInt(e.target.value);
  $("opacityVal").textContent = pct + "%";
  settings.vars.opacity = (pct / 100).toFixed(2);
  save();
});

$("fontFamily").addEventListener("change", (e) => {
  if (e.target.value === "custom") {
    $("customFontRow").style.display = "flex";
    settings.vars.fontFamily = $("customFontInput").value || "";
  } else if (e.target.value === "") {
    $("customFontRow").style.display = "none";
    delete settings.vars.fontFamily;
  } else {
    $("customFontRow").style.display = "none";
    settings.vars.fontFamily = e.target.value;
  }
  save();
});
$("customFontInput").addEventListener("input", (e) => {
  settings.vars.fontFamily = e.target.value;
  save();
});

function bindToggleBtn(id, key, onValue) {
  const btn = $(id);
  btn.addEventListener("click", () => {
    const isOn = btn.dataset.on === "1";
    setToggleState(btn, !isOn);
    if (!isOn) {
      settings.vars[key] = onValue;
    } else {
      delete settings.vars[key];
    }
    save();
  });
}
bindToggleBtn("boldBtn", "fontWeight", "700");
bindToggleBtn("italicBtn", "fontStyle", "italic");
bindToggleBtn("underlineBtn", "textDecoration", "underline");

$("cardWidth").addEventListener("input", (e) => {
  const px = e.target.value;
  $("cardWidthVal").textContent = px + "px";
  settings.vars.cardWidth = px + "px";
  save();
});

$("borderWidth").addEventListener("input", (e) => {
  const px = e.target.value;
  $("borderWidthVal").textContent = px + "px";
  settings.vars.borderWidth = px + "px";
  save();
});
$("borderStyle").addEventListener("change", (e) => {
  settings.vars.borderStyle = e.target.value;
  save();
});
$("borderRadius").addEventListener("input", (e) => {
  const px = e.target.value;
  $("borderRadiusVal").textContent = px + "px";
  settings.vars.borderRadius = px + "px";
  save();
});

function updateShadow() {
  if ($("shadowToggle").checked) {
    const size = parseInt($("shadowSize").value);
    const strength = parseInt($("shadowStrength").value) / 100;
    settings.vars.shadow = `0 ${size}px ${Math.round(size * 1.5)}px rgba(0,0,0,${strength.toFixed(2)})`;
  } else {
    settings.vars.shadow = "none";
  }
  save();
}
$("shadowToggle").addEventListener("change", updateShadow);
$("shadowSize").addEventListener("input", (e) => {
  $("shadowSizeVal").textContent = e.target.value + "px";
  updateShadow();
});
$("shadowStrength").addEventListener("input", (e) => {
  $("shadowStrengthVal").textContent = e.target.value + "%";
  updateShadow();
});

$("resetBtn").addEventListener("click", () => {
  if (!confirm("Reset all style controls back to Canvas defaults? Your custom CSS, logo, and course card images will be kept.")) return;
  settings.vars = {};
  save();
  hydrateUI();
});

/* ---------------- Custom CSS ---------------- */
$("saveCSS").addEventListener("click", () => {
  settings.customCSS = $("customCSS").value;
  save();
  const btn = $("saveCSS");
  const original = btn.textContent;
  btn.textContent = "Saved!";
  setTimeout(() => (btn.textContent = original), 1000);
});

/* ---------------- Course cards ---------------- */
function renderCourses(courses) {
  const list = $("coursesList");
  list.innerHTML = "";
  if (!courses.length) {
    list.innerHTML = `<div class="empty">No course cards found. Open your Canvas dashboard and try again.</div>`;
    return;
  }
  courses.forEach((course) => {
    const existing = settings.courseImages[course.id];
    const row = document.createElement("div");
    row.className = "course-card";
    row.innerHTML = `
      <div class="thumb" style="${existing ? `background-image:url('${existing}')` : ""}"></div>
      <div class="info">
        <div class="name">${escapeHTML(course.name)}</div>
        <input type="text" placeholder="Paste image URL…" class="url-input" />
        <div class="actions">
          <label class="upload">Upload
            <input type="file" accept="image/*" class="file-input" />
          </label>
          <button class="remove">Remove</button>
        </div>
      </div>
    `;
    const thumb = row.querySelector(".thumb");
    const urlInput = row.querySelector(".url-input");
    const fileInput = row.querySelector(".file-input");
    const removeBtn = row.querySelector(".remove");

    urlInput.addEventListener("change", () => {
      const val = urlInput.value.trim();
      if (val) {
        settings.courseImages[course.id] = val;
        thumb.style.backgroundImage = `url('${val}')`;
      } else {
        delete settings.courseImages[course.id];
        thumb.style.backgroundImage = "";
      }
      save();
    });

    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        settings.courseImages[course.id] = reader.result;
        thumb.style.backgroundImage = `url('${reader.result}')`;
        urlInput.value = "";
        save();
      };
      reader.readAsDataURL(file);
    });

    removeBtn.addEventListener("click", () => {
      delete settings.courseImages[course.id];
      thumb.style.backgroundImage = "";
      urlInput.value = "";
      save();
    });

    list.appendChild(row);
  });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

$("refreshCourses").addEventListener("click", () => {
  const list = $("coursesList");
  list.innerHTML = `<div class="empty">Looking for course cards…</div>`;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes("byui.instructure.com")) {
      list.innerHTML = `<div class="empty">Open your byui.instructure.com dashboard in this tab, then refresh.</div>`;
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "csx-get-courses" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        list.innerHTML = `<div class="empty">Couldn't read the page — try reloading the Canvas tab, then refresh again.</div>`;
        return;
      }
      renderCourses(response.courses || []);
    });
  });
});

/* ---------------- Init ---------------- */
chrome.storage.local.get([STORAGE_KEY], (result) => {
  settings = Object.assign(structuredClone(DEFAULTS), result[STORAGE_KEY] || {});
  settings.vars = settings.vars || {};
  settings.courseImages = settings.courseImages || {};
  settings.customLogo = settings.customLogo || "";
  hydrateUI();
});
