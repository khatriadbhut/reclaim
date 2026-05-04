import { useEffect, useState } from "react";
import { BACKEND, styles } from "../ui/constants.js";

export default function CompanyDashboard() {
  const [companyMe, setCompanyMe] = useState(null);
  const [companyAuthLoading, setCompanyAuthLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchaseFormat, setPurchaseFormat] = useState("csv");
  const [companyError, setCompanyError] = useState("");

  useEffect(() => {
    bootstrapCompany();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      window.location.href = `${BACKEND}${data.downloadUrl}`;
    } catch (e) {
      setCompanyError(e?.message || "Purchase failed.");
    }
  }

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

