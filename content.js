/* Canvas Styler — content script
 * Runs on byui.instructure.com. Reads settings from chrome.storage.local
 * and injects style tags:
 *   1. Generated CSS built from the user's chosen values — only properties
 *      the user has actually touched are emitted, so nothing is ever forced
 *      to a "default"/initial value. Disabling the toggle or hitting Reset
 *      simply emits nothing, which fully restores Canvas's own styling.
 *   2. The user's raw custom CSS textarea.
 *   3. A generated rule for the custom top-left logo image (if set).
 * Plus per-course dashboard card background images.
 *
 * IMPORTANT SCOPE RULE: "site-wide" rules (colors, fonts) are allowed to
 * touch any element on any byui.instructure.com page. "Card" rules
 * (background/opacity/border/radius/shadow/width) are only ever allowed to
 * target the dashboard course card markup — never the Dashboard header bar,
 * sidebar, or anything else. Border/radius/shadow specifically are only
 * ever applied to the single outer card element — never to the header
 * content or action-container elements nested inside it — so the shadow
 * and border never "double up" on sub-sections of a card.
 */

(function () {
  const STORAGE_KEY = "csxSettings"; // { enabled, vars: {...}, customCSS: "...", courseImages: {...}, customLogo: "data:...or https://..." }
  const GENERATED_STYLE_ID = "csx-generated-style";
  const CUSTOM_STYLE_ID = "csx-custom-style";
  const LOGO_STYLE_ID = "csx-logo-style";

  const PAGE_BG_SELECTOR = [
    "html body",
    "#application",
    "#main",
    "#not_right_side",
    "#content",
    "#wrapper",
    "#dashboard_header_container",
    "#dashboard_header_container *:not([class*=\"icon\"]):not(svg):not(svg *)",
    ".ic-Dashboard-header",
    ".ic-Dashboard-header *:not([class*=\"icon\"]):not(svg):not(svg *)",
  ].join(",\n");

  const NAV_BG_SELECTOR = [
    "#header",
    ".ic-app-header",
    ".ic-app-header__main-navigation",
    ".ic-app-header__secondary-navigation",
    "#global_nav_tray_container",
  ].join(",\n");

  const NAV_ICON_SELECTOR = [
    "#header .ic-icon-svg",
    "#header .ic-icon-svg *",
    ".ic-app-header__menu-list-link",
    ".ic-app-header__menu-list-link .ic-icon-svg",
    ".ic-app-header__menu-list-link .ic-icon-svg *",
    "#global_nav_tray_container .ic-icon-svg",
  ].join(",\n");

  const LOGO_SELECTOR = [
    "#header-logo .ic-app-header__logomark",
    ".ic-app-header__logomark",
    "#header-logo",
  ].join(",\n");

  const TYPOGRAPHY_SELECTOR =
    'html body *:not([class*="icon-"]):not(.ic-icon-svg), html body';

  const FONT_COLOR_SELECTOR =
    'html body *:not([class*="icon-"]):not(.ic-icon-svg):not(a):not(a *)';

  const CARD_BG_SELECTOR = [
    ".ic-DashboardCard",
    ".ic-DashboardCard__header_content",
    ".ic-DashboardCard__action-container",
  ].join(",\n");

  const CARD_OUTER_SELECTOR = ".ic-DashboardCard";
  const CARD_BOX_SELECTOR = ".ic-DashboardCard";

  function withHead(cb) {
    if (document.head) {
      cb();
      return;
    }
    const obs = new MutationObserver(() => {
      if (document.head) {
        obs.disconnect();
        cb();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function getOrCreateStyleTag(id) {
    let tag = document.getElementById(id);
    if (!tag) {
      tag = document.createElement("style");
      tag.id = id;
      document.head.appendChild(tag);
    }
    return tag;
  }

  function buildCSS(vars) {
    if (!vars) return "";
    const v = vars;
    let css = "";

    if (v.pageBg) {
      css += `${PAGE_BG_SELECTOR} {\n  background-color: ${v.pageBg} !important;\n}\n`;
    }

    if (v.navBg) {
      css += `${NAV_BG_SELECTOR} {\n  background-color: ${v.navBg} !important;\n}\n`;
    }

    if (v.navIconColor) {
      css += `${NAV_ICON_SELECTOR} {\n  color: ${v.navIconColor} !important;\n  fill: ${v.navIconColor} !important;\n  stroke: ${v.navIconColor} !important;\n}\n`;
    }

    if (v.accent) {
      css += `a, .ic-app-header__menu-list-item--active .ic-icon-svg,
.Button--primary, button.Button--primary {
  color: ${v.accent} !important;
}
.Button--primary, button.Button--primary {
  background-color: ${v.accent} !important;
  border-color: ${v.accent} !important;
  color: #fff !important;
}\n`;
    }

    const typoDecls = [];
    if (v.fontFamily) typoDecls.push(`font-family: ${v.fontFamily} !important;`);
    if (v.fontWeight) typoDecls.push(`font-weight: ${v.fontWeight} !important;`);
    if (v.fontStyle) typoDecls.push(`font-style: ${v.fontStyle} !important;`);
    if (v.textDecoration) typoDecls.push(`text-decoration: ${v.textDecoration} !important;`);
    if (typoDecls.length) {
      css += `${TYPOGRAPHY_SELECTOR} {\n  ${typoDecls.join("\n  ")}\n}\n`;
    }
    if (v.fontFamily) {
      css += `input, button, select, textarea {\n  font-family: ${v.fontFamily} !important;\n}\n`;
    }

    if (v.fontColor) {
      css += `${FONT_COLOR_SELECTOR} {\n  color: ${v.fontColor} !important;\n}\n`;
    }

    const bgDecls = [];
    if (v.cardBg) bgDecls.push(`background-color: ${v.cardBg} !important;`);
    if (bgDecls.length) {
      css += `${CARD_BG_SELECTOR} {\n  ${bgDecls.join("\n  ")}\n}\n`;
    }

    const outerDecls = [];
    if (v.opacity) outerDecls.push(`opacity: ${v.opacity} !important;`);
    if (v.borderWidth || v.borderStyle || v.borderColor) {
      outerDecls.push(`border-width: ${v.borderWidth || "1px"} !important;`);
      outerDecls.push(`border-style: ${v.borderStyle || "solid"} !important;`);
      outerDecls.push(`border-color: ${v.borderColor || "#c1c7cf"} !important;`);
    }
    if (v.borderRadius) outerDecls.push(`border-radius: ${v.borderRadius} !important;`);
    if (v.shadow && v.shadow !== "none") outerDecls.push(`box-shadow: ${v.shadow} !important;`);
    if (outerDecls.length) {
      css += `${CARD_OUTER_SELECTOR} {\n  ${outerDecls.join("\n  ")}\n}\n`;
      css += `.ic-DashboardCard { overflow: hidden !important; }\n`;
    }
    if (v.borderRadius) {
      css += `.ic-DashboardCard__header_image, .ic-DashboardCard__header_hero {
  border-radius: ${v.borderRadius} ${v.borderRadius} 0 0 !important;
}\n`;
    }

    if (v.cardWidth) {
      css += `${CARD_BOX_SELECTOR} {\n  width: ${v.cardWidth} !important;\n}\n`;
    }

    return css;
  }

  function applyGeneratedCSS(vars) {
    withHead(() => {
      getOrCreateStyleTag(GENERATED_STYLE_ID).textContent = buildCSS(vars);
    });
  }

  function applyCustomCSS(css) {
    withHead(() => {
      getOrCreateStyleTag(CUSTOM_STYLE_ID).textContent = css || "";
    });
  }

  function applyCustomLogo(url) {
    withHead(() => {
      const tag = getOrCreateStyleTag(LOGO_STYLE_ID);
      if (url) {
        tag.textContent = `${LOGO_SELECTOR} {
  background-image: url("${url}") !important;
  background-size: contain !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}\n`;
      } else {
        tag.textContent = "";
      }
    });
  }

  function extractCourseId(cardEl) {
    const link = cardEl.querySelector('a.ic-DashboardCard__link, a[href*="/courses/"]');
    if (!link) return null;
    const match = link.getAttribute("href").match(/\/courses\/(\d+)/);
    return match ? match[1] : null;
  }

  function extractCourseName(cardEl) {
    const title = cardEl.querySelector(".ic-DashboardCard__header-title");
    return title ? title.textContent.trim() : "Untitled course";
  }

  function applyCourseImages(courseImages) {
    const images = courseImages || {};
    const cards = document.querySelectorAll(".ic-DashboardCard");
    cards.forEach((card) => {
      const id = extractCourseId(card);
      if (!id) return;
      const customUrl = images[id];
      const imageEl = card.querySelector(
        ".ic-DashboardCard__header_image, .ic-DashboardCard__header_hero"
      );
      if (!imageEl) return;
      if (customUrl) {
        imageEl.style.setProperty("background-image", `url("${customUrl}")`, "important");
        imageEl.style.setProperty("background-size", "cover", "important");
        imageEl.style.setProperty("background-position", "center center", "important");
        imageEl.setAttribute("data-csx-custom-img", "true");
      } else if (imageEl.hasAttribute("data-csx-custom-img")) {
        imageEl.style.removeProperty("background-image");
        imageEl.style.removeProperty("background-size");
        imageEl.style.removeProperty("background-position");
        imageEl.removeAttribute("data-csx-custom-img");
      }
    });
  }

  function getVisibleCourses() {
    const cards = document.querySelectorAll(".ic-DashboardCard");
    const result = [];
    cards.forEach((card) => {
      const id = extractCourseId(card);
      if (!id) return;
      result.push({ id, name: extractCourseName(card) });
    });
    return result;
  }

  let currentSettings = { enabled: true, vars: {}, customCSS: "", courseImages: {}, customLogo: "" };
  let dashboardObserver = null;

  function fullApply(settings) {
    currentSettings = settings;
    const enabled = settings.enabled !== false;
    applyGeneratedCSS(enabled ? settings.vars : null);
    applyCustomCSS(enabled ? settings.customCSS : "");
    applyCustomLogo(enabled ? settings.customLogo : null);
    applyCourseImages(enabled ? settings.courseImages : null);
    startDashboardObserver();
  }

  function startDashboardObserver() {
    if (dashboardObserver) return;
    const target = document.body || document.documentElement;
    let debounce = null;
    dashboardObserver = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const enabled = currentSettings.enabled !== false;
        applyCourseImages(enabled ? currentSettings.courseImages : null);
      }, 150);
    });
    dashboardObserver.observe(target, { childList: true, subtree: true });
  }

  function loadAndApply() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const settings = result[STORAGE_KEY] || { enabled: true, vars: {}, customCSS: "", courseImages: {}, customLogo: "" };
      fullApply(settings);
    });
  }

  loadAndApply();
  if (document.body) {
    startDashboardObserver();
  } else {
    document.addEventListener("DOMContentLoaded", startDashboardObserver, { once: true });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      fullApply(changes[STORAGE_KEY].newValue || { enabled: true, vars: {}, customCSS: "", courseImages: {}, customLogo: "" });
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "csx-get-courses") {
      sendResponse({ courses: getVisibleCourses() });
      return true;
    }
    if (msg && msg.type === "csx-ping") {
      sendResponse({ ok: true, onDashboard: !!document.querySelector(".ic-DashboardCard") });
      return true;
    }
  });
})();
