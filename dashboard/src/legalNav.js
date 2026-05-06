/** Chrome extension public IDs are 32 chars (hex alphabet a–p). */
const EXT_PUBLIC_ID_RE = /^[a-p]{32}$/;

export function getExtFromLocation() {
  if (typeof window === "undefined") return null;
  const ext = new URLSearchParams(window.location.search).get("ext");
  if (ext && EXT_PUBLIC_ID_RE.test(ext)) return ext;
  return null;
}

function getExtFromEnv() {
  const id = import.meta.env?.VITE_RECLAIM_EXTENSION_ID || "";
  return id && EXT_PUBLIC_ID_RE.test(id) ? id : null;
}

/** First page of extension onboarding, or website `/` if extension id is unknown. */
export function getLegalBackHomeHref() {
  const fromQuery = getExtFromLocation();
  if (fromQuery) return `chrome-extension://${fromQuery}/onboarding/onboarding.html`;
  const fromEnv = getExtFromEnv();
  if (fromEnv) return `chrome-extension://${fromEnv}/onboarding/onboarding.html`;
  return "/";
}

/** Preserve `?ext=` when linking between Terms and Privacy. */
export function legalPath(path) {
  const ext = getExtFromLocation();
  if (!ext) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}ext=${encodeURIComponent(ext)}`;
}

export function legalNavLabel(href) {
  return href.startsWith("chrome-extension:") ? "← Extension setup" : "← Reclaim home";
}
