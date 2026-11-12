/* Canvas Styler — background service worker
 * There's no fixed domain baked into the manifest anymore, so content.js
 * isn't declared as a static content script. Instead, once the user picks
 * a Canvas host in the popup (and grants permission for it), this worker
 * registers content.js as a dynamic content script scoped to that one host.
 * If the user later changes hosts, the old registration is swapped out.
 */

const HOST_KEY = "csxHost";
const SCRIPT_ID = "csx-canvas-styler";

async function registerForHost(host) {
  if (!host) return;
  const matches = [`https://${host}/*`];
  const def = {
    id: SCRIPT_ID,
    matches,
    js: ["content.js", "tasklist.js"],
    runAt: "document_start",
    persistAcrossSessions: true,
  };

  // Don't trust a check-then-act pattern here (getRegisteredContentScripts
  // then register/update) — it isn't atomic and can race across service
  // worker restarts. Instead, unconditionally unregister any existing
  // registration for this ID first (ignoring "not found" errors), then
  // register fresh. This avoids depending on matching Chrome's exact
  // "duplicate" error message.
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch (err) {
    // No existing registration to remove — fine, continue.
  }

  try {
    await chrome.scripting.registerContentScripts([def]);
  } catch (err) {
    console.error("Canvas Styler: could not register content script", err);
    return;
  }

  // Registration only affects future navigations. Also inject into any
  // matching tabs that are already open right now so it applies instantly.
  try {
    const tabs = await chrome.tabs.query({ url: matches });
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js", "tasklist.js"] });
      } catch (e) {
        // Tab may not be scriptable (chrome://, PDF viewer, etc.) — ignore.
      }
    }
  } catch (err) {
    // Missing host permission or similar — ignore, popup surfaces real errors.
  }
}

async function init() {
  const { [HOST_KEY]: host } = await chrome.storage.local.get(HOST_KEY);
  if (host) registerForHost(host);
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[HOST_KEY] && changes[HOST_KEY].newValue) {
    registerForHost(changes[HOST_KEY].newValue);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "csx-register-host") {
    registerForHost(msg.host).then(() => sendResponse({ ok: true }));
    return true;
  }
});
