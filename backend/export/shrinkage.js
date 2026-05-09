/**
 * Pull category share estimates toward uniform prior when sample is thin (stabilizes WoW noise).
 * RECLAIM_DISTRIBUTION_SHRINK=0 disables. Typical small value: 0.5–3 (seconds-equivalent prior mass).
 */

export function distributionShrinkLambda() {
  const raw = process.env.RECLAIM_DISTRIBUTION_SHRINK;
  if (raw === undefined || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * @param {Record<string, number>} totalCatSeconds — seconds per rollup category
 * @returns {Record<string, number>} integer percentages summing ~100
 */
export function categoryDistributionPctShrunk(totalCatSeconds, lambda) {
  const lam = lambda ?? distributionShrinkLambda();
  const cats = Object.keys(totalCatSeconds || {});
  if (!cats.length) return {};
  let T = 0;
  for (const c of cats) T += Math.max(0, totalCatSeconds[c] || 0);
  if (T <= 0) return {};
  if (lam <= 0) {
    const out = {};
    for (const c of cats) {
      out[c] = Math.round(((totalCatSeconds[c] || 0) / T) * 100);
    }
    return out;
  }
  const k = cats.length;
  const priorPerCat = (T / k) * lam;
  const adj = {};
  let sumAdj = 0;
  for (const c of cats) {
    adj[c] = Math.max(0, totalCatSeconds[c] || 0) + priorPerCat;
    sumAdj += adj[c];
  }
  if (sumAdj <= 0) return {};
  const out = {};
  for (const c of cats) {
    out[c] = Math.round((adj[c] / sumAdj) * 100);
  }
  return out;
}
