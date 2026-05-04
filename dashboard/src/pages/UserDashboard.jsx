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
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [hasChromeStorage, setHasChromeStorage] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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

  const sortedCats = Object.entries(categories).sort((a, b) => b[1].seconds - a[1].seconds);
  const maxSeconds = sortedCats.length > 0 ? sortedCats[0][1].seconds : 1;

  const todayKey = getTodayKey();
  const todaySessions = sessions[todayKey] || {};
  const topDomains = Object.values(todaySessions).sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 8);

  const dollars = Math.floor(totalEarnings);
  const cents = ((totalEarnings - dollars) * 100).toFixed(0).padStart(2, "0");

  if (!authChecked) {
    return (
      <div style={styles.landingWrap}>
        <div style={{ ...styles.card, maxWidth: 720, margin: "60px auto" }}>
          <div style={styles.cardLabel}>Loading</div>
          <div style={{ color: "#bbb", fontFamily: "DM Mono, monospace", fontSize: 12, lineHeight: 1.7 }}>
            Checking extension session…
          </div>
        </div>
      </div>
    );
  }

  if (!hasChromeStorage || !isLoggedIn) {
    return (
      <div style={styles.landingWrap}>
        <div style={{ ...styles.card, maxWidth: 840, margin: "60px auto" }}>
          <div style={styles.cardLabel}>Sign in required</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, marginTop: 10 }}>
            Open the Reclaim extension and sign in first.
          </div>
          <div style={{ marginTop: 14, color: "#888", fontFamily: "DM Mono, monospace", fontSize: 12, lineHeight: 1.8 }}>
            Use <strong>Chrome</strong> with the <strong>Reclaim</strong> extension enabled. Open this page via the extension’s <strong>Dashboard</strong> button (recommended), or hard‑refresh after a second so the extension can inject its id. Embedded preview browsers won’t work. If you’re signed out in the extension, sign in there first.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <a href="/" style={styles.ctaSecondary}>Back to landing</a>
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
          {["overview", "browsing", "insights", "wallet"].map((tab) => (
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
          <span style={styles.statusText}>collecting data</span>
        </div>
      </aside>

      <main style={styles.main}>
        <div style={styles.header}>
          <div>
            <div style={styles.pageTitle}>{activeTab}</div>
            <div style={styles.pageSubtitle}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          </div>
          {walletConnected ? (
            <div style={styles.walletBadge}>
              <span style={styles.walletDot} />
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </div>
          ) : (
            <button style={styles.connectBtn} onClick={connectWallet}>Connect Wallet</button>
          )}
        </div>

        {activeTab === "overview" && (
          <div style={styles.grid}>
            <div style={{ ...styles.card, ...styles.cardAccent }}>
              <div style={styles.cardLabel}>Total Earned</div>
              <div style={styles.bigNumber}>
                ${dollars}<span style={styles.bigNumberCents}>.{cents}</span>
              </div>
              <div style={styles.cardSub}>today: ${todayEarnings.toFixed(4)}</div>
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
              <div style={styles.cardLabel}>AI Insight</div>
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
              <div style={styles.cardLabel}>Top Sites Today</div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {["Domain", "Category", "Time", "Visits", "Earned"].map((h) => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topDomains.map((s) => (
                    <tr key={s.domain} style={styles.tr}>
                      <td style={styles.td}>{s.domain}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.catPill, background: (CATEGORY_COLORS[s.category] || "#666") + "22", color: CATEGORY_COLORS[s.category] || "#fff" }}>
                          {s.category}
                        </span>
                      </td>
                      <td style={styles.td}>{formatTime(s.totalSeconds)}</td>
                      <td style={styles.td}>{s.visits}</td>
                      <td style={{ ...styles.td, color: "#00e5a0" }}>${s.earned.toFixed(5)}</td>
                    </tr>
                  ))}
                  {topDomains.length === 0 && (
                    <tr><td colSpan={5} style={{ ...styles.td, color: "#666", textAlign: "center", padding: 32 }}>no browsing data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "insights" && (
          <div style={styles.grid}>
            <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
              <div style={styles.cardLabel}>AI Insight</div>
              {insightLoading ? (
                <div style={styles.insightLoading}>analysing your browsing patterns...</div>
              ) : (
                <div style={styles.insightText}>{insight || "browse a few sites to generate your insight."}</div>
              )}
              <button style={styles.refreshBtn} onClick={() => fetchInsight(categories)}>
                Refresh Insight
              </button>
            </div>
            <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
              <div style={styles.cardLabel}>Data Value Breakdown</div>
              <div style={styles.catList}>
                {sortedCats.map(([cat, data]) => (
                  <div key={cat} style={styles.catRow}>
                    <div style={styles.catName}>{cat}</div>
                    <div style={styles.barTrack}>
                      <div style={{
                        ...styles.barFill,
                        width: `${(data.earned / (todayEarnings || 1)) * 100}%`,
                        background: CATEGORY_COLORS[cat] || "#666",
                      }} />
                    </div>
                    <div style={styles.catEarned}>${data.earned.toFixed(4)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "wallet" && (
          <div style={styles.grid}>
            <div style={{ ...styles.card, ...styles.cardAccent }}>
              <div style={styles.cardLabel}>Available Balance</div>
              <div style={styles.bigNumber}>${dollars}<span style={styles.bigNumberCents}>.{cents}</span></div>
              <div style={styles.cardSub}>ready to withdraw</div>
            </div>
            <div style={styles.card}>
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
                  <button style={{ ...styles.connectBtn, marginTop: 12 }} onClick={connectWallet}>Connect MetaMask</button>
                </>
              )}
            </div>
            <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
              <div style={styles.cardLabel}>Withdraw Funds</div>
              <div style={{ color: "#666", fontSize: 13, fontFamily: "DM Mono, monospace", marginTop: 8, lineHeight: 1.6 }}>
                Blockchain payments coming soon. Smart contracts will automate payouts — 80% to you, 20% platform fee.
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

