/**
 * Rollup-based + IAB Content Taxonomy tier-1 time segments for exports and profile.
 */

export function tier1FromSession(s, taxonomyById) {
  const ic = s?.iab_content;
  const pid = s?.iab_content_primary_id != null ? String(s.iab_content_primary_id) : null;
  if (ic && Array.isArray(ic.mappings)) {
    const hit = pid ? ic.mappings.find((m) => String(m?.iab_content?.id) === pid) : null;
    const m = hit || ic.mappings[0];
    const t1 = m?.iab_content?.tier1;
    if (t1) return t1;
  }
  if (pid && taxonomyById?.has(pid)) {
    return taxonomyById.get(pid).tier1 || null;
  }
  return null;
}

export function accumulateIabContentTier1Seconds(sessions, taxonomyById) {
  const tier1Seconds = {};
  let totalIabLabeledSeconds = 0;
  for (const day of Object.values(sessions || {})) {
    for (const s of Object.values(day || {})) {
      const w = s.totalSeconds || 0;
      if (!w) continue;
      const t1 = tier1FromSession(s, taxonomyById);
      if (!t1) continue;
      tier1Seconds[t1] = (tier1Seconds[t1] || 0) + w;
      totalIabLabeledSeconds += w;
    }
  }
  return { tier1Seconds, totalIabLabeledSeconds };
}

const IAB_TIER1_RULES = [
  { id: "iab_automotive_intender", tier1: "Automotive", min: 600 },
  { id: "iab_business_finance_core", tier1: "Business and Finance", min: 900 },
  { id: "iab_personal_finance_core", tier1: "Personal Finance", min: 600 },
  { id: "iab_career_active", tier1: "Careers", min: 600 },
  { id: "iab_education_seeker", tier1: "Education", min: 600 },
  { id: "iab_entertainment_fan", tier1: "Entertainment", min: 1200 },
  { id: "iab_food_drink_enthusiast", tier1: "Food & Drink", min: 900 },
  { id: "iab_gaming_enthusiast", tier1: "Video Gaming", min: 900 },
  { id: "iab_health_wellness", tier1: "Healthy Living", min: 900 },
  { id: "iab_medical_health_interest", tier1: "Medical Health", min: 900 },
  { id: "iab_home_garden", tier1: "Home & Garden", min: 600 },
  { id: "iab_pets_interest", tier1: "Pets", min: 450 },
  { id: "iab_politics_news_engaged", tier1: "Politics", min: 600 },
  { id: "iab_real_estate_intender", tier1: "Real Estate", min: 600 },
  { id: "iab_shopping_core", tier1: "Shopping", min: 1200 },
  { id: "iab_sports_fan", tier1: "Sports", min: 900 },
  { id: "iab_style_fashion", tier1: "Style & Fashion", min: 900 },
  { id: "iab_technology_core", tier1: "Technology & Computing", min: 1800 },
  { id: "iab_travel_core", tier1: "Travel", min: 900 },
];

export function computeIabAudienceSegments(tier1Seconds, totalIabLabeledSeconds, totalBrowsingSeconds) {
  const out = [];
  const t = tier1Seconds || {};
  const sec = (name) => t[name] || 0;

  for (const r of IAB_TIER1_RULES) {
    if (sec(r.tier1) >= r.min) out.push(r.id);
  }

  const diverseRoots = Object.entries(t).filter(([, s]) => s >= 450).length;
  if (diverseRoots >= 4 && totalIabLabeledSeconds >= 3600) {
    out.push("iab_multi_category_researcher");
  }

  const totalB = totalBrowsingSeconds || 0;
  if (totalB > 0) {
    for (const [tier1, s] of Object.entries(t)) {
      const share = s / totalB;
      if (tier1 === "Shopping" && share >= 0.28 && s >= 900) out.push("iab_shopping_audience_dominant");
      if (tier1 === "Technology & Computing" && share >= 0.25 && s >= 1200) out.push("iab_technology_audience_dominant");
      if (tier1 === "Business and Finance" && share >= 0.2 && s >= 900) out.push("iab_finance_content_dominant");
      if (tier1 === "Sports" && share >= 0.22 && s >= 800) out.push("iab_sports_audience_dominant");
      if (tier1 === "Entertainment" && share >= 0.3 && s >= 1200) out.push("iab_entertainment_audience_dominant");
      if (tier1 === "Travel" && share >= 0.18 && s >= 600) out.push("iab_travel_audience_dominant");
    }
  }

  return [...new Set(out)];
}

export function computeRollupAudienceSegments(totalCatSeconds, isNightOwl) {
  const segments = [];
  if ((totalCatSeconds.shopping || 0) > 1800) segments.push("high_intent_shopper");
  if ((totalCatSeconds.finance || 0) > 900) segments.push("finance_decision_maker");
  if ((totalCatSeconds.technology || 0) > 1800) segments.push("tech_early_adopter");
  if ((totalCatSeconds.realestate || 0) > 600) segments.push("property_seeker");
  if ((totalCatSeconds.jobs || 0) > 600) segments.push("job_seeker");
  if ((totalCatSeconds.travel || 0) > 600) segments.push("travel_planner");
  if (isNightOwl && (totalCatSeconds.shopping || 0) > 600) segments.push("night_owl_shopper");
  return segments;
}

export function mergeAudienceSegments(rollupSegs, iabSegs) {
  const seen = new Set();
  const out = [];
  for (const s of rollupSegs || []) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  for (const s of [...(iabSegs || [])].sort()) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export function audienceSegmentExportFields(sessions, totalCatSeconds, totalBrowsingSeconds, visitHours, taxonomyById) {
  const lateNightHrs = (visitHours || []).filter((h) => h >= 22 || h <= 2);
  const isNightOwl = lateNightHrs.length > 0;
  const rollupSegs = computeRollupAudienceSegments(totalCatSeconds, isNightOwl);
  const { tier1Seconds, totalIabLabeledSeconds } = accumulateIabContentTier1Seconds(sessions, taxonomyById);
  const iabSegs = computeIabAudienceSegments(tier1Seconds, totalIabLabeledSeconds, totalBrowsingSeconds);
  const merged = mergeAudienceSegments(rollupSegs, iabSegs);
  if (!merged.length) return null;
  return {
    audience_segments: merged,
    audience_segments_iab: iabSegs.length ? iabSegs : null,
    audience_segments_rollup: rollupSegs.length ? rollupSegs : null,
  };
}
