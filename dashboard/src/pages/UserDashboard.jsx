import { useEffect, useState } from "react";
import { BACKEND, CATEGORY_COLORS, formatTime, getTodayKey, navIcons, styles } from "../ui/constants.js";

function isLocalDashboardHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "127.0.0.1" || h === "localhost";
}

function readReclaimExtensionIdFromMeta() {
  if (typeof document === "undefined") return null;
  return document.querySelector('meta[name="reclaim-extension-id"]')?.getAttribute("content") || null;
}

/** `?ext=` from popup, or meta from `dashboard-bridge.js` (32-char Chrome extension id). */
function readReclaimExtensionId() {
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search).get("ext");
    if (q && /^[a-z]{32}$/i.test(q.trim())) return q.trim().toLowerCase();
  } catch {
    /* ignore */
  }
  return readReclaimExtensionIdFromMeta();
}

/** MV3: long-lived port is more reliable than sendMessage to a waking service worker. */
function requestExtensionStateViaConnect(extId) {
  return new Promise((resolve) => {
    if (!extId) {
      resolve({ ok: false, payload: null });
      return;
    }
    const rt = globalThis.chrome?.runtime;
    if (!rt?.connect) {
      resolve({ ok: false, payload: null });
      return;
    }
    let port;
    try {
      port = rt.connect(extId, { name: "reclaim-dashboard" });
    } catch {
      resolve({ ok: false, payload: null });
      return;
    }
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(tid);
      try {
        port.disconnect();
      } catch {
        /* ignore */
      }
      if (payload && typeof payload === "object") {
        resolve({ ok: true, payload });
      } else {
        resolve({ ok: false, payload: null });
      }
    };
    const tid = setTimeout(() => finish(null), 5000);
    port.onMessage.addListener((msg) => {
      if (msg?.type === "RECLAIM_STORAGE" && msg.payload && typeof msg.payload === "object") {
        finish(msg.payload);
      }
    });
    port.onDisconnect.addListener(() => {
      if (!settled) finish(null);
    });
    try {
      port.postMessage({ type: "RECLAIM_GET_STORAGE" });
    } catch {
      finish(null);
    }
  });
}

/** Fallback: manifest `externally_connectable` + `onMessageExternal`. */
function requestExtensionStateViaSendMessage(extId) {
  return new Promise((resolve) => {
    const rt = globalThis.chrome?.runtime;
    if (!extId || !rt?.sendMessage) {
      resolve({ ok: false, payload: null });
      return;
    }
    try {
      const maybe = rt.sendMessage(extId, { type: "RECLAIM_GET_STORAGE" });
      if (maybe && typeof maybe.then === "function") {
        maybe
          .then((response) => {
            resolve({ ok: true, payload: response && typeof response === "object" ? response : {} });
          })
          .catch(() => resolve({ ok: false, payload: null }));
        return;
      }
    } catch {
      resolve({ ok: false, payload: null });
      return;
    }
    try {
      rt.sendMessage(extId, { type: "RECLAIM_GET_STORAGE" }, (response) => {
        const le = globalThis.chrome?.runtime?.lastError;
        if (le) {
          resolve({ ok: false, payload: null });
          return;
        }
        resolve({ ok: true, payload: response && typeof response === "object" ? response : {} });
      });
    } catch {
      resolve({ ok: false, payload: null });
    }
  });
}

/** Waits for `?ext=` or meta, then connect → sendMessage. Uses wall-clock polling (not rAF) so background tabs still resolve before the deadline. */
function requestExtensionStateViaExternal(maxWaitMs = 6000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + maxWaitMs;
    let intervalId = null;
    let settled = false;
    let inFlight = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (intervalId != null) clearInterval(intervalId);
      resolve(value);
    };

    const tick = async () => {
      if (settled || inFlight) return;
      inFlight = true;
      try {
        const extId = readReclaimExtensionId();
        const rt = globalThis.chrome?.runtime;
        if (extId && (rt?.connect || rt?.sendMessage)) {
          const viaPort = await requestExtensionStateViaConnect(extId);
          if (settled) return;
          if (viaPort.ok) {
            finish(viaPort);
            return;
          }
          const viaMsg = await requestExtensionStateViaSendMessage(extId);
          if (settled) return;
          finish(viaMsg);
          return;
        }
        if (Date.now() >= deadline) {
          finish({ ok: false, payload: null });
        }
      } finally {
        inFlight = false;
      }
    };

    intervalId = setInterval(() => {
      void tick();
    }, 50);
    void tick();
  });
}

/** Page context cannot use chrome.storage; extension content script `dashboard-bridge.js` answers this. */
function requestExtensionStateViaBridge() {
  return new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const timeoutMs = 4000;
    let settled = false;

    function done(value) {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(tid);
      resolve(value);
    }

    function onMessage(e) {
      // Do not require e.source === window: replies from the extension content script are same-origin
      // but may not share the same Window reference as the page bundle.
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || d.source !== "reclaim-extension" || d.type !== "EXTENSION_STATE") return;
      if (d.requestId !== requestId) return;
      if (!d.ok) {
        done({ ok: false, payload: null });
        return;
      }
      done({ ok: true, payload: d.payload || {} });
    }

    const tid = setTimeout(() => done({ ok: false, payload: null }), timeoutMs);
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "reclaim-dashboard", type: "GET_EXTENSION_STATE", requestId }, "*");
  });
}

export default function UserDashboard() {
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [categories, setCategories] = useState({});
  const [sessions, setSessions] = useState({});
  const [insight, setInsight] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [showAllScrolledDomains, setShowAllScrolledDomains] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [hasChromeStorage, setHasChromeStorage] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [lastSyncOk, setLastSyncOk] = useState(null);

  useEffect(() => {
    if (activeTab === "insights") setActiveTab("overview");
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;

    function applyStorageResult(result) {
      if (cancelled) return;
      const authed = !!(result?.isLoggedIn || result?.userId);
      setHasChromeStorage(true);
      setIsLoggedIn(authed);
      setAuthChecked(true);
      if (!authed) {
        processData({}, 0);
        return;
      }
      setLastSyncAt(typeof result.lastSyncAt === "number" ? result.lastSyncAt : null);
      setLastSyncOk(typeof result.lastSyncOk === "boolean" ? result.lastSyncOk : null);
      processData(result.sessions || {}, result.totalEarnings || 0);
    }

    // Local Vite: never use page `chrome.storage` (fake / unusable). Prefer runtime.sendMessage
    // (externally_connectable), then postMessage bridge.
    if (isLocalDashboardHost()) {
      (async () => {
        const viaExt = await requestExtensionStateViaExternal();
        if (cancelled) return;
        if (viaExt.ok) {
          applyStorageResult(viaExt.payload);
          return;
        }
        const res = await requestExtensionStateViaBridge();
        if (cancelled) return;
        if (res.ok) applyStorageResult(res.payload);
        else {
          setHasChromeStorage(false);
          setIsLoggedIn(false);
          setAuthChecked(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    const direct = globalThis.chrome?.storage?.local;
    if (direct) {
      direct.get(["isLoggedIn", "sessions", "totalEarnings", "userId"], (result) => {
        if (cancelled) return;
        if (globalThis.chrome?.runtime?.lastError) {
          setHasChromeStorage(false);
          setIsLoggedIn(false);
          setAuthChecked(true);
          return;
        }
        applyStorageResult(result || {});
      });
      return () => {
        cancelled = true;
      };
    }

    setHasChromeStorage(false);
    setIsLoggedIn(false);
    setAuthChecked(true);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function processData(sessionsData, total) {
    setTotalEarnings(total);
    setSessions(sessionsData);
    const todayKey = getTodayKey();
    const todaySessions = sessionsData[todayKey] || {};
    const todayTotal = Object.values(todaySessions).reduce((s, x) => s + (x.earned || 0), 0);
    setTodayEarnings(todayTotal);

    const cats = {};
    for (const s of Object.values(todaySessions)) {
      const cat = s.category || "other";
      if (!cats[cat]) cats[cat] = { seconds: 0, earned: 0, domains: [] };
      cats[cat].seconds += s.totalSeconds || 0;
      cats[cat].earned += s.earned || 0;
      cats[cat].domains.push(s.domain);
    }
    setCategories(cats);

    if (Object.keys(cats).length > 0) fetchInsight(cats);
  }

  async function fetchInsight(cats) {
    setInsightLoading(true);
    const summary = Object.entries(cats)
      .map(([cat, data]) => `${cat}: ${Math.round(data.seconds / 60)} minutes`)
      .join(", ");
    try {
      const res = await fetch(`${BACKEND}/api/insight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary }),
      });
      const data = await res.json();
      setInsight(data.insight || "");
    } catch {
      setInsight("Start the backend server to get AI insights.");
    }
    setInsightLoading(false);
  }

  async function connectWallet() {
    if (typeof window.ethereum !== "undefined") {
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        setWalletAddress(accounts[0]);
        setWalletConnected(true);
      } catch {
        alert("Wallet connection rejected.");
      }
    } else {
      alert("MetaMask not found. Please install it.");
    }
  }

  async function syncNow() {
    if (syncBusy) return;
    setSyncBusy(true);
    setSyncMsg("syncing…");
    try {
      const extId = readReclaimExtensionId();
      const rt = globalThis.chrome?.runtime;
      if (!extId || !rt) throw new Error("extension not available");

      const res = await new Promise((resolve, reject) => {
        // Prefer MV3 port for reliability
        if (rt.connect) {
          let port;
          try {
            port = rt.connect(extId, { name: "reclaim-dashboard" });
          } catch {
            port = null;
          }
          if (port) {
            let settled = false;
            const tid = setTimeout(() => {
              if (settled) return;
              settled = true;
              try { port.disconnect(); } catch { /* ignore */ }
              reject(new Error("sync timed out"));
            }, 25000);
            port.onMessage.addListener((msg) => {
              if (settled) return;
              if (msg?.type !== "RECLAIM_SYNC_RESULT") return;
              settled = true;
              clearTimeout(tid);
              try { port.disconnect(); } catch { /* ignore */ }
              resolve(msg.payload || { ok: false, error: "unknown" });
            });
            port.onDisconnect.addListener(() => {
              if (settled) return;
              settled = true;
              clearTimeout(tid);
              reject(new Error("extension disconnected"));
            });
            try {
              port.postMessage({ type: "RECLAIM_SYNC_NOW" });
            } catch {
              clearTimeout(tid);
              try { port.disconnect(); } catch { /* ignore */ }
              reject(new Error("failed to start sync"));
            }
            return;
          }
        }

        if (!rt.sendMessage) {
          reject(new Error("extension messaging unavailable"));
          return;
        }
        try {
          rt.sendMessage(extId, { type: "RECLAIM_SYNC_NOW" }, (response) => {
            const le = globalThis.chrome?.runtime?.lastError;
            if (le) reject(new Error(String(le.message || le)));
            else resolve(response || { ok: false, error: "unknown" });
          });
        } catch (e) {
          reject(e);
        }
      });

      const ok = !!res?.ok;
      const at = typeof res?.at === "number" ? res.at : Date.now();
      setLastSyncAt(at);
      setLastSyncOk(ok);
      setSyncMsg(ok ? "synced" : "sync failed");

      // Pull updated storage so the UI refreshes immediately after a sync.
      const viaExt = await requestExtensionStateViaExternal(3000);
      if (viaExt.ok) {
        const payload = viaExt.payload || {};
        setLastSyncAt(typeof payload.lastSyncAt === "number" ? payload.lastSyncAt : at);
        setLastSyncOk(typeof payload.lastSyncOk === "boolean" ? payload.lastSyncOk : ok);
        processData(payload.sessions || {}, payload.totalEarnings || 0);
      }
    } catch (e) {
      setSyncMsg(e?.message ? String(e.message) : "sync failed");
    } finally {
      setSyncBusy(false);
      setTimeout(() => setSyncMsg(""), 2500);
    }
  }

  const sortedCats = Object.entries(categories).sort((a, b) => b[1].seconds - a[1].seconds);
  const maxSeconds = sortedCats.length > 0 ? sortedCats[0][1].seconds : 1;

  const todayKey = getTodayKey();
  const todaySessions = sessions[todayKey] || {};
  const topDomains = Object.values(todaySessions).sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 8);
  const SCROLL_DOMAIN_MIN_DEPTH = 30;
  const scrolledDomainsAll = (() => {
    const byDomain = new Map();
    for (const day of Object.values(sessions || {})) {
      for (const s of Object.values(day || {})) {
        if (!s || !s.domain) continue;
        const depth = typeof s.maxScrollDepth === "number" ? s.maxScrollDepth : 0;
        if (depth < SCROLL_DOMAIN_MIN_DEPTH) continue;
        const prev = byDomain.get(s.domain) || {
          domain: s.domain,
          category: s.category || "other",
          maxScrollDepth: 0,
          totalSeconds: 0,
          visits: 0,
          earned: 0,
        };
        prev.totalSeconds += s.totalSeconds || 0;
        prev.visits += s.visits || 0;
        prev.earned += s.earned || 0;
        if (depth > prev.maxScrollDepth) prev.maxScrollDepth = depth;
        // Prefer non-other category if we have one
        const c = s.category || "other";
        if (prev.category === "other" && c !== "other") prev.category = c;
        byDomain.set(s.domain, prev);
      }
    }
    return [...byDomain.values()].sort((a, b) => (b.maxScrollDepth - a.maxScrollDepth) || (b.totalSeconds - a.totalSeconds));
  })();
  const topSitesExtended = (() => {
    const todaySet = new Set(topDomains.map((s) => s.domain));
    const extra = scrolledDomainsAll
      .filter((s) => !todaySet.has(s.domain))
      .slice(0, Math.max(0, 200 - topDomains.length))
      .map((s) => ({ ...s, scope: "scrolled" }));
    const today = topDomains.map((s) => ({
      domain: s.domain,
      category: s.category || "other",
      totalSeconds: s.totalSeconds || 0,
      visits: s.visits || 0,
      earned: s.earned || 0,
      maxScrollDepth: typeof s.maxScrollDepth === "number" ? s.maxScrollDepth : null,
      scope: "today",
    }));
    return [...today, ...extra];
  })();

  const dollars = Math.floor(totalEarnings);
  const cents = ((totalEarnings - dollars) * 100).toFixed(0).padStart(2, "0");

  const guestShellStyle = {
    ...styles.landingWrap,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 16px 48px",
    boxSizing: "border-box",
  };

  if (!authChecked) {
    return (
      <div style={guestShellStyle}>
        <div style={{ ...styles.card, maxWidth: 440, width: "100%", boxSizing: "border-box" }}>
          <div style={styles.cardLabel}>Loading</div>
          <div style={{ fontFamily: "Syne, sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: "#f0f0f0", marginTop: 8 }}>
            Checking your session
          </div>
          <div style={{ color: "#8a8a8a", fontFamily: "DM Mono, monospace", fontSize: 12, lineHeight: 1.65, marginTop: 10 }}>
            Talking to the Reclaim extension…
          </div>
        </div>
      </div>
    );
  }

  if (!hasChromeStorage || !isLoggedIn) {
    return (
      <div style={guestShellStyle}>
        <div style={{ ...styles.card, maxWidth: 440, width: "100%", boxSizing: "border-box" }}>
          <div style={styles.cardLabel}>Sign in required</div>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", color: "#f0f0f0", margin: "8px 0 0", lineHeight: 1.15 }}>
            Open the extension first
          </h1>
          <div style={{ marginTop: 12, color: "#8a8a8a", fontFamily: "DM Mono, monospace", fontSize: 13, lineHeight: 1.65 }}>
            Use <strong style={{ color: "#b5b5b5" }}>Chrome</strong> with the <strong style={{ color: "#b5b5b5" }}>Reclaim</strong> extension. Open this page from the extension <strong style={{ color: "#b5b5b5" }}>Dashboard</strong> button (best), or refresh so the page can pair with the extension. IDE embedded browsers won’t work. Sign in inside the extension if you’re logged out there.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap", justifyContent: "center" }}>
            <a href="/" style={styles.ctaSecondary}>← Home</a>
            <a href="/company" style={styles.ctaSecondary}>Reclaim Business</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>re<span style={{ color: "#f0f0f0" }}>claim</span></div>
        <nav style={styles.nav}>
          {["overview", "browsing", "wallet"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{ ...styles.navItem, ...(activeTab === tab ? styles.navItemActive : {}) }}
            >
              <span style={styles.navIcon}>{navIcons[tab]}</span>
              {tab}
            </button>
          ))}
        </nav>
        <div style={styles.sidebarFooter}>
          <div style={styles.statusDot} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <span style={styles.statusText}>
              {lastSyncAt
                ? `last sync: ${new Date(lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${lastSyncOk === false ? " (failed)" : ""}`
                : "syncs when browsing"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                onClick={syncNow}
                disabled={syncBusy}
                style={{
                  ...styles.refreshBtn,
                  marginTop: 0,
                  padding: "6px 10px",
                  borderRadius: 8,
                  color: syncBusy ? "#555" : "#888",
                  cursor: syncBusy ? "not-allowed" : "pointer",
                }}
              >
                {syncBusy ? "Syncing…" : "Sync now"}
              </button>
              {syncMsg ? (
                <span style={{ color: syncMsg === "synced" ? "#00e5a0" : "#ff6b6b", fontFamily: "DM Mono, monospace", fontSize: 10 }}>
                  {syncMsg}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </aside>

      <main style={{ ...styles.main, paddingTop: 36 }}>
        <div style={{ ...styles.header, paddingTop: 4, paddingRight: 8 }}>
          <div>
            <div style={styles.pageTitle}>{activeTab}</div>
            <div style={styles.pageSubtitle}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          </div>
          {activeTab === "wallet" ? (
            walletConnected ? (
              <div style={styles.walletBadge}>
                <span style={styles.walletDot} />
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </div>
            ) : null
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab("wallet")}
              style={{
                background: "none",
                border: "1px solid #2a2a2a",
                color: "#888",
                padding: "8px 14px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "Syne, sans-serif",
                fontWeight: 700,
              }}
            >
              {walletConnected
                ? `Wallet ${walletAddress.slice(0, 4)}… →`
                : "Wallet & payouts →"}
            </button>
          )}
        </div>

        {activeTab === "overview" && (
          <div style={styles.grid}>
            <div style={{ ...styles.card, ...styles.cardAccent }}>
              <div style={styles.cardLabel}>Modeled total (lifetime)</div>
              <div style={styles.bigNumber}>
                ${dollars}<span style={styles.bigNumberCents}>.{cents}</span>
              </div>
              <div style={styles.cardSub}>today (modeled): ${todayEarnings.toFixed(4)} · not withdrawable yet</div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardLabel}>Top Category Today</div>
              {sortedCats.length > 0 ? (
                <>
                  <div style={{ ...styles.bigNumber, color: CATEGORY_COLORS[sortedCats[0][0]] || "#fff", fontSize: 28 }}>
                    {sortedCats[0][0]}
                  </div>
                  <div style={styles.cardSub}>{formatTime(sortedCats[0][1].seconds)} browsed</div>
                </>
              ) : <div style={styles.muted}>no data yet</div>}
            </div>

            <div style={styles.card}>
              <div style={styles.cardLabel}>Sites Visited Today</div>
              <div style={{ ...styles.bigNumber, fontSize: 48 }}>{Object.keys(todaySessions).length}</div>
              <div style={styles.cardSub}>unique domains tracked</div>
            </div>

            <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                <div style={{ ...styles.cardLabel, marginBottom: 0 }}>AI Insight</div>
                <button
                  type="button"
                  style={{ ...styles.refreshBtn, marginTop: 0 }}
                  disabled={insightLoading || sortedCats.length === 0}
                  onClick={() => fetchInsight(categories)}
                >
                  Refresh insight
                </button>
              </div>
              {insightLoading ? (
                <div style={styles.insightLoading}>analysing your browsing patterns...</div>
              ) : (
                <div style={styles.insightText}>{insight || "browse a few sites to generate your insight."}</div>
              )}
            </div>

            <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
              <div style={styles.cardLabel}>Today's Breakdown</div>
              <div style={styles.catList}>
                {sortedCats.map(([cat, data]) => (
                  <div key={cat} style={styles.catRow}>
                    <div style={styles.catName}>{cat}</div>
                    <div style={styles.barTrack}>
                      <div style={{
                        ...styles.barFill,
                        width: `${(data.seconds / maxSeconds) * 100}%`,
                        background: CATEGORY_COLORS[cat] || "#666",
                      }} />
                    </div>
                    <div style={styles.catTime}>{formatTime(data.seconds)}</div>
                    <div style={styles.catEarned}>${data.earned.toFixed(4)}</div>
                  </div>
                ))}
                {sortedCats.length === 0 && <div style={styles.muted}>start browsing to see data</div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === "browsing" && (
          <div style={styles.grid}>
            <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={styles.cardLabel}>Top Sites Today</div>
                <button
                  type="button"
                  style={{ ...styles.refreshBtn, marginTop: 0 }}
                  onClick={() => setShowAllScrolledDomains((v) => !v)}
                >
                  {showAllScrolledDomains ? "Show top only" : "Show all scrolled"}
                </button>
              </div>
              {showAllScrolledDomains && (
                <div style={{ ...styles.cardSub, marginTop: 6 }}>
                  Includes all-time scrolled domains (scroll depth ≥ {SCROLL_DOMAIN_MIN_DEPTH}%) — showing up to 200
                </div>
              )}
              <table style={styles.table}>
                <thead>
                  <tr>
                    {(
                      showAllScrolledDomains
                        ? ["Domain", "Category", "Time", "Visits", "Modeled $", "Max Scroll", "Source"]
                        : ["Domain", "Category", "Time", "Visits", "Modeled $"]
                    ).map((h) => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(showAllScrolledDomains ? topSitesExtended : topDomains).map((s) => (
                    <tr key={(showAllScrolledDomains ? `${s.scope}-${s.domain}` : s.domain)} style={styles.tr}>
                      <td style={{ ...styles.td, opacity: showAllScrolledDomains && s.scope === "scrolled" ? 0.85 : 1 }}>{s.domain}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.catPill, background: (CATEGORY_COLORS[s.category] || "#666") + "22", color: CATEGORY_COLORS[s.category] || "#fff" }}>
                          {s.category}
                        </span>
                      </td>
                      <td style={styles.td}>{formatTime(s.totalSeconds)}</td>
                      <td style={styles.td}>{s.visits}</td>
                      <td style={{ ...styles.td, color: "#00e5a0" }}>${(s.earned || 0).toFixed(5)}</td>
                      {showAllScrolledDomains && (
                        <>
                          <td style={styles.td}>{s.maxScrollDepth == null ? "—" : `${Math.round(s.maxScrollDepth)}%`}</td>
                          <td style={styles.td}>{s.scope}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {(showAllScrolledDomains ? topSitesExtended : topDomains).length === 0 && (
                    <tr><td colSpan={showAllScrolledDomains ? 7 : 5} style={{ ...styles.td, color: "#666", textAlign: "center", padding: 32 }}>no browsing data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "wallet" && (
          <div style={styles.grid}>
            <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
              <div style={styles.cardLabel}>Wallet Status</div>
              {walletConnected ? (
                <>
                  <div style={{ color: "#00e5a0", fontSize: 14, fontFamily: "DM Mono, monospace", marginTop: 8 }}>Connected</div>
                  <div style={{ color: "#666", fontSize: 11, fontFamily: "DM Mono, monospace", marginTop: 4 }}>
                    {walletAddress.slice(0, 10)}...{walletAddress.slice(-6)}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ color: "#666", fontSize: 13, fontFamily: "DM Mono, monospace", marginTop: 8 }}>Not connected</div>
                  <div style={{ color: "#555", fontSize: 11, fontFamily: "DM Mono, monospace", marginTop: 10, lineHeight: 1.55 }}>
                    Your modeled balance stays on <strong style={{ color: "#777" }}>Overview</strong> until on-chain payouts exist.
                  </div>
                  <button type="button" style={{ ...styles.connectBtn, marginTop: 14 }} onClick={connectWallet}>Connect MetaMask</button>
                </>
              )}
            </div>
            <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
              <div style={styles.cardLabel}>Withdraw (roadmap)</div>
              <div style={{ color: "#666", fontSize: 13, fontFamily: "DM Mono, monospace", marginTop: 8, lineHeight: 1.6 }}>
                On-chain payouts are not available yet. When they ship, the intent is automated settlement — e.g. 80% to you, 20% platform fee (exact terms TBD).
              </div>
              <button style={{ ...styles.connectBtn, marginTop: 16, opacity: 0.5, cursor: "not-allowed" }} disabled>
                Withdraw (coming soon)
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

