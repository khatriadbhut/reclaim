import { useState, useEffect } from "react";

const BACKEND = "http://localhost:3000";

const CATEGORY_COLORS = {
  shopping: "#00e5a0",
  social: "#b57bee",
  news: "#4d9fff",
  finance: "#ffd166",
  entertainment: "#ff4d4d",
  education: "#4dffb5",
  health: "#ff9f4d",
  travel: "#4dd4ff",
  technology: "#c4ff4d",
  other: "#666",
};

function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

export default function App() {
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [categories, setCategories] = useState({});
  const [sessions, setSessions] = useState({});
  const [insight, setInsight] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");

  useEffect(() => {
    // Try to read from chrome extension storage
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(["sessions", "totalEarnings"], (result) => {
        processData(result.sessions || {}, result.totalEarnings || 0);
      });
    } else {
      // Demo data for development
      const demoSessions = {
        [getTodayKey()]: {
          "instagram.com": { domain: "instagram.com", category: "social", totalSeconds: 47880, visits: 23, earned: 0.053 },
          "github.com": { domain: "github.com", category: "technology", totalSeconds: 5400, visits: 8, earned: 0.0045 },
          "youtube.com": { domain: "youtube.com", category: "entertainment", totalSeconds: 3420, visits: 5, earned: 0.0028 },
          "amazon.in": { domain: "amazon.in", category: "shopping", totalSeconds: 1800, visits: 3, earned: 0.04 },
          "leetcode.com": { domain: "leetcode.com", category: "education", totalSeconds: 2700, visits: 4, earned: 0.0015 },
        },
      };
      processData(demoSessions, 0.77);
    }
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

  return (
    <div style={styles.app}>
      {/* Sidebar */}
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

      {/* Main */}
      <main style={styles.main}>
        {/* Header */}
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

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div style={styles.grid}>
            {/* Earnings card */}
            <div style={{ ...styles.card, ...styles.cardAccent }}>
              <div style={styles.cardLabel}>Total Earned</div>
              <div style={styles.bigNumber}>
                ${dollars}<span style={styles.bigNumberCents}>.{cents}</span>
              </div>
              <div style={styles.cardSub}>today: ${todayEarnings.toFixed(4)}</div>
            </div>

            {/* Top category */}
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

            {/* Sites visited */}
            <div style={styles.card}>
              <div style={styles.cardLabel}>Sites Visited Today</div>
              <div style={{ ...styles.bigNumber, fontSize: 48 }}>{Object.keys(todaySessions).length}</div>
              <div style={styles.cardSub}>unique domains tracked</div>
            </div>

            {/* AI Insight */}
            <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
              <div style={styles.cardLabel}>AI Insight</div>
              {insightLoading ? (
                <div style={styles.insightLoading}>analysing your browsing patterns...</div>
              ) : (
                <div style={styles.insightText}>{insight || "browse a few sites to generate your insight."}</div>
              )}
            </div>

            {/* Category breakdown */}
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

        {/* Browsing Tab */}
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
                        <span style={{ ...styles.catPill, background: CATEGORY_COLORS[s.category] + "22", color: CATEGORY_COLORS[s.category] || "#fff" }}>
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

        {/* Insights Tab */}
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

        {/* Wallet Tab */}
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

const navIcons = {
  overview: "◈",
  browsing: "◉",
  insights: "◆",
  wallet: "◎",
};

const styles = {
  app: {
    display: "flex",
    minHeight: "100vh",
    background: "#0d0d0d",
    color: "#f0f0f0",
    fontFamily: "Syne, sans-serif",
  },
  sidebar: {
    width: 200,
    minHeight: "100vh",
    background: "#111",
    borderRight: "1px solid #2a2a2a",
    display: "flex",
    flexDirection: "column",
    padding: "24px 0",
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
  },
  logo: {
    fontSize: 22,
    fontWeight: 800,
    color: "#00e5a0",
    padding: "0 20px 24px",
    letterSpacing: -0.5,
    borderBottom: "1px solid #2a2a2a",
    marginBottom: 16,
  },
  nav: { display: "flex", flexDirection: "column", gap: 4, padding: "0 12px" },
  navItem: {
    background: "none",
    border: "none",
    color: "#666",
    padding: "10px 12px",
    borderRadius: 6,
    cursor: "pointer",
    textAlign: "left",
    fontSize: 12,
    fontFamily: "Syne, sans-serif",
    fontWeight: 600,
    textTransform: "capitalize",
    letterSpacing: 0.5,
    display: "flex",
    alignItems: "center",
    gap: 10,
    transition: "all 0.15s",
  },
  navItemActive: { background: "#00e5a015", color: "#00e5a0" },
  navIcon: { fontSize: 14 },
  sidebarFooter: {
    marginTop: "auto",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderTop: "1px solid #2a2a2a",
  },
  statusDot: {
    width: 6, height: 6, borderRadius: "50%",
    background: "#00e5a0",
    boxShadow: "0 0 6px #00e5a0",
    animation: "pulse 2s infinite",
  },
  statusText: { fontSize: 10, color: "#444", fontFamily: "DM Mono, monospace", letterSpacing: 1 },
  main: { marginLeft: 200, flex: 1, padding: 32 },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid #2a2a2a",
  },
  pageTitle: { fontSize: 28, fontWeight: 800, textTransform: "capitalize", letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 12, color: "#444", fontFamily: "DM Mono, monospace", marginTop: 4 },
  connectBtn: {
    background: "#00e5a0", color: "#000", border: "none",
    padding: "8px 16px", borderRadius: 6, cursor: "pointer",
    fontSize: 11, fontFamily: "Syne, sans-serif", fontWeight: 700,
  },
  walletBadge: {
    background: "#00e5a015", border: "1px solid #00e5a030",
    padding: "8px 14px", borderRadius: 6,
    fontSize: 11, fontFamily: "DM Mono, monospace", color: "#00e5a0",
    display: "flex", alignItems: "center", gap: 8,
  },
  walletDot: { width: 6, height: 6, borderRadius: "50%", background: "#00e5a0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 },
  card: {
    background: "#161616", border: "1px solid #2a2a2a",
    borderRadius: 12, padding: 24,
  },
  cardAccent: { borderColor: "#00e5a030", background: "#00e5a008" },
  cardLabel: {
    fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
    color: "#444", fontFamily: "DM Mono, monospace", marginBottom: 12,
  },
  bigNumber: {
    fontSize: 52, fontWeight: 800, color: "#00e5a0",
    letterSpacing: -2, lineHeight: 1,
  },
  bigNumberCents: { fontSize: 24, fontWeight: 600, opacity: 0.7 },
  cardSub: { fontSize: 11, color: "#444", fontFamily: "DM Mono, monospace", marginTop: 8 },
  muted: { color: "#444", fontSize: 12, fontFamily: "DM Mono, monospace" },
  insightText: {
    fontSize: 14, lineHeight: 1.7, color: "#c0fff0",
    fontFamily: "DM Mono, monospace",
  },
  insightLoading: {
    fontSize: 12, color: "#444", fontFamily: "DM Mono, monospace", animation: "shimmer 1.5s infinite",
  },
  refreshBtn: {
    marginTop: 16, background: "none", border: "1px solid #2a2a2a",
    color: "#666", padding: "8px 16px", borderRadius: 6, cursor: "pointer",
    fontSize: 11, fontFamily: "DM Mono, monospace",
  },
  catList: { display: "flex", flexDirection: "column", gap: 10, marginTop: 8 },
  catRow: { display: "grid", gridTemplateColumns: "100px 1fr 60px 70px", alignItems: "center", gap: 12 },
  catName: { fontSize: 11, fontFamily: "DM Mono, monospace", textTransform: "capitalize", color: "#f0f0f0" },
  barTrack: { height: 4, background: "#2a2a2a", borderRadius: 2, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 2, transition: "width 0.6s ease" },
  catTime: { fontSize: 10, color: "#666", fontFamily: "DM Mono, monospace", textAlign: "right" },
  catEarned: { fontSize: 10, color: "#00e5a0", fontFamily: "DM Mono, monospace", textAlign: "right" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 8 },
  th: {
    fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
    color: "#444", fontFamily: "DM Mono, monospace",
    padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #2a2a2a",
  },
  tr: { borderBottom: "1px solid #1a1a1a" },
  td: { padding: "12px 12px", fontSize: 12, fontFamily: "DM Mono, monospace", color: "#ccc" },
  catPill: {
    padding: "2px 8px", borderRadius: 4, fontSize: 10,
    fontFamily: "DM Mono, monospace", fontWeight: 600,
  },
};
