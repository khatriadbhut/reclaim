import { useEffect, useMemo, useState } from "react";
import { CATEGORY_COLORS, landingCss, styles } from "../ui/constants.js";

const ROTATING_ENDINGS = ["payouts.", "signal value.", "real audiences.", "your consent.", "better ads."];

const MARQUEE_ITEMS = [
  "Consent-based intent",
  "Cross-site journeys",
  "Geo-aware relevance",
  "Demographics you control",
  "CSV • JSON exports",
  "Activate anywhere",
];

const STATS = [
  { val: "Web + Extension", lbl: "Two clean paths to value" },
  { val: "Packages", lbl: "Intent segments you can buy" },
  { val: "History", lbl: "Re-download anytime" },
  { val: "Privacy-first", lbl: "No surprise sharing" },
];

const BENTO = [
  {
    kicker: "For people",
    kickerCls: "",
    title: "Get paid when your browsing means something.",
    body: "Reclaim turns ordinary sessions into attributable intent—shopping, researching, comparing—without selling you short.",
  },
  {
    kicker: "For teams",
    kickerCls: "bentoKBlue",
    title: "Audience building blocks with receipts.",
    body: "Buy packaged signals, attach them to pipelines, export as CSV or JSON for BI, experimentation, or activation tooling.",
    accent: true,
  },
];

const SEGMENTS = [
  {
    emoji: "◆",
    color: CATEGORY_COLORS.shopping,
    title: "High-intent commerce",
    text: "Journeys across retailers reveal comparison behavior, basket timing, and category momentum.",
  },
  {
    emoji: "◇",
    color: CATEGORY_COLORS.finance,
    title: "Research depth",
    text: "Long-form exploration on finance & news correlates with decision windows marketers pay for.",
  },
  {
    emoji: "○",
    color: CATEGORY_COLORS.technology,
    title: "Signal-rich profiles",
    text: "Optional demographics plus rough location tiers help sharpen reach without pretending to read minds.",
  },
];

function useMediaQueryMobile() {
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return vw < 900;
}

export default function Landing() {
  const isMobile = useMediaQueryMobile();
  const [scrolled, setScrolled] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setWordIndex((i) => (i + 1) % ROTATING_ENDINGS.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  const palettePairs = useMemo(() => {
    const keys = ["shopping", "news", "finance", "travel", "social", "technology"];
    return keys.filter((k) => CATEGORY_COLORS[k]).map((k) => ({ key: k, c: CATEGORY_COLORS[k] }));
  }, []);

  return (
    <div style={{ ...styles.landingWrap, padding: isMobile ? "20px 18px 40px" : "28px 28px 48px" }} className={`reclaimLanding ${scrolled ? "landingNavScrolled" : ""}`}>
      <style>{landingCss}</style>

      <div className="landingBg" />
      <div className="landingGridOverlay" />

      <div className="landingShell">
        <nav className="landingNav" aria-label="Primary">
          <div className="landingNavInner">
            <div style={styles.landingBrand}>
              re<span style={{ color: "#f0f0f0" }}>claim</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <a href="/user" style={styles.landingLink} className="linkBtn">
                Users
              </a>
              <a href="/company" style={{ ...styles.landingLink, borderColor: "#00e5a030", color: "#00e5a0" }} className="linkBtn">
                Reclaim Business
              </a>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <div style={{ position: "relative", maxWidth: 1160, margin: "clamp(28px,5vw,56px) auto 0", zIndex: 1 }}>
          <div className="heroOrbs" aria-hidden="true">
            <div className="heroOrb" />
            <div className="heroOrb heroOrbBlue" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.2fr) minmax(260px,0.82fr)", gap: clampGap(isMobile) }}>
            <div style={{ ...styles.heroLeft, padding: "clamp(24px,3.5vw,40px)", borderRadius: 22 }} className="glassCard heroOrbWrap">
              <div className="heroEyebrow landingBadge">
                <span className="landingPulseDot" aria-hidden="true" />
                Live ethos · fairness by design
              </div>

              <h1 className="heroTitleBlock">
                <span className="heroTitleMuted">Turn browsing signals into</span>
                <span className="heroTitleAccent heroWordSwap" key={ROTATING_ENDINGS[wordIndex]}>
                  {ROTATING_ENDINGS[wordIndex]}
                </span>
              </h1>

              <div className="heroSubLead">
                <p className="heroSubMuted">
                  Reclaim shares value with people who produce intent, and sells organized, activation-ready datasets to brands that refuse to spy their way into growth—same teal thread, better outcomes.
                </p>
              </div>

              <div style={{ ...styles.heroCtas, marginTop: clamp(26, "4vw", 36) }}>
                <a href="/user" style={styles.ctaPrimary} className="ctaGlow ctaEnhanced">
                  I'm a user — earn while you browse
                </a>
                <a href="/company" style={styles.ctaSecondary}>
                  Reclaim Business — buy packages
                </a>
              </div>

              <div className="heroStatRail">
                <div className="heroStatGrid">
                  {STATS.map((s) => (
                    <div key={s.lbl} className="heroStatTile glassCard floatCard">
                      <div className="heroStatVal">{s.val}</div>
                      <div className="heroStatLbl">{s.lbl}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="marqueeOuter" style={{ marginTop: 28 }}>
                <div className="marqueeFade">
                  <div className="marqueeTrack">
                    {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((t, idx) => (
                      <span key={`${t}-${idx}`} className="marqueeItem">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <aside style={{ ...styles.heroRight, gap: 14 }}>
              <div style={styles.metricStrip} className="glassCard hoverLift">
                <div className="sectionLabel" style={{ marginBottom: 4 }}>
                  Product snapshot
                </div>
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

              <div style={{ ...styles.pitchCard }} className="glassCard hoverLift">
                <div style={styles.pitchLabel}>For users</div>
                <div style={styles.pitchTitle}>Install once. Decide always.</div>
                <div style={styles.pitchText}>
                  The extension onboard experience keeps you informed while earnings accrue transparently—you can refine demographics anytime.
                </div>
                <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["High-intent shoppers", "Night-owl buyers", "Finance researchers", "Real estate scouts", "Tech early adopters"].map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
                <a href="/user" style={{ ...styles.ctaPrimary, width: "100%", textAlign: "center", marginTop: 18 }} className="ctaGlow ctaEnhanced">
                  Open user flow
                </a>
              </div>

              <div style={{ ...styles.pitchCard, borderColor: "#4d9fff33" }} className="glassCard hoverLift">
                <div style={{ ...styles.pitchLabel, color: "#4d9fff" }}>For companies</div>
                <div style={styles.pitchTitle}>Audience ops that feel premium.</div>
                <div style={styles.pitchText}>
                  Companies never install the consumer extension. Just sign in via Google OAuth, purchase a package, and download immediately.
                </div>
                <div style={styles.pitchBullets}>
                  {[
                    "Segments narrated around intent & affinity",
                    "Purchase receipts + repeatable downloads",
                    "Model-ready payloads for warehouses",
                  ].map((b) => (
                    <div key={b} style={styles.bulletRow}>
                      <span style={{ ...styles.bulletDot, background: "#4d9fff" }} />
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
                <a href="/company" style={{ ...styles.ctaSecondary, width: "100%", textAlign: "center", marginTop: 18 }}>
                  Enter Reclaim Business
                </a>
              </div>
            </aside>
          </div>
        </div>

        {/* Narrative */}
        <section style={{ maxWidth: 1160, margin: "clamp(48px,7vw,88px) auto 0", zIndex: 1, position: "relative" }} aria-labelledby="why-reclaim-title">
          <p className="sectionLabel">Why reclaim exists</p>
          <h2 id="why-reclaim-title" className="sectionLead">
            We split the funnel: payouts for humanity, disciplined packages for marketers.
          </h2>
          <div className="bentoGrid">
            {BENTO.map((b) => (
              <article key={b.title} className={`bentoCell glassCard hoverLift ${b.accent ? "bentoAccent" : ""}`}>
                <p className={`bentoK ${b.kickerCls}`}>{b.kicker}</p>
                <h3 className="bentoTit">{b.title}</h3>
                <p className="bentoTxt">{b.body}</p>
              </article>
            ))}
          </div>

          <div className="paletteStrip" aria-label="Interest categories sampled">
            {palettePairs.map(({ key, c }, i, arr) => {
              const next = arr[(i + 1) % arr.length].c;
              return (
                <span
                  key={key}
                  className="paletteSw"
                  style={{ "--c1": c, "--c2": next }}
                  title={key}
                />
              );
            })}
          </div>
        </section>

        {/* Segments */}
        <section style={{ maxWidth: 1160, margin: "clamp(40px,6vw,72px) auto 0", zIndex: 1, position: "relative" }} aria-labelledby="signal-title">
          <p className="sectionLabel">Signal library</p>
          <h2 id="signal-title" className="sectionLead">
            Category color-coding mirrors the extension—see how attention clusters behave.
          </h2>
          <div className="segmentGrid">
            {SEGMENTS.map((s) => (
              <div key={s.title} className="segmentCard" style={{ borderTop: `3px solid ${s.color}` }}>
                <span className="segmentIcon" style={{ color: s.color }}>
                  {s.emoji}
                </span>
                <div style={{ fontWeight: 800, letterSpacing: -0.3, marginBottom: 8 }}>{s.title}</div>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 12, lineHeight: 1.72, color: "#888" }}>{s.text}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <div style={{ maxWidth: 1160, margin: "clamp(40px,6vw,80px) auto 0", zIndex: 1 }} className="glassCard howWorks">
          <div>
            <p style={styles.cardLabel}>How it works</p>
            <p className="sectionLead" style={{ marginTop: 8 }}>
              Three beats. Enough clarity to trust the stack.
            </p>
          </div>
          <div className="howWorksGrid">
            {[
              { n: "01", t: "Users opt in", d: "Install the extension, sign in with Google, and choose what contextual data earns." },
              { n: "02", t: "Signals become segments", d: "Consent-based journeys condense into exportable packages—not noisy raw logs." },
              { n: "03", t: "Companies buy & iterate", d: "Authenticate, purchase, revisit history, grab CSV or JSON anytime you need refresh." },
            ].map((s) => (
              <div key={s.n} className="stepCardEnhanced">
                <div className="stepNum">{s.n}</div>
                <div style={{ fontWeight: 900, letterSpacing: -0.35, fontSize: "1.05rem", color: "#f4f4f4" }}>{s.t}</div>
                <div style={{ marginTop: 10, fontFamily: "DM Mono, monospace", color: "#888", fontSize: 12, lineHeight: 1.75 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Dual path */}
        <section style={{ maxWidth: 1160, margin: "clamp(32px,5vw,64px) auto 0", zIndex: 1 }} className="glassCard dualPath" aria-labelledby="choose-path-title">
          <p className="sectionLabel">Choose your doorway</p>
          <h2 id="choose-path-title" className="sectionLead" style={{ maxWidth: 720 }}>
            One brand, two velocities: consumer chrome extension versus browser-only enterprise unlock.
          </h2>
          <div className="dualPathCards">
            <div className="pathCard pathUser">
              <span className="pathGlow" />
              <span className="landingBadge">
                Consumer <span aria-hidden="true">·</span>
              </span>
              <h3 className="dualPathTit" style={{ color: "#c9fff3" }}>
                I'm a user
              </h3>
              <p className="dualPathTxt">
                Monetize ethically with transparent tracking of time-on-site milestones, cashback-style rewards, and the ability to course-correct your shared demographics without losing history.
              </p>
              <a href="/user" style={{ ...styles.ctaPrimary, display: "inline-block", marginTop: 22 }} className="ctaGlow ctaEnhanced">
                Start earning
              </a>
            </div>
            <div className="pathCard pathBiz">
              <span className="pathGlow" />
              <span className="landingBadge" style={{ justifyContent: "flex-start", width: "100%" }}>
                <span style={{ color: "#9cc6ff", letterSpacing: 2 }}>Reclaim Business</span>
              </span>
              <h3 className="dualPathTit" style={{ color: "#dbeaff" }}>
                Buy signal packages
              </h3>
              <p className="dualPathTxt">
                Your buyers stay entirely in-browser: Google OAuth handshake, instantaneous purchase stubs, repeatable downloads packaged for experimentation & activation partners.
              </p>
              <a href="/company" style={{ ...styles.ctaSecondary, marginTop: 22 }}>
                Launch dashboards
              </a>
            </div>
          </div>
        </section>

        <div style={{ ...styles.landingFooter, maxWidth: 1160, marginTop: 40 }}>
          <div style={{ ...styles.footerNote, fontSize: 12, maxWidth: 880 }}>
            Built to remain consent-aware, exporter-friendly, and shippable on day one — companies never impersonate everyday users through the extension, and payouts stay tethered to the people powering the graphs.
          </div>
        </div>
      </div>
    </div>
  );
}

function clamp(a, vw, b) {
  const n = typeof b === "string" ? Number.parseFloat(b) : b;
  return `clamp(${a}px, ${vw}, ${n}px)`;
}

function clampGap(isMobile) {
  return isMobile ? 22 : clamp(26, "3vw", 36);
}
