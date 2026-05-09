import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { classifyTaxonomyName } from "./whoisXmlTaxonomyClassify.js";

const WHOISXML_ENDPOINT = "https://website-categorization.whoisxmlapi.com/api/v3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WHOISXML_ID_ROLLUP = JSON.parse(fs.readFileSync(path.join(__dirname, "whoisXmlIdRollup.json"), "utf8"));

/** Backwards-compatible name for callers; delegates to full taxonomy classifier. */
function mapWhoisXmlCategoryToReclaim(name) {
  return classifyTaxonomyName(name);
}

function rollupForWhoisRow(id, name) {
  if (id === 0 || id === "0") return null;
  const key = id != null ? String(id) : "";
  if (key && Object.prototype.hasOwnProperty.call(WHOISXML_ID_ROLLUP, key)) {
    const v = WHOISXML_ID_ROLLUP[key];
    if (v != null) return v;
  }
  return classifyTaxonomyName(name);
}

/**
 * Maps vendor categories → Reclaim rollup using:
 * 1) Static id → rollup table (full official taxonomy; regenerated via scripts/build-whois-rollup-map.mjs)
 * 2) Confidence-weighted votes across all qualifying rows (handles noisy secondary tags)
 * 3) classifyTaxonomyName() fallback for new IDs / labels
 */
export function pickStrictWhoisMapping(categories, minConfidence) {
  if (!Array.isArray(categories) || categories.length === 0) return null;
  const min = typeof minConfidence === "number" ? minConfidence : 0.6;
  const ranked = categories
    .filter((c) => c && typeof c === "object")
    .map((c) => ({
      id: c.id,
      name: String(c.name || "").trim(),
      confidence: typeof c.confidence === "number" ? c.confidence : null,
    }))
    .filter((c) => c.name && c.confidence != null && c.confidence > 0 && c.confidence >= min)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  const agg = new Map();

  for (const c of ranked) {
    const rollup = rollupForWhoisRow(c.id, c.name);
    if (!rollup) continue;
    const conf = c.confidence || 0;
    const cur = agg.get(rollup) || { sum: 0, maxConf: -1, bestRow: null };
    cur.sum += conf;
    if (conf > cur.maxConf) {
      cur.maxConf = conf;
      cur.bestRow = { id: c.id, name: c.name };
    }
    agg.set(rollup, cur);
  }

  if (!agg.size) return null;

  const sorted = [...agg.entries()].sort((a, b) => {
    if (b[1].sum !== a[1].sum) return b[1].sum - a[1].sum;
    return b[1].maxConf - a[1].maxConf;
  });

  const [winCat, winData] = sorted[0];
  if (!winData.bestRow) return null;

  // Near-tie between top two rollups: trust the single highest-confidence vendor row instead of summed vote.
  if (sorted.length >= 2) {
    const second = sorted[1][1];
    const sumGap = winData.sum - second.sum;
    const confGap = winData.maxConf - second.maxConf;
    if (sumGap < 0.12 && confGap < 0.08) {
      for (const c of ranked) {
        const r = rollupForWhoisRow(c.id, c.name);
        if (r) {
          const conf = c.confidence || 0;
          return {
            category: r,
            confidence: conf,
            iab: { id: c.id, name: c.name },
            registryPin: conf >= 0.78,
          };
        }
      }
      return null;
    }
  }

  const sumGap2 = sorted.length >= 2 ? winData.sum - sorted[1][1].sum : 1;
  const registryPin =
    winData.maxConf >= 0.72 && (sorted.length === 1 || sumGap2 >= 0.16);

  return { category: winCat, confidence: winData.maxConf, iab: winData.bestRow, registryPin };
}

export { mapWhoisXmlCategoryToReclaim };

export async function whoisXmlLookup({ apiKey, urlOrDomain }) {
  const target = String(urlOrDomain || "").trim();
  if (!apiKey || !target) return { ok: false, error: "missing apiKey or urlOrDomain" };

  const url = new URL(WHOISXML_ENDPOINT);
  url.searchParams.set("apiKey", apiKey);
  const asUrl = target.startsWith("http://") || target.startsWith("https://") ? target : `https://${target}/`;
  url.searchParams.set("url", asUrl);

  const res = await fetch(url.toString(), { method: "GET" });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: (json && json.message) || text || "whoisxml lookup failed", raw: json };
  }
  return { ok: true, raw: json };
}
