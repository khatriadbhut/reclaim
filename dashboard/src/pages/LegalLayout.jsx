/** Shared chrome for Terms & Privacy (desktop-readable, matches onboarding palette). */
export const LEGAL_LAST_UPDATED = "May 6, 2026";

const CSS = `
  .ldoc {
    min-height: 100vh;
    background: #0d0d0d;
    color: #f0f0f0;
    font-family: 'Syne', system-ui, sans-serif;
    padding: 0 20px 64px;
  }
  @media (min-width: 768px) {
    .ldoc { padding: 0 40px 80px; }
  }
  .ldoc-inner {
    max-width: 720px;
    margin: 0 auto;
  }
  .ldoc-nav {
    padding: 20px 0 8px;
    margin-bottom: 8px;
    border-bottom: 1px solid #2a2a2a;
  }
  @media (min-width: 768px) {
    .ldoc-nav { padding: 28px 0 16px; }
  }
  .ldoc-nav a {
    font-size: 13px;
    font-weight: 700;
    color: #00e5a0;
    text-decoration: none;
  }
  .ldoc-nav a:hover { text-decoration: underline; text-underline-offset: 3px; }
  .ldoc h1 {
    font-size: clamp(26px, 4vw, 34px);
    font-weight: 800;
    letter-spacing: -0.5px;
    line-height: 1.15;
    margin-bottom: 8px;
  }
  .ldoc-meta {
    font-family: 'DM Mono', ui-monospace, monospace;
    font-size: 12px;
    color: #666;
    margin-bottom: 32px;
  }
  .ldoc article {
    font-size: 15px;
    line-height: 1.65;
    color: #c8c8c8;
  }
  @media (min-width: 768px) {
    .ldoc article { font-size: 16px; line-height: 1.7; }
  }
  .ldoc h2 {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #888;
    margin: 36px 0 14px;
  }
  .ldoc h2:first-of-type { margin-top: 0; }
  .ldoc p { margin: 0 0 14px; }
  .ldoc ul {
    margin: 0 0 16px;
    padding-left: 1.25em;
  }
  .ldoc li { margin-bottom: 8px; }
  .ldoc strong { color: #eee; font-weight: 700; }
  .ldoc .muted { color: #666; font-size: 14px; }
  .ldoc article a {
    color: #00e5a0;
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: rgba(0, 229, 160, 0.45);
  }
  .ldoc article a:hover {
    text-decoration-color: #00e5a0;
  }
`;

export default function LegalLayout({ title, children }) {
  return (
    <div className="ldoc">
      <style>{CSS}</style>
      <div className="ldoc-inner">
        <nav className="ldoc-nav" aria-label="Breadcrumb">
          <a href="/">← Reclaim home</a>
        </nav>
        <h1>{title}</h1>
        <p className="ldoc-meta">Last updated: {LEGAL_LAST_UPDATED}</p>
        <article>{children}</article>
      </div>
    </div>
  );
}
