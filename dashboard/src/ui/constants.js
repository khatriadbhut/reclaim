export const BACKEND = "http://localhost:3000";

export const CATEGORY_COLORS = {
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

export function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

export const landingCss = `
.reclaimLanding{ position:relative; overflow:hidden; }
.reveal{ opacity:0; transform: translateY(10px); transition: opacity .55s cubic-bezier(.2,.8,.2,1), transform .55s cubic-bezier(.2,.8,.2,1); will-change: opacity, transform; }
.reveal.in{ opacity:1; transform: translateY(0); }
.revealItem{ opacity:0; transform: translateY(10px); transition: opacity .55s cubic-bezier(.2,.8,.2,1), transform .55s cubic-bezier(.2,.8,.2,1); transition-delay: var(--d, 0ms); will-change: opacity, transform; }
.reveal.in .revealItem{ opacity:1; transform: translateY(0); }
.landingBg{
  position:absolute; inset:-200px;
  background:
    radial-gradient(600px 420px at 20% 20%, rgba(0,229,160,0.14), transparent 60%),
    radial-gradient(560px 420px at 80% 30%, rgba(77,159,255,0.14), transparent 60%),
    radial-gradient(520px 420px at 60% 90%, rgba(181,123,238,0.12), transparent 60%),
    linear-gradient(180deg, #0b0b0b 0%, #0d0d0d 50%, #0b0b0b 100%);
  filter: blur(0px);
  animation: bgShift 14s ease-in-out infinite alternate;
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
.ctaGlow{
  box-shadow: 0 18px 40px rgba(0,229,160,0.10);
  display:inline-flex;
  align-items:center;
  justify-content:center;
  color:#000 !important;
}
.chip{
  font-family: "DM Mono", monospace;
  font-size: 11px;
  color: #cfcfcf;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(18,18,18,0.7);
  padding: 6px 10px;
  border-radius: 999px;
}
.productCard{position:relative;overflow:hidden;}
.productCard::before{
  content:"";position:absolute;inset:-1px;border-radius:16px;pointer-events:none;opacity:.9;
  background:
    radial-gradient(240px 140px at 10% 15%, rgba(0,229,160,0.10), transparent 55%),
    radial-gradient(240px 140px at 95% 20%, rgba(77,159,255,0.10), transparent 55%);
}
.productBiz::before{
  background:
    radial-gradient(240px 140px at 8% 15%, rgba(77,159,255,0.14), transparent 55%),
    radial-gradient(260px 160px at 92% 25%, rgba(181,123,238,0.10), transparent 60%);
}
.miniArt{
  position:relative;height:92px;border:1px solid rgba(255,255,255,0.06);border-radius:18px;overflow:hidden;
  background: rgba(17,17,17,0.45);backdrop-filter: blur(10px);
}
.miniRibbon{
  position:absolute;left:-30%;width:160%;height:28px;border-radius:999px;filter: blur(.2px);opacity:.9;
  transform: skewX(-10deg);mix-blend-mode: screen;
  animation: ribbonFlow 9s ease-in-out infinite alternate, ribbonFloat 6s ease-in-out infinite;
}
.miniRibbon.r0{ top:14px; background: linear-gradient(90deg, transparent, rgba(0,229,160,0.30), rgba(255,255,255,0.08), transparent); animation-duration: 10s, 7s; }
.miniRibbon.r1{ top:40px; background: linear-gradient(90deg, transparent, rgba(77,159,255,0.28), rgba(255,255,255,0.06), transparent); animation-duration: 12s, 6s; opacity:.85; }
.miniRibbon.r2{ top:62px; background: linear-gradient(90deg, transparent, rgba(181,123,238,0.22), rgba(255,255,255,0.05), transparent); animation-duration: 14s, 8s; opacity:.75; }
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
@keyframes wordSwap{ 0%{ opacity:0; transform: translateY(12px); } 14%{ opacity:1; transform: translateY(0); } 86%{ opacity:1; transform: translateY(0); } 100%{ opacity:0; transform: translateY(-10px); } }
@keyframes marquee{ 0%{ transform: translateX(0); } 100%{ transform: translateX(-50%); } }
@keyframes pulseRing{ 0%{ box-shadow: 0 0 0 0 rgba(0,229,160,0.35); } 70%{ box-shadow: 0 0 0 14px rgba(0,229,160,0); } 100%{ box-shadow: 0 0 0 0 rgba(0,229,160,0); } }
@keyframes shimmerLine{ 0%{ opacity: .35; transform: translateX(-100%); } 100%{ opacity: .9; transform: translateX(100%); } }
@keyframes orbDrift{ 0%,100%{ transform: translate(0,0) scale(1); } 50%{ transform: translate(12px,-18px) scale(1.05); } }
@keyframes ribbonFlow{ 0%{ transform: translate3d(-20%,0,0) skewX(-10deg); } 100%{ transform: translate3d(20%,0,0) skewX(-10deg); } }
@keyframes ribbonFloat{ 0%,100%{ transform: translateY(0); } 50%{ transform: translateY(-10px); } }
.landingShell{position:relative;width:100%;}
.landingNav{
  position:sticky;top:0;z-index:20;
  max-width:1160px;margin:0 auto;
  transition: backdrop-filter .25s ease, background .25s ease, border-color .25s ease;
}
.landingNavInner{
  display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:18px 0;border-bottom:1px solid rgba(42,42,42,0.85);
}
.landingNavScrolled .landingNavInner{
  backdrop-filter:saturate(140%) blur(14px);
  background:rgba(11,11,11,0.72);
  border:1px solid rgba(255,255,255,0.06);
  border-radius:14px;padding:14px 18px;margin-top:6px;margin-bottom:4px;
  box-shadow:0 18px 50px rgba(0,0,0,0.35);
}
.landingBadge{
  display:inline-flex;align-items:center;gap:8px;
  font-family:"DM Mono",monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#666;
}
.landingPulseDot{width:8px;height:8px;border-radius:50%;background:#00e5a0;animation:pulseRing 3s ease-out infinite;}
.heroEyebrow{margin-bottom:clamp(16px,3vw,24px);}
.heroTitleBlock{font-size:clamp(2rem, 5vw, 3.35rem);font-weight:900;letter-spacing:-0.035em;line-height:1.05;color:#f0f0f0;margin:0;}
.heroTitleMuted{display:block;color:#cfcfcf;margin-bottom:.12em;}
.heroTitleAccent{display:block;color:#00e5a0;text-shadow:0 0 40px rgba(0,229,160,0.18);min-height:1.05em;}
.heroWordSwap{display:inline-block;animation: wordSwap 2.85s cubic-bezier(.2,.8,.2,1) both;}
.heroSubLead{margin-top:clamp(22px,3.5vw,36px);max-width:36rem;}
.heroSubMuted{font-family:"Syne",sans-serif;font-size:clamp(13px,1.3vw,15px);line-height:1.7;color:#a9a9a9;margin:0;max-width:42rem;}
.heroStatRail{margin-top:clamp(28px,4vw,48px);}
.heroTrustGrid{display:grid;gap:10px;margin-top:clamp(20px,3.5vw,30px);}
.heroTrustRow{
  display:grid;grid-template-columns:90px 1fr;gap:14px;align-items:baseline;
  border-top:1px solid rgba(255,255,255,0.06);
  padding-top:10px;
}
.heroTrustKey{
  font-family:"DM Mono",monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#00e5a0;
}
.heroTrustVal{
  font-family:"DM Mono",monospace;font-size:12px;line-height:1.75;color:#8e8e8e;
}
.heroOrbs{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden;}
.heroOrbWrap{position:relative;}
.heroOrb{position:absolute;top:-120px;right:-12%;width:min(460px,80vw);height:460px;border-radius:50%;
  background:radial-gradient(circle,rgba(0,229,160,0.12) 0%,transparent 68%);
  animation: orbDrift 18s ease-in-out infinite alternate;filter:blur(2px);}
.heroOrbBlue{top:12%;left:-22%;background:radial-gradient(circle,rgba(77,159,255,0.13) 0%,transparent 70%);animation-duration:17s;}
.sectionLabel{font-family:"DM Mono",monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#555;margin:0;}
.sectionLead{margin:.6rem 0 0;font-size:clamp(1.3rem,2.4vw,1.85rem);font-weight:850;letter-spacing:-.03em;line-height:1.15;color:#e8e8e8;}
.bentoGrid{display:grid;gap:clamp(12px,1.5vw,16px);}
@media(min-width:900px){.bentoGrid{grid-template-columns:repeat(2,1fr);}}
.bentoCell{
  border:1px solid rgba(255,255,255,0.06);border-radius:18px;padding:clamp(18px,2.6vw,28px);
  background:linear-gradient(160deg,rgba(21,21,21,.92),rgba(15,15,15,.62));
  position:relative;overflow:hidden;
  transition:border-color .2s ease,transform .2s ease;
}
.bentoCell:hover{border-color:rgba(0,229,160,0.2);transform:translateY(-2px);}
.bentoAccent::before{
  content:"";position:absolute;top:0;right:0;width:160px;height:160px;background:radial-gradient(circle at top right,rgba(181,123,238,0.12),transparent 65%);
}
.bentoK{font-family:"DM Mono",monospace;font-size:10px;letter-spacing:2px;color:#00e5a0;text-transform:uppercase;margin:0;}
.bentoKBlue{color:#4d9fff;}
.bentoTit{margin:12px 0 0;font-size:1.1rem;font-weight:800;color:#fff;letter-spacing:-.03em;line-height:1.2;}
.bentoTxt{margin:12px 0 0;font-family:"DM Mono",monospace;font-size:12px;line-height:1.75;color:#888;}
.paletteStrip{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;}
.paletteStripTight{ margin-top: 0; opacity: .75; }
.paletteSw{border-radius:999px;height:10px;width:62px;background:linear-gradient(90deg,var(--c1),var(--c2));opacity:.85;border:1px solid rgba(255,255,255,0.12);}
.segmentGrid{display:grid;gap:12px;margin-top:clamp(20px,3vw,32px);}
@media(min-width:900px){.segmentGrid{grid-template-columns:repeat(3,1fr);}}
.segmentCard{
  border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:clamp(16px,2vw,20px);
  background:rgba(18,18,18,0.6);transition:background .18s ease,border-color .18s ease;
}
.segmentCard:hover{border-color:rgba(77,159,255,0.22);background:rgba(21,26,34,0.65);}
.segmentIcon{font-family:"DM Mono",monospace;font-size:22px;line-height:1;margin-bottom:12px;display:block;}
.howWorks{padding:clamp(22px,3vw,32px);}
.howWorksGrid{display:grid;gap:clamp(14px,2vw,20px);margin-top:clamp(16px,2.5vw,24px);}
@media(min-width:900px){.howWorksGrid{grid-template-columns:repeat(3,1fr);position:relative}}
.stepCardEnhanced{
  border:1px solid rgba(255,255,255,0.08);background:rgba(18,18,18,0.55);
  padding:clamp(18px,2vw,22px);border-radius:16px;position:relative;
  transition:transform .18s ease,border-color .18s ease;
}
.stepCardEnhanced:hover{border-color:rgba(0,229,160,0.22);transform:translateY(-2px);}
.stepNum{
  font-family:"DM Mono",monospace;font-size:10px;font-weight:700;letter-spacing:2px;color:#00e5a0;border:1px solid rgba(0,229,160,0.25);
  display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;
  background:rgba(22,22,22,0.9);margin-bottom:12px;
}
.linkBtn{
  transition:color .18s ease, border-color .18s ease, transform .14s ease, box-shadow .18s ease;
}
.linkBtn:hover{border-color:rgba(255,255,255,0.18)!important;color:#ccc!important;transform:translateY(-1px);}
.ctaPrimary.ctaEnhanced{position:relative;overflow:hidden;}
.ctaPrimary.ctaEnhanced::after{
  content:"";position:absolute;inset:auto -40% 0 -40%;height:120%;top:100%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent);
  animation:shimmerLine 3.2s ease-in-out infinite;
}
.dualPath{padding:clamp(24px,3.5vw,36px);}
.dualPathCards{display:grid;gap:16px;margin-top:20px;}
@media(min-width:900px){.dualPathCards{grid-template-columns:1fr 1fr;gap:18px}}
.pathCard{border-radius:22px;padding:clamp(22px,3vw,32px);position:relative;overflow:hidden;}
.pathUser{border:1px solid rgba(0,229,160,0.22);background:linear-gradient(160deg,rgba(0,229,160,0.10),rgba(17,17,17,0.85));}
.pathBiz{border:1px solid rgba(77,159,255,0.28);background:linear-gradient(160deg,rgba(77,159,255,0.10),rgba(17,17,17,0.85));}
.pathGlow{position:absolute;width:420px;height:420px;top:-230px;right:-180px;background:radial-gradient(circle,rgba(255,255,255,0.06),transparent 65%);pointer-events:none;}
.dualPathTit{margin:14px 0 0;font-size:clamp(1.45rem,2.8vw,1.85rem);font-weight:950;letter-spacing:-.035em;line-height:1;}
.dualPathTxt{margin-top:14px;font-family:"DM Mono",monospace;font-size:12px;line-height:1.8;color:#9a9a9a;}

@media (prefers-reduced-motion: reduce) {
 .landingBg, .landingGridOverlay, .landingPulseDot, .heroWordSwap { animation: none !important; }
 .miniRibbon{ animation: none !important; }
 .reveal, .revealItem{ transition: none !important; transform: none !important; opacity: 1 !important; }
 .ctaPrimary.ctaEnhanced::after { display: none; }
 .hoverLift:hover, .stepCardEnhanced:hover, .bentoCell:hover { transform: none; }
}
`;

export const navIcons = {
  overview: "◈",
  browsing: "◉",
  wallet: "◎",
};

export const styles = {
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

