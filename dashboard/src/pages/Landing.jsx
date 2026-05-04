import { useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────
   ROTATING HERO WORDS
───────────────────────────────────────── */
const ROTATING_ENDINGS = ["payouts.", "privacy.", "control.", "safety.", "fairness."];

/* ─────────────────────────────────────────
   TRUST ITEMS
───────────────────────────────────────── */
const TRUST = [
  { k: "Opt‑in",       v: "You choose what's shared" },
  { k: "Anonymous",    v: "No names sold" },
  { k: "Transparent",  v: "See every dollar" },
  { k: "Safe",         v: "Privacy-first design" },
];

/* ─────────────────────────────────────────
   PRODUCT CARDS
───────────────────────────────────────── */
const PRODUCT_CARDS = [
  {
    id: "users",
    tag: "// reclaim consumer",
    tone: "user",
    title: "Get paid.\nStay anonymous.",
    body: "Opt in. Share browsing signals. Watch earnings accumulate — no names, no tracking, no catch.",
    bullets: ["opt-in only", "anonymous", "visible earnings", "full control"],
    href: "/user",
    cta: "Start earning →",
  },
  {
    id: "business",
    tag: "// reclaim business",
    tone: "biz",
    title: "Buy intent.\nNot identities.",
    body: "Access privacy-safe, opt-in browsing signals — aggregated by category, zero identity tracking.",
    bullets: ["intent segments", "anonymized", "no PII"],
    href: "/company",
    cta: "Explore packages →",
  },
];

/* ─────────────────────────────────────────
   HOW-IT-WORKS STEPS
───────────────────────────────────────── */
const STEPS = [
  { n: "01", icon: "⬡", t: "Opt in",    d: "Choose exactly what you share. Nothing runs without your say." },
  { n: "02", icon: "◎", t: "Anonymize", d: "Signals are stripped + aggregated. No identities ever sold." },
  { n: "03", icon: "⬖", t: "Exchange",  d: "Users earn. Businesses buy privacy-safe packages." },
];

/* ─────────────────────────────────────────
   INLINE CSS  (drop into a <style> tag)
───────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --g:   #00e5a0;
    --g2:  #00b87a;
    --g3:  #00ff99;
    --bl:  #4d9fff;
    --bg:  #0a0a0a;
    --bg2: #111111;
    --bg3: #181818;
    --muted: #666;
    --border-g:  rgba(0,229,160,0.18);
    --border-bl: rgba(77,159,255,0.22);
  }

  /* ── WRAPPER ── */
  .rclWrap {
    background: var(--bg);
    font-family: 'Space Grotesk', sans-serif;
    color: #f0f0f0;
    min-height: 100vh;
    position: relative;
    overflow-x: hidden;
  }

  /* ── BACKGROUND LAYERS ── */
  .rclBg { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }

  .rclGrid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(0,229,160,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,229,160,0.04) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  .rclOrb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.18;
    animation: rclOrbFloat 8s ease-in-out infinite;
  }
  .rclOrb1 { width: 560px; height: 560px; background: var(--g);  top: -140px; left: -140px; animation-delay: 0s; }
  .rclOrb2 { width: 420px; height: 420px; background: var(--bl); top:   50px; right: -120px; animation-delay: -3s; }
  .rclOrb3 { width: 320px; height: 320px; background: var(--g);  bottom: 100px; left: 30%; animation-delay: -5s; opacity: 0.09; }

  @keyframes rclOrbFloat {
    0%,100% { transform: translate(0,0) scale(1); }
    50%      { transform: translate(20px,28px) scale(1.06); }
  }

  .rclScanline {
    position: absolute; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, rgba(0,229,160,0.35), transparent);
    animation: rclScan 7s linear infinite;
    pointer-events: none;
  }
  @keyframes rclScan {
    0%   { top: 0;    opacity: 0.8; }
    100% { top: 100%; opacity: 0; }
  }

  .rclSig {
    position: absolute; height: 1px;
    background: linear-gradient(90deg, transparent, var(--g), transparent);
    opacity: 0;
    animation: rclSigSlide 5s ease-in-out infinite;
  }
  @keyframes rclSigSlide {
    0%   { opacity: 0; transform: scaleX(0) translateX(-50%); }
    30%  { opacity: 0.4; transform: scaleX(1) translateX(0); }
    70%  { opacity: 0.4; }
    100% { opacity: 0; transform: scaleX(0) translateX(50%); }
  }

  .rclHexDec {
    position: absolute;
    font-family: 'Space Mono', monospace;
    font-size: 10px;
    color: var(--g);
    letter-spacing: 2px;
    animation: rclHexFade 4s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes rclHexFade {
    0%,100% { opacity: 0.03; }
    50%      { opacity: 0.09; }
  }

  /* particles injected via JS */
  .rclPt {
    position: absolute;
    border-radius: 50%;
    opacity: 0;
    animation: rclPtRise linear infinite;
  }
  @keyframes rclPtRise {
    0%   { transform: translateY(0)     scale(0); opacity: 0; }
    10%  { transform: translateY(-20px) scale(1); opacity: 0.7; }
    90%  { opacity: 0.3; }
    100% { transform: translateY(-600px) scale(0); opacity: 0; }
  }

  /* ── SHELL ── */
  .rclShell { position: relative; z-index: 5; max-width: 900px; margin: 0 auto; padding: 0 24px; }

  /* ── NAV ── */
  .rclNav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    position: sticky; top: 0; z-index: 50;
    background: rgba(10,10,10,0.85);
    backdrop-filter: blur(14px);
  }

  .rclLogo {
    font-family: "Syne", sans-serif;
    font-size: 22px; font-weight: 800;
    letter-spacing: -0.5px; color: var(--g);
    text-decoration: none;
  }
  .rclLogo span { color: #f0f0f0; }

  .rclLogoDot {
    display: inline-block;
    width: 7px; height: 7px;
    background: var(--g); border-radius: 50%;
    margin-left: 4px; vertical-align: middle;
    position: relative; top: -1px;
    animation: rclBlink 2s ease-in-out infinite;
  }
  @keyframes rclBlink { 0%,100%{opacity:1;} 50%{opacity:0.25;} }

  .rclNavLinks { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

  .rclNavBtn {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13px; font-weight: 500;
    padding: 7px 16px; border-radius: 8px;
    border: 1px solid; cursor: pointer;
    text-decoration: none; letter-spacing: 0.3px;
    transition: background 0.2s;
  }
  .rclNavBtn--u { border-color: rgba(0,229,160,0.4); color: var(--g);  background: rgba(0,229,160,0.06); }
  .rclNavBtn--u:hover { background: rgba(0,229,160,0.15); }
  .rclNavBtn--b { border-color: rgba(77,159,255,0.4); color: var(--bl); background: rgba(77,159,255,0.06); }
  .rclNavBtn--b:hover { background: rgba(77,159,255,0.15); }

  /* ── HERO ── */
  .rclHero {
    text-align: center;
    padding: 56px 24px 36px;
    position: relative; z-index: 5;
  }

  .rclEyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: 'Space Mono', monospace;
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    color: var(--g);
    background: rgba(0,229,160,0.08);
    border: 1px solid rgba(0,229,160,0.22);
    padding: 6px 16px; border-radius: 20px;
    margin-bottom: 30px;
    animation: rclFadeUp 0.8s ease both;
  }
  .rclPulse {
    width: 6px; height: 6px;
    background: var(--g); border-radius: 50%;
    animation: rclBlink 1.5s infinite;
  }

  .rclH1 {
    font-size: clamp(32px, 5.5vw, 58px);
    font-weight: 700; line-height: 1.1;
    letter-spacing: -2px; margin-bottom: 14px;
    animation: rclFadeUp 0.8s 0.08s ease both;
  }
  .rclH1Muted { color: #555; }

  .rclWordSwap {
    display: inline-block;
    color: var(--g);
    position: relative;
    animation: rclWordIn 0.4s ease both;
  }
  .rclWordSwap::after {
    content: '';
    position: absolute; bottom: -4px; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--g), transparent);
    border-radius: 2px;
  }
  @keyframes rclWordIn {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .rclHeroSub {
    font-size: 16px; color: var(--muted);
    max-width: 440px; margin: 0 auto 40px;
    line-height: 1.75;
    animation: rclFadeUp 0.8s 0.18s ease both;
  }

  @keyframes rclFadeUp {
    from { opacity: 0; transform: translateY(22px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── PRODUCT CARDS ── */
  .rclCards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    position: relative; z-index: 5;
    padding: 0 24px 52px;
    max-width: 900px; margin: 0 auto;
  }
  @media (max-width: 680px) {
    .rclCards { grid-template-columns: 1fr; }
  }

  .rclCard {
    background: var(--bg2);
    border-radius: 20px; padding: 32px 28px;
    position: relative; overflow: hidden;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    animation: rclFadeUp 0.8s ease both;
  }
  .rclCard:hover { transform: translateY(-6px); }
  .rclCard--u { border: 1px solid var(--border-g); animation-delay: 0.28s; }
  .rclCard--u:hover { box-shadow: 0 28px 64px rgba(0,229,160,0.13); }
  .rclCard--b { border: 1px solid var(--border-bl); animation-delay: 0.38s; }
  .rclCard--b:hover { box-shadow: 0 28px 64px rgba(77,159,255,0.13); }

  .rclCardGlow {
    position: absolute; width: 200px; height: 200px;
    border-radius: 50%; top: -70px; right: -70px;
    filter: blur(70px); opacity: 0.18; pointer-events: none;
  }
  .rclCard--u .rclCardGlow { background: var(--g); }
  .rclCard--b .rclCardGlow { background: var(--bl); }

  .rclCardArt {
    position: absolute; bottom: 0; right: 0;
    opacity: 0.055; pointer-events: none;
  }

  .rclCardTag {
    font-family: 'Space Mono', monospace;
    font-size: 10px; letter-spacing: 2px; text-transform: lowercase;
    margin-bottom: 20px; display: block;
  }
  .rclCardTag--u { color: var(--g); }
  .rclCardTag--b { color: var(--bl); }

  .rclCardIcon {
    width: 48px; height: 48px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; margin-bottom: 20px;
  }
  .rclCardIcon--u { background: rgba(0,229,160,0.1); border: 1px solid rgba(0,229,160,0.22); }
  .rclCardIcon--b { background: rgba(77,159,255,0.1); border: 1px solid rgba(77,159,255,0.22); }

  .rclCardTitle {
    font-size: 21px; font-weight: 700;
    letter-spacing: -0.5px; line-height: 1.2;
    margin-bottom: 12px; white-space: pre-line;
  }

  .rclCardBody {
    font-size: 13px; color: var(--muted);
    line-height: 1.75; margin-bottom: 20px;
  }

  .rclChips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 24px; }
  .rclChip {
    font-family: 'Space Mono', monospace;
    font-size: 10px; padding: 4px 10px;
    border-radius: 20px; letter-spacing: 0.5px;
  }
  .rclChip--u { background: rgba(0,229,160,0.08); border: 1px solid rgba(0,229,160,0.22); color: var(--g); }
  .rclChip--b { background: rgba(77,159,255,0.08); border: 1px solid rgba(77,159,255,0.22); color: var(--bl); }

  .rclCta {
    display: block; text-align: center;
    padding: 12px 0; border-radius: 10px;
    font-weight: 700; font-size: 14px;
    letter-spacing: 0.3px; text-decoration: none;
    transition: all 0.2s; cursor: pointer;
  }
  .rclCta--u { background: var(--g); color: var(--bg); }
  .rclCta--u:hover { background: var(--g3); }
  .rclCta--b { background: transparent; color: var(--bl); border: 1px solid rgba(77,159,255,0.4); }
  .rclCta--b:hover { background: rgba(77,159,255,0.1); }

  /* ── HOW IT WORKS ── */
  .rclHow {
    position: relative; z-index: 5;
    max-width: 900px; margin: 0 auto;
    padding: 0 24px 52px;
  }

  .rclSectionLabel {
    font-family: 'Space Mono', monospace;
    font-size: 10px; letter-spacing: 3px;
    text-transform: uppercase; color: #3a3a3a;
    text-align: center; margin-bottom: 32px;
  }

  .rclSteps {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 12px; position: relative;
  }
  @media (max-width: 600px) {
    .rclSteps { grid-template-columns: 1fr; }
    .rclConnector { display: none; }
  }

  .rclConnector {
    position: absolute; top: 34px; height: 1px;
  }
  .rclConnector1 {
    left: calc(33.33% - 6px); width: calc(33.33% + 12px);
    background: linear-gradient(90deg, rgba(0,229,160,0.3), rgba(0,229,160,0.1));
  }
  .rclConnector2 {
    left: calc(66.66% - 6px); width: calc(33.33%);
    background: linear-gradient(90deg, rgba(0,229,160,0.1), rgba(77,159,255,0.3));
  }

  .rclStep {
    background: var(--bg2);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px; padding: 24px 20px;
    text-align: center;
    transition: border-color 0.3s;
  }
  .rclStep:hover { border-color: rgba(0,229,160,0.25); }

  .rclStepNum {
    font-family: 'Space Mono', monospace;
    font-size: 11px; color: var(--g);
    letter-spacing: 1px; margin-bottom: 12px;
  }
  .rclStepIcon { font-size: 26px; display: block; margin-bottom: 12px; }
  .rclStepTitle { font-size: 15px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.3px; }
  .rclStepDesc {
    font-size: 12px; color: #555; line-height: 1.6;
    font-family: 'Space Mono', monospace;
  }

  /* ── TRUST STRIP ── */
  .rclTrust {
    position: relative; z-index: 5;
    display: flex; flex-wrap: wrap;
    max-width: 900px; margin: 0 auto;
    padding: 0 24px 52px;
  }
  .rclTrustItem {
    flex: 1; min-width: 140px;
    text-align: center; padding: 20px 14px;
    border-top: 1px solid rgba(0,229,160,0.15);
  }
  .rclTrustItem:not(:last-child) { border-right: 1px solid rgba(255,255,255,0.05); }
  .rclTrustK {
    font-family: 'Space Mono', monospace;
    font-size: 10px; letter-spacing: 2px;
    text-transform: uppercase; color: var(--g);
    margin-bottom: 4px;
  }
  .rclTrustV { font-size: 12px; color: #555; }

  /* ── FOOTER ── */
  .rclFooter {
    position: relative; z-index: 5;
    text-align: center;
    padding: 20px 24px 36px;
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .rclFooterNote {
    font-family: 'Space Mono', monospace;
    font-size: 10px; color: #333;
    letter-spacing: 0.5px; line-height: 1.9;
  }
`;

/* ─────────────────────────────────────────
   HOOKS
───────────────────────────────────────── */
function useWordRotator(words, intervalMs = 3000) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs);
    return () => clearInterval(id);
  }, [words, intervalMs]);
  return index;
}

function useMediaQueryMobile() {
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return vw < 680;
}

/* ─────────────────────────────────────────
   LANDING COMPONENT
───────────────────────────────────────── */
export default function Landing() {
  const wordIndex = useWordRotator(ROTATING_ENDINGS);
  const isMobile  = useMediaQueryMobile();
  const ptsRef    = useRef(null);

  /* spawn floating particles once */
  useEffect(() => {
    const container = ptsRef.current;
    if (!container) return;
    for (let i = 0; i < 20; i++) {
      const el = document.createElement("div");
      el.className = "rclPt";
      el.style.cssText = [
        `left:${Math.random() * 100}%`,
        `bottom:${Math.random() * 40}%`,
        `width:${Math.random() > 0.65 ? 3 : 2}px`,
        `height:${Math.random() > 0.65 ? 3 : 2}px`,
        `background:${Math.random() > 0.5 ? "#00e5a0" : "#4d9fff"}`,
        `animation-duration:${5 + Math.random() * 8}s`,
        `animation-delay:-${Math.random() * 10}s`,
      ].join(";");
      container.appendChild(el);
    }
  }, []);

  return (
    <div className="rclWrap">
      <style>{CSS}</style>

      {/* ── BACKGROUND ART ── */}
      <div className="rclBg">
        <div className="rclGrid" />
        <div className="rclOrb rclOrb1" />
        <div className="rclOrb rclOrb2" />
        <div className="rclOrb rclOrb3" />
        <div className="rclScanline" />
        {/* signal pulses */}
        <div className="rclSig" style={{ top: "18%", left: "4%",  width: 220, animationDelay: "0s"  }} />
        <div className="rclSig" style={{ top: "43%", left: "62%", width: 160, animationDelay: "-2s" }} />
        <div className="rclSig" style={{ top: "70%", left: "22%", width: 190, animationDelay: "-4s" }} />
        {/* hex decorations */}
        <div className="rclHexDec" style={{ top: "11%",   left: "3%",   animationDelay: "0s"    }}>0x4F2C</div>
        <div className="rclHexDec" style={{ top: "31%",   right: "4%",  animationDelay: "-1.5s" }}>0xA1B9</div>
        <div className="rclHexDec" style={{ top: "61%",   left: "4%",   animationDelay: "-3s"   }}>0xE2F7</div>
        <div className="rclHexDec" style={{ bottom: "18%", right: "5%", animationDelay: "-2s"   }}>0x3D8C</div>
        {/* particle container */}
        <div ref={ptsRef} style={{ position: "absolute", inset: 0 }} />
      </div>

      {/* ── NAV ── */}
      <nav className="rclNav" aria-label="Primary">
        <a href="/" className="rclLogo" aria-label="Reclaim home">
          re<span>claim</span>
          <span className="rclLogoDot" aria-hidden="true" />
        </a>
        <div className="rclNavLinks">
          <a href="#users"    className="rclNavBtn rclNavBtn--u">For users</a>
          <a href="#business" className="rclNavBtn rclNavBtn--b">For business</a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="rclHero" aria-labelledby="hero-title">
        <div className="rclEyebrow" role="text">
          <span className="rclPulse" aria-hidden="true" />
          privacy-first monetization · opt-in only
        </div>

        <h1 className="rclH1" id="hero-title">
          <span className="rclH1Muted">Turn browsing into</span>
          <br />
          <span
            className="rclWordSwap"
            key={ROTATING_ENDINGS[wordIndex]}
            aria-live="polite"
          >
            {ROTATING_ENDINGS[wordIndex]}
          </span>
        </h1>

        <p className="rclHeroSub">
          Two products. One promise: your data stays yours.
        </p>
      </section>

      {/* ── PRODUCT CARDS ── */}
      <div className="rclCards">
        {PRODUCT_CARDS.map((p) => {
          const isU = p.tone === "user";
          return (
            <div
              key={p.id}
              id={p.id}
              className={`rclCard rclCard--${isU ? "u" : "b"}`}
            >
              {/* decorative glow + circuit art */}
              <div className="rclCardGlow" aria-hidden="true" />
              <svg
                className="rclCardArt"
                width={160}
                height={140}
                viewBox="0 0 160 140"
                fill="none"
                aria-hidden="true"
              >
                {isU ? (
                  <>
                    <circle cx="140" cy="20" r="60" stroke="#00e5a0" strokeWidth="0.5" />
                    <circle cx="140" cy="20" r="40" stroke="#00e5a0" strokeWidth="0.5" />
                    <circle cx="140" cy="20" r="20" stroke="#00e5a0" strokeWidth="0.5" />
                    <line x1="80" y1="0"  x2="80"  y2="140" stroke="#00e5a0" strokeWidth="0.3" />
                    <line x1="0"  y1="80" x2="160" y2="80"  stroke="#00e5a0" strokeWidth="0.3" />
                  </>
                ) : (
                  <>
                    <rect x="80" y="0"  width="80" height="80" rx="4" stroke="#4d9fff" strokeWidth="0.5" />
                    <rect x="90" y="10" width="60" height="60" rx="2" stroke="#4d9fff" strokeWidth="0.3" />
                    <line x1="80" y1="80" x2="160" y2="140" stroke="#4d9fff" strokeWidth="0.3" />
                    <line x1="160" y1="80" x2="80" y2="140"  stroke="#4d9fff" strokeWidth="0.3" />
                    <circle cx="120" cy="40" r="3" fill="#4d9fff" opacity="0.5" />
                  </>
                )}
              </svg>

              <span className={`rclCardTag rclCardTag--${isU ? "u" : "b"}`}>{p.tag}</span>

              <div className={`rclCardIcon rclCardIcon--${isU ? "u" : "b"}`} aria-hidden="true">
                {isU ? "◈" : "◇"}
              </div>

              <div className="rclCardTitle">{p.title}</div>
              <div className="rclCardBody">{p.body}</div>

              <div className="rclChips">
                {p.bullets.map((b) => (
                  <span key={b} className={`rclChip rclChip--${isU ? "u" : "b"}`}>
                    {b}
                  </span>
                ))}
              </div>

              <a
                href={p.href}
                className={`rclCta rclCta--${isU ? "u" : "b"}`}
              >
                {p.cta}
              </a>
            </div>
          );
        })}
      </div>

      {/* ── HOW IT WORKS ── */}
      <section className="rclHow" aria-label="How it works">
        <p className="rclSectionLabel">— how it works —</p>
        <div className="rclSteps">
          <div className="rclConnector rclConnector1" aria-hidden="true" />
          <div className="rclConnector rclConnector2" aria-hidden="true" />
          {STEPS.map((s, i) => (
            <div key={s.n} className="rclStep">
              <div className="rclStepNum">{s.n}</div>
              <span className="rclStepIcon" aria-hidden="true">{s.icon}</span>
              <div className="rclStepTitle">{s.t}</div>
              <div className="rclStepDesc">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TRUST STRIP ── */}
      <div className="rclTrust" role="list" aria-label="Trust signals">
        {TRUST.map((t) => (
          <div key={t.k} className="rclTrustItem" role="listitem">
            <div className="rclTrustK">{t.k}</div>
            <div className="rclTrustV">{t.v}</div>
          </div>
        ))}
      </div>

      {/* ── FOOTER ── */}
      <footer className="rclFooter">
        <div className="rclFooterNote">
          consent-aware · privacy-safe · payouts to signal owners · businesses buy anonymized only
        </div>
      </footer>
    </div>
  );
}
