/**
 * Two buyer SKUs: activation (minimal PII / no raw search) vs analytics (wider).
 */

export const EXPORT_PROFILES = /** @type {const} */ (["analytics", "activation"]);

/** Keys removed for activation CSV/JSON rows (derived intent tiers stay). */
export const ACTIVATION_STRIP_KEYS = [
  "search_queries",
  "all_search_queries",
  "late_night_search_queries",
  "intent_search_queries",
  "shopping_query_keyword_hits",
  "cross_platform_query_keyword_hits",
  "intent_query_keyword_hits",
  "content_query_keyword_hits",
  "finance_query_keyword_hits",
  "tech_query_keyword_hits",
  "property_query_keyword_hits",
  "late_night_query_keyword_hits",
  "breadcrumbs",
  "prices_viewed",
  "prices_found",
  "price_ranges_viewed",
  "top_other_domains",
  "finance_platforms_visited",
  "property_platforms_visited",
  "tech_tools_used",
  "keywords",
  "finance_domains_visited",
  "intent_domains_visited",
  "prices_raw",
];

const ACTIVATION_STRIP = new Set(ACTIVATION_STRIP_KEYS);

/** Must never appear in activation rows post-profile (audit / contract tooling). */
export const BANNED_FROM_ACTIVATION_ROWS = [
  "search_queries",
  "intent_search_queries",
  "all_search_queries",
  "prices_found",
  "price_ranges_viewed",
  "prices_raw",
  "finance_platforms_visited",
  "property_platforms_visited",
  "breadcrumbs",
  "keywords",
  "finance_domains_visited",
];

export function normalizeExportProfile(v) {
  const s = String(v || "analytics").toLowerCase();
  return s === "activation" ? "activation" : "analytics";
}

export function applyExportProfile(rows, profile) {
  const p = normalizeExportProfile(profile);
  if (p !== "activation" || !Array.isArray(rows)) return rows;
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const out = { ...row };
    for (const k of ACTIVATION_STRIP) {
      if (k in out) delete out[k];
    }
    return out;
  });
}
