import { useEffect, useState } from "react";
import { BACKEND, styles } from "../ui/constants.js";

const bodySans = {
  fontFamily: "Syne, sans-serif",
  fontSize: 13,
  lineHeight: 1.55,
  color: "#b0b0b0",
};

const chipRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 8,
};

const chipStyle = {
  fontFamily: "DM Mono, monospace",
  fontSize: 10,
  color: "#c4c4c4",
  background: "#1a1a1a",
  border: "1px solid #333",
  padding: "4px 8px",
  borderRadius: 6,
  lineHeight: 1.3,
};

const moduleCardShell = {
  borderRadius: 12,
  padding: 16,
  background: "#121212",
  border: "1px solid #2a2a2a",
  cursor: "pointer",
  transition: "border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
  position: "relative",
  userSelect: "none",
};

const usdMuted = {
  fontFamily: "DM Mono, monospace",
  fontSize: 9,
  color: "#6a6a6a",
  fontWeight: 500,
};

/** Included on every custom export row (see `buildCustomPackageRows` in backend). */
const CUSTOM_EXPORT_BASE_COLUMNS = ["user_id", "visit_segments_30d"];

/**
 * Category ids + add-on prices must match `CUSTOM_CATEGORY_PRICE_USD` in `backend/server.js`.
 * `exportColumns` must match fields merged in `buildCustomPackageRows` for that category.
 */
const DATA_CATEGORIES = [
  {
    id: "demographics",
    name: "Demographics",
    price: 39,
    tagline: "Age, gender, location, device type",
    exportColumns: ["age_range", "gender", "occupation", "city", "state", "country", "device"],
    description:
      "Core audience identifiers collected at onboarding. Enables geo-targeting and basic audience segmentation.",
  },
  {
    id: "browsing_behavior",
    name: "Browsing Behavior",
    price: 49,
    tagline: "Top categories, session hours, active days & hours",
    exportColumns: [
      "top_categories",
      "total_browsing_hours",
      "time_spent_per_category",
      "active_days",
      "peak_hour",
    ],
    description:
      "Weekly aggregated behavioral patterns. High signal quality for audience planning and media buying.",
  },
  {
    id: "purchase_intent",
    name: "Purchase Intent",
    price: 69,
    tagline: "Intent scores, price range, in-market verticals",
    exportColumns: ["max_intent_score", "intent_by_vertical", "price_ranges_viewed", "intent_search_queries"],
    description:
      "Gemini-extracted intent signals per session. Near-term buying indicators — highest conversion value segment.",
  },
  {
    id: "brand_affinity",
    name: "Brand Affinity",
    price: 49,
    tagline: "Researched brands, premium brand signals, cross-site visits",
    exportColumns: ["top_brands_researched", "premium_brands", "premium_brand_flag", "brand_cross_site_visits"],
    description:
      "Brand-level engagement signals. Essential for brand lift studies and competitive conquesting campaigns.",
  },
  {
    id: "content_signals",
    name: "Content & Page Signals",
    price: 39,
    tagline: "Page types, search queries, scroll depth, breadcrumbs",
    exportColumns: ["page_types", "search_queries", "max_scroll_depth", "breadcrumbs", "keywords"],
    description:
      "In-page engagement signals captured by the content script. Used for contextual targeting and content affinity scoring.",
  },
  {
    id: "temporal_patterns",
    name: "Temporal Patterns",
    price: 35,
    tagline: "Time of day, visit hour, peak browsing windows",
    exportColumns: ["peak_hour", "is_night_owl", "late_night_hours", "hour_distribution", "active_days"],
    description:
      "When users are most active online. Powers dayparting strategies for ad scheduling optimization.",
  },
  {
    id: "ecommerce_signals",
    name: "E-commerce Signals",
    price: 59,
    tagline: "Prices found, checkout visits, product views, shopping domains",
    exportColumns: [
      "shopping_domains",
      "prices_found",
      "checkout_visits",
      "product_page_visits",
      "shopping_brands",
    ],
    description:
      "Deep e-commerce behavior extracted per session. Ideal for retargeting, dynamic product ads, and price-sensitivity modeling.",
  },
  {
    id: "finance_signals",
    name: "Finance Signals",
    price: 79,
    tagline: "Finance browsing time, decision-maker segment, intent",
    exportColumns: [
      "finance_browsing_hours",
      "finance_intent_level",
      "finance_decision_maker",
      "finance_domains_visited",
      "finance_search_queries",
      "max_finance_intent_score",
    ],
    description:
      "Premium, sensitive segment. High CPM for fintech, insurance, BFSI, and lending verticals.",
  },
  {
    id: "tech_affinity",
    name: "Tech Affinity",
    price: 49,
    tagline: "Tech category time, early adopter segment, tech brands, device",
    exportColumns: [
      "tech_browsing_hours",
      "tech_early_adopter",
      "tech_domains_visited",
      "ai_tools_used",
      "dev_platforms_visited",
      "tech_brands_researched",
      "device",
    ],
    description:
      "Identifies tech-forward users. Used by consumer electronics, SaaS, and developer-tool advertisers.",
  },
  {
    id: "audience_segments",
    name: "Audience Segments",
    price: 45,
    tagline: "Pre-computed segments: high_intent_shopper, night_owl, job_seeker…",
    exportColumns: ["audience_segments"],
    description:
      "Ready-to-activate audience segments auto-assigned by the Reclaim backend. Drop directly into ad platforms — no extra processing required.",
  },
];

/** Per-export platform fee (covers delivery pipeline); kept modest so module prices drive most of the total. */
const BASE_PRICE = 49;

/** Builder-only ballpark (not CSV row count). Grows with each category so the demo matches “more you add, larger modeled reach.” */
function estimateReachDemo(selectedCount) {
  if (selectedCount === 0) return 0;
  const start = 7200;
  const perExtra = 1850;
  return Math.min(32000, start + (selectedCount - 1) * perExtra);
}

function CategoryCard({ cat, selected, onToggle }) {
  const [hovered, setHovered] = useState(false);
  const isOn = selected.has(cat.id);
  const borderColor = isOn ? "#00e5a055" : hovered ? "#353535" : "#2a2a2a";
  const bg = isOn ? "#101814" : "#121212";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isOn}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(cat.id);
        }
      }}
      onClick={() => onToggle(cat.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...moduleCardShell,
        border: `1px solid ${borderColor}`,
        background: bg,
        boxShadow: isOn ? "0 0 0 1px rgba(0, 229, 160, 0.12)" : "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          width: 18,
          height: 18,
          borderRadius: 4,
          border: `1px solid ${isOn ? "#00e5a0" : "#404040"}`,
          background: isOn ? "#00e5a0" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s ease",
          flexShrink: 0,
        }}
      >
        {isOn && (
          <svg width="10" height="8" viewBox="0 0 9 7" fill="none" aria-hidden>
            <path d="M1 3.5L3.5 6L8 1" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div style={{ paddingRight: 28, marginBottom: 8 }}>
        <div style={{
          fontFamily: "Syne, sans-serif",
          fontSize: 15,
          fontWeight: 700,
          color: "#f0f0f0",
          letterSpacing: "-0.02em",
          lineHeight: 1.25,
        }}
        >
          {cat.name}
        </div>
        <p style={{ ...bodySans, margin: "6px 0 0", fontSize: 12, color: "#9a9a9a", lineHeight: 1.5 }}>
          {cat.tagline}
        </p>
      </div>

      <div style={{ fontFamily: "Syne, sans-serif", fontSize: 10, fontWeight: 600, color: "#777", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Columns in file
      </div>
      <div style={{ ...chipRow, marginTop: 0, marginBottom: 12 }}>
        {cat.exportColumns.map((col) => (
          <span key={col} style={chipStyle}>{col}</span>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 5, marginTop: 4 }}>
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 13, fontWeight: 700, color: "#e0e0e0" }}>
          +${cat.price}
        </span>
        <span style={usdMuted}>USD</span>
      </div>
    </div>
  );
}

function CustomPackageBuilder({ purchaseFormat, onPurchase }) {
  const [selected, setSelected] = useState(new Set());
  const [purchasing, setPurchasing] = useState(false);
  const [localError, setLocalError] = useState("");

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLocalError("");
  }

  const selectedCats = DATA_CATEGORIES.filter((c) => selected.has(c.id));
  const totalPrice = BASE_PRICE + selectedCats.reduce((s, c) => s + c.price, 0);
  const reach = estimateReachDemo(selected.size);
  const mergedExportColumns =
    selected.size === 0
      ? []
      : [...new Set([...CUSTOM_EXPORT_BASE_COLUMNS, ...selectedCats.flatMap((c) => c.exportColumns)])].sort();
  const allExportColumns = selectedCats.flatMap((c) => c.exportColumns);

  async function handleBuild() {
    if (selected.size === 0) {
      setLocalError("Select at least one data category to build a package.");
      return;
    }
    setPurchasing(true);
    setLocalError("");
    try {
      await onPurchase({ categoryIds: [...selected], signals: allExportColumns });
      setSelected(new Set());
    } catch (e) {
      setLocalError(e?.message || "Purchase failed.");
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={styles.cardLabel}>Custom export</div>
        <p style={{ ...bodySans, margin: "6px 0 0", fontSize: 12, color: "#8a8a8a", maxWidth: 560, lineHeight: 1.5 }}>
          Add modules (USD). Every row includes <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "#909090" }}>user_id</span> and{" "}
          <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "#909090" }}>visit_segments_30d</span>. Format follows the marketplace toggle.
        </p>
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 280, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, alignItems: "stretch" }}>
          {DATA_CATEGORIES.map((cat) => (
            <CategoryCard key={cat.id} cat={cat} selected={selected} onToggle={toggle} />
          ))}
        </div>

        <div style={{
          width: 300,
          flexShrink: 0,
          border: "1px solid #2a2a2a",
          borderRadius: 12,
          padding: 16,
          background: "#121212",
          position: "sticky",
          top: 20,
        }}
        >
          <div style={{ fontFamily: "Syne, sans-serif", fontSize: 10, fontWeight: 600, color: "#777", letterSpacing: "0.06em", marginBottom: 14 }}>
            ORDER SUMMARY
          </div>

          <div style={{ marginBottom: 14, minHeight: 48 }}>
            {selectedCats.length === 0 ? (
              <div style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "#8a8a8a", lineHeight: 1.6 }}>
                No modules selected.
              </div>
            ) : (
              selectedCats.map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontFamily: "Syne, sans-serif", fontSize: 12, fontWeight: 600, color: "#d0d0d0", minWidth: 0, paddingRight: 8 }}>
                    {c.name}
                  </span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0 }}>
                    <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "#c8c8c8" }}>+${c.price}</span>
                    <span style={usdMuted}>USD</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {mergedExportColumns.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "Syne, sans-serif", fontSize: 10, fontWeight: 600, color: "#777", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Columns in file ({mergedExportColumns.length})
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  maxHeight: 140,
                  overflowY: "auto",
                  paddingRight: 4,
                  marginRight: -4,
                }}
              >
                {mergedExportColumns.map((col) => (
                  <span key={col} style={chipStyle}>{col}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#a8a8a8" }}>Base fee</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#c8c8c8" }}>${BASE_PRICE}</span>
                <span style={usdMuted}>USD</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#c8c8c8" }}>Total</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 22, fontWeight: 800, color: "#00e5a0" }}>
                  ${totalPrice}
                </span>
                <span style={usdMuted}>USD</span>
              </div>
            </div>
          </div>

          {selected.size > 0 && (
            <div style={{
              background: "#161616",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 14,
            }}
            >
              <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#7a7a7a", marginBottom: 4 }}>REACH (DEMO)</div>
              <div style={{ fontFamily: "DM Mono, monospace", fontSize: 15, fontWeight: 700, color: "#c8c8c8" }}>
                ~{reach.toLocaleString()}
              </div>
            </div>
          )}

          <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#6a6a6a", marginBottom: 12 }}>
            {mergedExportColumns.length > 0
              ? `${mergedExportColumns.length} columns · ${purchaseFormat.toUpperCase()}`
              : `Select modules · ${purchaseFormat.toUpperCase()}`}
          </div>

          {localError && (
            <div style={{
              fontFamily: "DM Mono, monospace", fontSize: 10, color: "#ff9f9f",
              background: "#ff4d4d10", border: "1px solid #ff4d4d30",
              borderRadius: 7, padding: "7px 10px", marginBottom: 10,
            }}
            >
              {localError}
            </div>
          )}

          <button
            type="button"
            onClick={handleBuild}
            disabled={purchasing || selected.size === 0}
            style={{
              ...styles.connectBtn,
              width: "100%",
              opacity: purchasing || selected.size === 0 ? 0.35 : 1,
              cursor: purchasing || selected.size === 0 ? "not-allowed" : "pointer",
              display: "flex",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            {purchasing ? "Processing…" : `Buy & Download · $${totalPrice} USD`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CompanyDashboard() {
  const [companyMe, setCompanyMe] = useState(null);
  const [companyAuthLoading, setCompanyAuthLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchaseFormat, setPurchaseFormat] = useState("json");
  const [purchasingPackageId, setPurchasingPackageId] = useState(null);
  const [companyError, setCompanyError] = useState("");
  const [activeTab, setActiveTab] = useState("fixed");

  useEffect(() => {
    bootstrapCompany();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // BFCache: Back from Google can restore a frozen /company tab with stale React state
  // while cookies/session are already correct (or the opposite). Re-sync from the server.
  useEffect(() => {
    function onPageShow(e) {
      if (e.persisted) void bootstrapCompany();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bootstrapCompany() {
    setCompanyAuthLoading(true);
    setCompanyError("");
    try {
      const res = await fetch(`${BACKEND}/api/company/auth/me`, { credentials: "include" });
      if (!res.ok) {
        setCompanyMe(null);
        setPackages([]);
        setPurchases([]);
        setCompanyAuthLoading(false);
        return;
      }
      const me = await res.json();
      setCompanyMe(me);
      setCompanyAuthLoading(false);
      await loadCompanyPackages();
      await loadCompanyPurchases();
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
    // replace: avoids an extra /company history entry so Back from Google
    // does not land on a stale pre-OAuth dashboard snapshot as often.
    window.location.replace(`${BACKEND}/api/company/auth/google/start`);
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
    setPurchasingPackageId(pkg.id);
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
    } finally {
      setPurchasingPackageId(null);
    }
  }

  async function buyCustomPackage({ categoryIds, signals }) {
    setCompanyError("");
    try {
      const res = await fetch(`${BACKEND}/api/company/purchase/custom`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryIds, signals, format: purchaseFormat }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      await loadCompanyPurchases();
      window.location.href = `${BACKEND}${data.downloadUrl}`;
    } catch (e) {
      setCompanyError(e?.message || "Custom purchase failed.");
      throw e;
    }
  }

  const tabStyle = (active) => ({
    fontFamily: "Syne, sans-serif",
    fontSize: 12,
    fontWeight: active ? 700 : 600,
    color: active ? "#00e5a0" : "#666",
    background: active ? "#00e5a010" : "none",
    border: `1px solid ${active ? "#00e5a030" : "#2a2a2a"}`,
    borderRadius: 8,
    padding: "8px 16px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  });

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
        <div style={{ ...styles.header, marginBottom: 20, paddingBottom: 20 }}>
          <div>
            <div style={styles.pageTitle}>Company dashboard</div>
          </div>
          {companyMe ? (
            <button type="button" style={{ ...styles.connectBtn, background: "none", color: "#00e5a0", border: "1px solid #00e5a030" }} onClick={companyLogout}>
              Logout
            </button>
          ) : (
            <button type="button" style={styles.connectBtn} onClick={startCompanyGoogleOAuth}>
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
            <div style={{ color: "#666", fontFamily: "DM Mono, monospace", fontSize: 13, lineHeight: 1.6 }}>
              Sign in with your company Google account to continue.
            </div>
            <button type="button" style={{ ...styles.connectBtn, marginTop: 16 }} onClick={startCompanyGoogleOAuth}>
              Continue with Google
            </button>
          </div>
        ) : (
          <div style={styles.grid}>
            <div
              style={{
                gridColumn: "1 / -1",
                borderRadius: 14,
                border: "1px solid #2a2a2a",
                borderLeft: "3px solid #00e5a0",
                background: "linear-gradient(165deg, #171717 0%, #111 100%)",
                padding: "26px 28px",
                boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
              }}
            >
              <div
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#5c5c5c",
                  marginBottom: 10,
                }}
              >
                Marketplace
              </div>
              <h2
                style={{
                  fontFamily: "Syne, sans-serif",
                  fontSize: 24,
                  fontWeight: 700,
                  margin: 0,
                  color: "#f4f4f4",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.15,
                }}
              >
                Audience exports
              </h2>
              <p style={{ ...bodySans, margin: "10px 0 0", maxWidth: 520, fontSize: 13, color: "#8a8a8a" }}>
                Row-level exports · pseudonymous IDs · prices in USD. Choose format below.
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 14,
                  marginTop: 22,
                  paddingTop: 20,
                  borderTop: "1px solid #252525",
                }}
              >
                <span style={{ fontFamily: "Syne, sans-serif", fontSize: 12, fontWeight: 600, color: "#666" }}>
                  File format
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  {["json", "csv"].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setPurchaseFormat(f)}
                      style={{
                        ...styles.refreshBtn,
                        marginTop: 0,
                        fontFamily: "Syne, sans-serif",
                        fontWeight: 700,
                        borderColor: purchaseFormat === f ? "#00e5a040" : "#2a2a2a",
                        color: purchaseFormat === f ? "#00e5a0" : "#666",
                        background: purchaseFormat === f ? "#00e5a012" : "none",
                      }}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" style={tabStyle(activeTab === "fixed")} onClick={() => setActiveTab("fixed")}>
                Curated packages
              </button>
              <button type="button" style={tabStyle(activeTab === "custom")} onClick={() => setActiveTab("custom")}>
                Custom export
              </button>
            </div>

            {activeTab === "fixed" && (
              <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
                <div style={styles.cardLabel}>Curated packages</div>
                {packagesLoading ? (
                  <div style={styles.insightLoading}>loading packages...</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 8, alignItems: "stretch" }}>
                    {packages.map((p) => {
                      const fields = Array.isArray(p.dataFields)
                        ? p.dataFields
                        : Array.isArray(p.data_fields)
                          ? p.data_fields
                          : [];
                      const allFieldLabels = [...new Set([...fields, "visit_segments_30d"])];
                      const uses = Array.isArray(p.useCases) ? p.useCases : [];
                      const sigs = p.signals || [];
                      return (
                        <div
                          key={p.id}
                          style={{
                            border: "1px solid #2a2a2a",
                            borderRadius: 12,
                            padding: 16,
                            background: "#121212",
                            display: "flex",
                            flexDirection: "column",
                            height: "100%",
                            minHeight: 0,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flex: "1 1 auto" }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{
                                fontFamily: "Syne, sans-serif",
                                fontSize: 16,
                                fontWeight: 700,
                                color: "#f0f0f0",
                                letterSpacing: "-0.02em",
                                lineHeight: 1.25,
                              }}
                              >
                                {p.name}
                              </div>
                              <p style={{ ...bodySans, margin: "8px 0 0", fontSize: 13, color: "#9a9a9a" }}>
                                {p.tagline}
                              </p>
                              {allFieldLabels.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                  <div style={{ fontFamily: "Syne, sans-serif", fontSize: 11, fontWeight: 600, color: "#777", textTransform: "uppercase", letterSpacing: 0.06 }}>
                                    Columns in file
                                  </div>
                                  <div style={chipRow}>
                                    {allFieldLabels.map((f, i) => (
                                      <span key={`${p.id}-col-${i}-${f}`} style={chipStyle}>{f}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {uses.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                  <div style={{ fontFamily: "Syne, sans-serif", fontSize: 11, fontWeight: 600, color: "#777", textTransform: "uppercase", letterSpacing: 0.06 }}>
                                    Good for
                                  </div>
                                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, ...bodySans, fontSize: 12, color: "#a0a0a0" }}>
                                    {uses.map((u, i) => (
                                      <li key={i} style={{ marginBottom: 4 }}>{u}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontFamily: "Syne, sans-serif", fontSize: 10, color: "#666", fontWeight: 600 }}>Users</div>
                              <div style={{ fontFamily: "Syne, sans-serif", fontSize: 18, color: "#00e5a0", fontWeight: 800 }}>
                                {p.userCount ?? "—"}
                              </div>
                              <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#5a5a5a", marginTop: 10, letterSpacing: "0.04em" }}>
                                LIST PRICE
                              </div>
                              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 5, marginTop: 2 }}>
                                <span style={{ fontFamily: "Syne, sans-serif", fontSize: 15, fontWeight: 800, color: "#d8d8d8" }}>${p.price}</span>
                                <span style={usdMuted}>USD</span>
                              </div>
                            </div>
                          </div>
                          {sigs.length > 0 && (
                            <div style={{ marginTop: 12, flex: "1 1 auto" }}>
                              <div style={{ fontFamily: "Syne, sans-serif", fontSize: 11, fontWeight: 600, color: "#777", textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 6 }}>
                                Signals
                              </div>
                              <ul style={{ margin: 0, paddingLeft: 18, ...bodySans, fontSize: 12, color: "#909090" }}>
                                {sigs.map((s, idx) => (
                                  <li key={idx} style={{ marginBottom: 6 }}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 12,
                              marginTop: "auto",
                              paddingTop: 16,
                              borderTop: "1px solid #252525",
                            }}
                          >
                            <div style={{ fontFamily: "Syne, sans-serif", fontSize: 12, fontWeight: 600, color: "#888", flexShrink: 0 }}>
                              {purchaseFormat.toUpperCase()} export
                            </div>
                            <button
                              type="button"
                              style={{
                                ...styles.connectBtn,
                                flexShrink: 0,
                                opacity: purchasingPackageId ? 0.55 : 1,
                                cursor: purchasingPackageId ? "not-allowed" : "pointer",
                              }}
                              disabled={purchasingPackageId !== null}
                              onClick={() => buyPackage(p)}
                            >
                              {purchasingPackageId === p.id ? "Preparing…" : "Buy & Download"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {packages.length === 0 && (
                      <div style={{ color: "#666", fontFamily: "DM Mono, monospace", fontSize: 12 }}>No packages available.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === "custom" && (
              <CustomPackageBuilder purchaseFormat={purchaseFormat} onPurchase={buyCustomPackage} />
            )}

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
                        <td style={styles.td}>{x.packageId || x.customLabel || "Custom"}</td>
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
                      <tr>
                        <td colSpan={5} style={{ ...styles.td, color: "#666", textAlign: "center", padding: 24 }}>
                          no purchases yet
                        </td>
                      </tr>
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
