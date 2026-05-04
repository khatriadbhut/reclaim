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

const landingCss = `
.reclaimLanding{ position:relative; overflow:hidden; }
.landingBg{
  position:absolute; inset:-200px;
  background:
    radial-gradient(600px 420px at 20% 20%, rgba(0,229,160,0.14), transparent 60%),
    radial-gradient(560px 420px at 80% 30%, rgba(77,159,255,0.14), transparent 60%),
    radial-gradient(520px 420px at 60% 90%, rgba(181,123,238,0.12), transparent 60%),
    linear-gradient(180deg, #0b0b0b 0%, #0d0d0d 50%, #0b0b0b 100%);
  filter: blur(0px);
  animation: bgShift 10s ease-in-out infinite alternate;
  z-index:0;
}
.landingGridOverlay{
  position:absolute; inset:0;
  background-image:
    linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse at top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0) 75%);
  opacity: 0.35;
  z-index:0;
  pointer-events:none;
}
.glassCard{ position:relative; z-index:1; background: rgba(17,17,17,0.7); backdrop-filter: blur(10px); }
.hoverLift{ transition: transform .18s ease, border-color .18s ease; }
.hoverLift:hover{ transform: translateY(-2px); border-color: rgba(0,229,160,0.22) !important; }
.ctaGlow{ box-shadow: 0 18px 40px rgba(0,229,160,0.10); }
.chip{
  font-family: "DM Mono", monospace;
  font-size: 11px;
  color: #cfcfcf;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(18,18,18,0.7);
  padding: 6px 10px;
  border-radius: 999px;
}
.stepCard{
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(18,18,18,0.55);
  padding: 14px;
  border-radius: 14px;
}
.floatCard{ transform: translateZ(0); }
.floatCard.f0{ animation: floaty 6s ease-in-out infinite; }
.floatCard.f1{ animation: floaty 7s ease-in-out infinite; }
.floatCard.f2{ animation: floaty 8s ease-in-out infinite; }
@keyframes floaty{ 0%,100%{ transform: translateY(0); } 50%{ transform: translateY(-6px); } }
@keyframes bgShift{ 0%{ transform: translate3d(0,0,0) scale(1); } 100%{ transform: translate3d(20px,-14px,0) scale(1.02); } }
`;

export default function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const isCompanyRoute = path.startsWith("/company");
  const isUserRoute = path.startsWith("/user");
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);

  // ─── Company dashboard state ───────────────────────────────────────────────
  const [companyMe, setCompanyMe] = useState(null);
  const [companyAuthLoading, setCompanyAuthLoading] = useState(isCompanyRoute);
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchaseFormat, setPurchaseFormat] = useState("csv");
  const [companyError, setCompanyError] = useState("");

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
    if (typeof window !== "undefined") {
      const onResize = () => setVw(window.innerWidth);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (isCompanyRoute) {
      bootstrapCompany();
      return;
    }
    if (!isUserRoute) return;
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

  async function bootstrapCompany() {
    setCompanyAuthLoading(true);
    setCompanyError("");
    try {
      const res = await fetch(`${BACKEND}/api/company/auth/me`, { credentials: "include" });
      if (!res.ok) {
        setCompanyMe(null);
        setCompanyAuthLoading(false);
        return;
      }
      const me = await res.json();
      setCompanyMe(me);
      setCompanyAuthLoading(false);
      await Promise.all([loadCompanyPackages(), loadCompanyPurchases()]);
    } catch (e) {
      setCompanyError(e?.message || "Failed to connect to backend.");
      setCompanyMe(null);
      setCompanyAuthLoading(false);
    }
  }

  async function loadCompanyPackages() {
    setPackagesLoading(true);
    setCompanyError("");
    try {
      const res = await fetch(`${BACKEND}/api/company/packages`, { credentials: "include" });
      if (!res.ok) throw new Error("Not authorized");
      const data = await res.json();
      setPackages(Array.isArray(data) ? data : []);
    } catch (e) {
      setCompanyError(e?.message || "Failed to load packages.");
      setPackages([]);
    } finally {
      setPackagesLoading(false);
    }
  }

  async function loadCompanyPurchases() {
    setPurchasesLoading(true);
    setCompanyError("");
    try {
      const res = await fetch(`${BACKEND}/api/company/purchases`, { credentials: "include" });
      if (!res.ok) throw new Error("Not authorized");
      const data = await res.json();
      setPurchases(data.purchases || []);
    } catch (e) {
      setCompanyError(e?.message || "Failed to load purchases.");
      setPurchases([]);
    } finally {
      setPurchasesLoading(false);
    }
  }

  function startCompanyGoogleOAuth() {
    window.location.href = `${BACKEND}/api/company/auth/google/start`;
  }

  async function companyLogout() {
    setCompanyError("");
    try {
      await fetch(`${BACKEND}/api/company/auth/logout`, { method: "POST", credentials: "include" });
    } catch { /* ignore */ }
    setCompanyMe(null);
  }

  async function buyPackage(pkg) {
    setCompanyError("");
    try {
      const res = await fetch(`${BACKEND}/api/company/purchase`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: pkg.id, format: purchaseFormat }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      await loadCompanyPurchases();
      // Trigger download immediately for smooth UX
      window.location.href = `${BACKEND}${data.downloadUrl}`;
    } catch (e) {
      setCompanyError(e?.message || "Purchase failed.");
    }
  }

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

  if (isCompanyRoute) {
    return (
      <div style={styles.app}>
        <aside style={styles.sidebar}>
          <div style={styles.logo}>re<span style={{ color: "#f0f0f0" }}>claim</span></div>
          <div style={{ padding: "0 20px", marginTop: 8 }}>
            <div style={{ ...styles.cardLabel, marginBottom: 8 }}>Company</div>
            {companyMe ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {companyMe.picture ? (
                  <img src={companyMe.picture} alt="" style={{ width: 28, height: 28, borderRadius: 8 }} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "#222", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "DM Mono, monospace", fontSize: 12 }}>
                    {(companyMe.name || "C")[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 12, color: "#f0f0f0", fontWeight: 700 }}>{companyMe.name || "Company"}</div>
                  <div style={{ fontSize: 10, color: "#666", fontFamily: "DM Mono, monospace" }}>{companyMe.email || ""}</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "#666", fontFamily: "DM Mono, monospace" }}>Not logged in</div>
            )}
          </div>
          <div style={styles.sidebarFooter}>
            <div style={styles.statusDot} />
            <span style={styles.statusText}>marketplace</span>
          </div>
        </aside>

        <main style={styles.main}>
          <div style={styles.header}>
            <div>
              <div style={styles.pageTitle}>company</div>
              <div style={styles.pageSubtitle}>packages marketplace</div>
            </div>
            {companyMe ? (
              <button style={{ ...styles.connectBtn, background: "none", color: "#00e5a0", border: "1px solid #00e5a030" }} onClick={companyLogout}>
                Logout
              </button>
            ) : (
              <button style={styles.connectBtn} onClick={startCompanyGoogleOAuth}>
                Continue with Google
              </button>
            )}
          </div>

          {companyError && (
            <div style={{ ...styles.card, borderColor: "#ff4d4d55", background: "#ff4d4d10", marginBottom: 16 }}>
              <div style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#ff9f9f" }}>{companyError}</div>
            </div>
          )}

          {companyAuthLoading ? (
            <div style={styles.card}>
              <div style={styles.cardLabel}>Authenticating</div>
              <div style={styles.insightLoading}>checking session...</div>
            </div>
          ) : !companyMe ? (
            <div style={styles.card}>
              <div style={styles.cardLabel}>Login required</div>
              <div style={{ color: "#666", fontFamily: "DM Mono, monospace", fontSize: 13, lineHeight: 1.7 }}>
                Log in with your company Google account to view and purchase audience packages.
              </div>
              <button style={{ ...styles.connectBtn, marginTop: 16 }} onClick={startCompanyGoogleOAuth}>
                Continue with Google
              </button>
            </div>
          ) : (
            <div style={styles.grid}>
              <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={styles.cardLabel}>Export format</div>
                    <div style={{ fontFamily: "DM Mono, monospace", color: "#666", fontSize: 12, marginTop: 6 }}>
                      Standard for adtech pipelines: CSV is common; JSON keeps nested fields.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["csv", "json"].map((f) => (
                      <button
                        key={f}
                        onClick={() => setPurchaseFormat(f)}
                        style={{
                          ...styles.refreshBtn,
                          borderColor: purchaseFormat === f ? "#00e5a030" : "#2a2a2a",
                          color: purchaseFormat === f ? "#00e5a0" : "#666",
                          background: purchaseFormat === f ? "#00e5a010" : "none",
                        }}
                      >
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
                <div style={styles.cardLabel}>Packages</div>
                {packagesLoading ? (
                  <div style={styles.insightLoading}>loading packages...</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 8 }}>
                    {packages.map((p) => (
                      <div key={p.id} style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 16, background: "#121212" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: "#f0f0f0" }}>{p.name}</div>
                            <div style={{ marginTop: 6, fontFamily: "DM Mono, monospace", fontSize: 11, color: "#666", lineHeight: 1.6 }}>
                              {p.tagline}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#444" }}>Users</div>
                            <div style={{ fontFamily: "DM Mono, monospace", fontSize: 16, color: "#00e5a0", fontWeight: 800 }}>
                              {p.userCount ?? "—"}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                          {(p.signals || []).slice(0, 4).map((s, idx) => (
                            <span key={idx} style={{ ...styles.catPill, background: "#00e5a012", color: "#00e5a0", border: "1px solid #00e5a020" }}>
                              {s}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                          <div style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#666" }}>
                            ${p.price} • {purchaseFormat.toUpperCase()}
                          </div>
                          <button style={styles.connectBtn} onClick={() => buyPackage(p)}>
                            Buy & Download
                          </button>
                        </div>
                      </div>
                    ))}
                    {packages.length === 0 && (
                      <div style={{ color: "#666", fontFamily: "DM Mono, monospace", fontSize: 12 }}>No packages available.</div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
                <div style={styles.cardLabel}>Purchase history</div>
                {purchasesLoading ? (
                  <div style={styles.insightLoading}>loading purchases...</div>
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {["Package", "Format", "Rows", "Purchased", "Download"].map((h) => (
                          <th key={h} style={styles.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((x) => (
                        <tr key={x.id} style={styles.tr}>
                          <td style={styles.td}>{x.packageId}</td>
                          <td style={styles.td}>{(x.format || "").toUpperCase()}</td>
                          <td style={styles.td}>{x.rowCount ?? "—"}</td>
                          <td style={styles.td}>{new Date(x.createdAt).toLocaleString()}</td>
                          <td style={styles.td}>
                            <a
                              href={`${BACKEND}/api/company/download/${x.id}?format=${encodeURIComponent(x.format || "csv")}`}
                              style={{ color: "#00e5a0", fontFamily: "DM Mono, monospace", fontSize: 12, textDecoration: "none" }}
                            >
                              download
                            </a>
                          </td>
                        </tr>
                      ))}
                      {purchases.length === 0 && (
                        <tr><td colSpan={5} style={{ ...styles.td, color: "#666", textAlign: "center", padding: 24 }}>no purchases yet</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  if (!isUserRoute) {
    const isMobile = vw < 900;
    return (
      <div style={styles.landingWrap} className="reclaimLanding">
        <style>{landingCss}</style>

        <div className="landingBg" />
        <div className="landingGridOverlay" />

        <div style={styles.landingTopBar}>
          <div style={styles.landingBrand}>re<span style={{ color: "#f0f0f0" }}>claim</span></div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <a href="/user" style={styles.landingLink}>Users</a>
            <a href="/company" style={{ ...styles.landingLink, borderColor: "#00e5a030", color: "#00e5a0" }}>Reclaim Business</a>
          </div>
        </div>

        <div style={{ ...styles.landingHero, gridTemplateColumns: isMobile ? "1fr" : "1.25fr 0.75fr" }}>
          <div style={styles.heroLeft} className="glassCard">
            <div style={styles.heroKicker}>A fair data economy</div>
            <div style={styles.heroTitle}>
              Turn browsing signals into payouts.
            </div>
            <div style={styles.heroSub}>
              Reclaim pays users for consent-based intent signals and gives companies export-ready audience packages built on cross-site behavior.
            </div>

            <div style={styles.heroCtas}>
              <a href="/user" style={styles.ctaPrimary} className="ctaGlow">
                I’m a user → Earn money
              </a>
              <a href="/company" style={styles.ctaSecondary}>
                Reclaim Business → Buy packages
              </a>
            </div>

            <div style={{ ...styles.heroProofRow, gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))" }}>
              {[
                { k: "Instant value", v: "High-intent segments from real browsing journeys." },
                { k: "Privacy-first", v: "Consent-based signals. No creepy surprises." },
                { k: "Pipeline-ready", v: "Clean CSV/JSON exports + purchase history." },
              ].map((x, i) => (
                <div key={x.k} style={styles.proofCard} className={`floatCard f${i}`}>
                  <div style={styles.proofK}>{x.k}</div>
                  <div style={styles.proofV}>{x.v}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {["High-intent shoppers", "Finance decision makers", "Real estate prospects", "Tech early adopters", "Night-owl buyers"].map((t) => (
                <span key={t} className="chip">{t}</span>
              ))}
            </div>
          </div>

          <div style={styles.heroRight}>
            <div style={styles.metricStrip} className="glassCard">
              <div style={styles.metricRow}>
                <div style={styles.metricVal}>CSV / JSON</div>
                <div style={styles.metricLab}>exports</div>
              </div>
              <div style={styles.metricRow}>
                <div style={styles.metricVal}>Cross-site</div>
                <div style={styles.metricLab}>signals</div>
              </div>
              <div style={styles.metricRow}>
                <div style={styles.metricVal}>Geo + demo</div>
                <div style={styles.metricLab}>enrichment</div>
              </div>
            </div>

            <div style={styles.pitchCard} className="glassCard hoverLift">
              <div style={styles.pitchLabel}>For users</div>
              <div style={styles.pitchTitle}>Get paid while you browse.</div>
              <div style={styles.pitchText}>
                You create valuable intent signals by shopping, researching, and comparing. Reclaim shares that value back with you.
              </div>
              <div style={styles.pitchBullets}>
                {[
                  "One-click onboarding",
                  "Edit your demographics anytime",
                  "Location improves relevance & value",
                ].map((b) => (
                  <div key={b} style={styles.bulletRow}>
                    <span style={styles.bulletDot} />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
              <a href="/user" style={{ ...styles.ctaPrimary, width: "100%", textAlign: "center", marginTop: 14 }} className="ctaGlow">
                I’m a user
              </a>
            </div>

            <div style={{ ...styles.pitchCard, borderColor: "#4d9fff33" }} className="glassCard hoverLift">
              <div style={{ ...styles.pitchLabel, color: "#4d9fff" }}>For companies</div>
              <div style={styles.pitchTitle}>Buy audiences that convert.</div>
              <div style={styles.pitchText}>
                Purchase packaged segments built from real intent journeys across the web. Export, activate, measure.
              </div>
              <div style={styles.pitchBullets}>
                {[
                  "Audience packages with clear signals",
                  "Purchase history + repeatable downloads",
                  "CSV/JSON for BI, activation, and modeling",
                ].map((b) => (
                  <div key={b} style={styles.bulletRow}>
                    <span style={{ ...styles.bulletDot, background: "#4d9fff" }} />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
              <a href="/company" style={{ ...styles.ctaSecondary, width: "100%", textAlign: "center", marginTop: 14 }}>
                Reclaim Business
              </a>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: "18px auto 0" }} className="glassCard">
          <div style={{ padding: 18 }}>
            <div style={styles.cardLabel}>How it works</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 10 }}>
              {[
                { t: "Users opt in", d: "Install the extension, sign in, and choose what to share." },
                { t: "Signals become segments", d: "We package intent + affinity + journey patterns into audiences." },
                { t: "Companies buy & export", d: "Authenticate, purchase, download CSV/JSON, and activate." },
              ].map((s) => (
                <div key={s.t} className="stepCard">
                  <div style={{ fontWeight: 900, letterSpacing: -0.3 }}>{s.t}</div>
                  <div style={{ marginTop: 8, fontFamily: "DM Mono, monospace", color: "#888", fontSize: 12, lineHeight: 1.7 }}>{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={styles.landingFooter}>
          <div style={styles.footerNote}>
            Built to be consent-based, export-ready, and useful on day one — without forcing companies to install an extension or request permissions.
          </div>
        </div>
      </div>
    );
  }

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
  landingWrap: {
    minHeight: "100vh",
    background: "#0d0d0d",
    color: "#f0f0f0",
    fontFamily: "Syne, sans-serif",
    padding: 28,
  },
  landingTopBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    maxWidth: 1100,
    margin: "0 auto",
    paddingBottom: 18,
    borderBottom: "1px solid #2a2a2a",
  },
  landingBrand: {
    fontSize: 22,
    fontWeight: 800,
    color: "#00e5a0",
    letterSpacing: -0.5,
  },
  landingLink: {
    color: "#666",
    textDecoration: "none",
    fontFamily: "DM Mono, monospace",
    fontSize: 11,
    border: "1px solid #2a2a2a",
    padding: "8px 12px",
    borderRadius: 8,
  },
  landingHero: {
    maxWidth: 1100,
    margin: "26px auto 0",
    display: "grid",
    gap: 18,
  },
  heroLeft: {
    border: "1px solid #2a2a2a",
    borderRadius: 16,
    padding: 22,
    background: "rgba(15,15,15,0.55)",
  },
  heroKicker: {
    fontFamily: "DM Mono, monospace",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#444",
  },
  heroTitle: {
    marginTop: 10,
    fontSize: 44,
    fontWeight: 900,
    letterSpacing: -1.5,
    lineHeight: 1.05,
    color: "#00e5a0",
  },
  heroSub: {
    marginTop: 12,
    fontFamily: "DM Mono, monospace",
    fontSize: 13,
    color: "#888",
    lineHeight: 1.7,
    maxWidth: 680,
  },
  heroCtas: { display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" },
  ctaPrimary: {
    display: "inline-block",
    background: "#00e5a0",
    color: "#000",
    border: "none",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "Syne, sans-serif",
    fontWeight: 800,
    textDecoration: "none",
  },
  ctaSecondary: {
    display: "inline-block",
    background: "none",
    color: "#00e5a0",
    border: "1px solid #00e5a030",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "Syne, sans-serif",
    fontWeight: 800,
    textDecoration: "none",
  },
  heroProofRow: {
    marginTop: 18,
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  proofCard: {
    border: "1px solid #1f1f1f",
    background: "rgba(18,18,18,0.55)",
    borderRadius: 14,
    padding: 14,
  },
  proofK: {
    fontFamily: "DM Mono, monospace",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#444",
  },
  proofV: {
    marginTop: 8,
    fontFamily: "DM Mono, monospace",
    fontSize: 12,
    color: "#bbb",
    lineHeight: 1.6,
  },
  heroRight: { display: "flex", flexDirection: "column", gap: 12 },
  pitchCard: {
    border: "1px solid #00e5a030",
    background: "rgba(17,17,17,0.65)",
    borderRadius: 16,
    padding: 18,
  },
  pitchLabel: {
    fontFamily: "DM Mono, monospace",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#00e5a0",
  },
  pitchTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: -0.5,
  },
  pitchText: {
    marginTop: 10,
    fontFamily: "DM Mono, monospace",
    fontSize: 12,
    lineHeight: 1.7,
    color: "#888",
  },
  pitchBullets: { marginTop: 12, display: "flex", flexDirection: "column", gap: 8 },
  bulletRow: { display: "flex", gap: 10, alignItems: "flex-start", color: "#ccc", fontFamily: "DM Mono, monospace", fontSize: 12, lineHeight: 1.5 },
  bulletDot: { width: 6, height: 6, marginTop: 6, borderRadius: "50%", background: "#00e5a0", flex: "0 0 6px" },
  landingFooter: {
    maxWidth: 1100,
    margin: "18px auto 0",
    paddingTop: 16,
    borderTop: "1px solid #2a2a2a",
  },
  footerNote: {
    fontFamily: "DM Mono, monospace",
    color: "#444",
    fontSize: 11,
    lineHeight: 1.7,
  },
  metricStrip: {
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 16,
    display: "grid",
    gap: 10,
  },
  metricRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(18,18,18,0.55)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  metricVal: { fontWeight: 900, letterSpacing: -0.3, color: "#f0f0f0" },
  metricLab: { fontFamily: "DM Mono, monospace", fontSize: 11, color: "#666" },
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
