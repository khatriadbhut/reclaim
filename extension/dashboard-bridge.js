// Lets the Vite dashboard (normal page context) read extension state from chrome.storage.local.
// 1) Injects extension id so the page can use chrome.runtime.sendMessage (externally_connectable).
// 2) Fallback: page posts { source: "reclaim-dashboard", type: "GET_EXTENSION_STATE", requestId }; we reply on the same window.

(function injectReclaimExtensionMeta() {
  function insert() {
    try {
      if (document.querySelector('meta[name="reclaim-extension-id"]')) return true;
      const el = document.createElement("meta");
      el.setAttribute("name", "reclaim-extension-id");
      el.setAttribute("content", chrome.runtime.id);
      const root = document.head || document.documentElement;
      if (!root) return false;
      root.insertBefore(el, root.firstChild);
      return true;
    } catch {
      return false;
    }
  }
  if (insert()) return;
  const t = setInterval(() => {
    if (insert()) clearInterval(t);
  }, 10);
  setTimeout(() => clearInterval(t), 5000);
})();

(function () {
  // The manifest content_scripts already restricts this script to localhost:5173,
  // so the hostname guard that was here was redundant and could silently block the bridge.
  const { protocol } = window.location;
  if (protocol !== "http:" && protocol !== "https:") return;

  const KEYS = ["isLoggedIn", "sessions", "totalEarnings", "userId", "userName", "userEmail", "userPicture"];

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== "reclaim-dashboard" || msg.type !== "GET_EXTENSION_STATE") return;
    const requestId = msg.requestId;
    if (!requestId) return;

    const reply = (body) => {
      try {
        window.postMessage(
          { source: "reclaim-extension", type: "EXTENSION_STATE", requestId, ...body },
          "*",
        );
      } catch {
        /* ignore */
      }
    };

    try {
      chrome.storage.local.get(KEYS, (result) => {
        if (chrome.runtime?.lastError) {
          reply({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        reply({ ok: true, payload: result || {} });
      });
    } catch (err) {
      reply({ ok: false, error: err?.message || String(err) });
    }
  });
})();
