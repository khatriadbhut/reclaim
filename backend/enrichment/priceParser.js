/**
 * Normalize scraped prices for sensitivity tiers.
 * Price string symbols beat declared currency (fixes ₹/INR with $ amounts).
 */

const CURRENCY_SYMBOLS = { ₹: "INR", $: "USD", "€": "EUR", "£": "GBP" };
export const REASONABLE_INR_MAX = 10_000_000;

export function detectCurrencyFromPriceRaw(raw) {
  const s = String(raw ?? "");
  for (const [sym, cur] of Object.entries(CURRENCY_SYMBOLS)) {
    if (s.includes(sym)) return cur;
  }
  if (/inr|rs\.?(\s|$)|rupees?\b/i.test(s)) return "INR";
  if (/\b\d\s*usd\b|\busd\b/i.test(s)) return "USD";
  return null;
}

export function parsePriceAmount(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function normalizeDeclared(cur) {
  if (!cur || typeof cur !== "string") return "";
  return cur.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
}

/**
 * @param {unknown[]} pricesFound
 * @returns {{ raw: string, currency: string, amount: number|null }[]}
 */
export function normalizePricesFound(pricesFound) {
  if (!Array.isArray(pricesFound) || !pricesFound.length) return [];
  const out = [];
  for (const p of pricesFound.slice(0, 12)) {
    let raw = "";
    let declared = "";

    if (p && typeof p === "object" && "price" in p) {
      raw = String(p.price ?? "").trim();
      declared = normalizeDeclared(p.currency);
    } else {
      raw = String(p ?? "").trim();
    }

    if (!raw) continue;

    const detected = detectCurrencyFromPriceRaw(raw);
    let currency = (detected || declared || "INR").toUpperCase();
    const amount = parsePriceAmount(raw);
    if (amount == null || amount <= 0) continue;

    if (!detected && declared === "INR" && /\$/.test(raw)) continue;
    if (currency === "INR") {
      if (detected && detected !== "INR") continue;
      if (amount > REASONABLE_INR_MAX) continue;
    }

    out.push({ raw, currency, amount });
    if (out.length >= 10) break;
  }
  return out;
}
