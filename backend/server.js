import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { createDomainCategoryStore, normDomain as normalizeDomainKey } from "./domainCategoryStore.js";
import { createApiUsageStore } from "./apiUsageStore.js";
import { pickStrictWhoisMapping, whoisXmlLookup } from "./whoisXmlCategorizer.js";
import { loadIabContentTaxonomyV3 } from "./iabContentTaxonomy.js";
import { mapVendorLabelToIabContentId } from "./iabContentMap.js";
import { audienceSegmentExportFields, computeRollupAudienceSegments } from "./audienceSegments.js";

// Always load env from backend/.env (works even if process cwd is repo root)
dotenv.config({ path: new URL("./.env", import.meta.url) });

const app = express();
const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iabTaxonomyPromise = loadIabContentTaxonomyV3(path.join(__dirname, "data", "iab-content-taxonomy-3.0.tsv"));

// CORS:
// - Public API (extension) can stay wide-open.
// - Company API uses cookies (credentials) and must NOT use wildcard origin.
app.use((req, res, next) => {
  if (req.path.startsWith("/api/company/")) return next();
  return cors({ origin: "*", methods: ["GET", "POST"] })(req, res, next);
});
app.use(express.json());

// In-memory storage
const categoryCache = {};
const extractCache = {};
const userProfiles = {};
const userSessions = {};
/** Visit segments from extension (deduped on sync by `id`). */
const userVisitLogs = {};
const users = {}; // { googleId: { id, email, name, picture, profile } }

// Company auth + purchases (in-memory)
const companies = {}; // { companyId: { id, email, name, picture, createdAt } }
const companySessions = {}; // { sessionId: { companyId, createdAt, lastSeenAt } }
const companyPurchases = {}; // { companyId: Array<{ id, packageId, format, createdAt, rowCount }> }

const COMPANY_SESSION_COOKIE = "reclaim_company_session";
const COMPANY_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const COMPANY_COOKIE_SECRET = process.env.COMPANY_COOKIE_SECRET || "dev_insecure_change_me";
const COMPANY_DASHBOARD_ORIGIN = process.env.COMPANY_DASHBOARD_ORIGIN || "http://localhost:5173";
const CACHE_TTL = 1000 * 60 * 60 * 24;

function exportUserId(scope, rawUserId) {
  const secret = process.env.EXPORT_ID_SECRET || COMPANY_COOKIE_SECRET;
  const scoped = `${scope || "public"}::${String(rawUserId)}`;
  return crypto.createHmac("sha256", secret).update(scoped).digest("hex").slice(0, 24);
}

function parsePriceAmount(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function normalizePricesFound(pricesFound) {
  if (!Array.isArray(pricesFound) || !pricesFound.length) return [];
  return pricesFound.slice(0, 10).map((p) => {
    if (p && typeof p === "object" && "price" in p) {
      const raw = String(p.price ?? "").trim();
      const currency = (p.currency || "INR").toString().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "INR";
      return { raw, currency, amount: parsePriceAmount(raw) };
    }
    const raw = String(p ?? "").trim();
    return { raw, currency: "INR", amount: parsePriceAmount(raw) };
  });
}

function inferQueryInsightsBase(queries) {
  const list = Array.isArray(queries) ? queries : [];
  const cleaned = list
    .map((q) => String(q || "").trim())
    .filter(Boolean)
    .slice(0, 50);
  if (!cleaned.length) {
    return {
      intent_level: "none",
      intent_reasons: null,
      intent_topics: null,
      intent_keyword_hits: null,
    };
  }

  const HITS = {
    price: /\b(price|pricing|cost|rate|mrp|₹|rs|inr|\$|usd|eur|gbp)\b/i,
    deal: /\b(deal|discount|offer|offers|sale|flash sale|limited time|clearance|promo)\b/i,
    coupon: /\b(coupon|coupons|coupon code|voucher|vouchers|promo code|referral code|cashback)\b/i,
    compare: /\b(vs|versus|compare|comparison|which is better|best)\b/i,
    review: /\b(review|reviews|rating|ratings|unboxing|hands on|pros and cons)\b/i,
    specs: /\b(spec|specs|specification|specifications|features|camera|battery|ram|storage)\b/i,
    availability: /\b(in stock|out of stock|availability|available|near me)\b/i,
    delivery: /\b(delivery|shipping|ship|dispatch|same day|next day|return|refund|exchange|warranty)\b/i,
    checkout: /\b(checkout|cart|bag|basket|payment|pay|upi|cod|cash on delivery)\b/i,
  };

  const TOPICS = {
    electronics: /\b(iphone|android|mobile|smartphone|laptop|macbook|tablet|ipad|earbuds|headphone|airpods|camera|tv|monitor|gpu|nvidia|amd)\b/i,
    fashion: /\b(shoes|sneaker|sneakers|shirt|t shirt|t-shirt|jeans|dress|kurta|saree|fashion|outfit|hoodie|jacket|watch|bag|handbag)\b/i,
    beauty: /\b(skincare|skin care|serum|vitamin c|sunscreen|moisturizer|makeup|lipstick|perfume|fragrance|shampoo)\b/i,
    food_delivery: /\b(swiggy|zomato|food|restaurant|order food|pizza|burger|biryan[iy]|grocery|blinkit|zepto)\b/i,
    travel: /\b(flight|hotel|booking|airbnb|train|irctc|trip|tour|visa)\b/i,
    finance: /\b(loan|emi|sip|mutual fund|insurance|credit card|bank|interest rate)\b/i,
    real_estate: /\b(bhk|flat|apartment|villa|plot|property|rent|sale)\b/i,
    jobs: /\b(job|jobs|hiring|recruit|resume|cv|salary)\b/i,
  };

  const keywordHits = {};
  for (const [k, re] of Object.entries(HITS)) {
    keywordHits[k] = cleaned.reduce((n, q) => n + (re.test(q) ? 1 : 0), 0);
  }
  const reasons = Object.entries(keywordHits)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  const topics = Object.entries(TOPICS)
    .filter(([, re]) => cleaned.some((q) => re.test(q)))
    .map(([k]) => k);

  const score =
    keywordHits.checkout * 3 +
    keywordHits.price * 2 +
    keywordHits.deal * 2 +
    keywordHits.coupon * 2 +
    keywordHits.delivery * 1 +
    keywordHits.compare * 1 +
    keywordHits.review * 1 +
    keywordHits.availability * 1 +
    keywordHits.specs * 1;

  const level = score >= 8 ? "high" : score >= 3 ? "medium" : reasons.length ? "low" : "none";

  return {
    intent_level: level,
    intent_reasons: reasons.length ? reasons.slice(0, 6) : null,
    intent_topics: topics.length ? topics.slice(0, 6) : null,
    intent_keyword_hits: reasons.length ? keywordHits : null,
  };
}

function inferQueryInsights(queries, prefix) {
  const p = String(prefix || "").trim();
  const base = inferQueryInsightsBase(queries);
  if (!p) return base;
  return {
    [`${p}_query_intent_level`]: base.intent_level,
    [`${p}_query_intent_reasons`]: base.intent_reasons,
    [`${p}_query_topics`]: base.intent_topics,
    [`${p}_query_keyword_hits`]: base.intent_keyword_hits,
  };
}

const VALID_CATEGORIES = [
  "shopping", "social", "news", "finance", "entertainment",
  "education", "health", "travel", "technology", "food",
  "realestate", "jobs", "other"
];

const domainCategoryStorePromise = createDomainCategoryStore({
  storePath: path.join(__dirname, "domain-categories.json"),
  legacyLearnedPath: path.join(__dirname, "learned-domain-categories.json"),
});

const whoisUsageStorePromise = createApiUsageStore({
  storePath: path.join(__dirname, "whoisxml-usage.json"),
  defaultLimit: Number(process.env.WHOISXML_FREE_LIMIT || 100),
});

const WHOIS_MIN_CONFIDENCE = Number(process.env.WHOISXML_MIN_CONFIDENCE || 0.9);
const GEMINI_DOMAIN_MIN_CONFIDENCE = Number(process.env.GEMINI_DOMAIN_MIN_CONFIDENCE || 0.86);
const ALLOW_GEMINI_DOMAIN_LOOKUP = String(process.env.ALLOW_GEMINI_DOMAIN_LOOKUP || "0") === "1";
const CLASSIFY_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const classifyCache = {};

function normalizeDomain(domain) {
  return normalizeDomainKey(domain);
}

function heuristicDomainRollup(domain, title) {
  const d = normalizeDomain(domain);
  const t = String(title || "").toLowerCase();
  if (!d) return null;
  if (/\b(pay|payments|upi|bank|loan|insurance|sip|mutual|demat|broker|trading)\b/.test(d) || /\b(emi|loan|sip|mutual fund|insurance)\b/.test(t)) return "finance";
  if (/\b(job|jobs|career|careers|hiring|recruit)\b/.test(d) || /\b(apply now|we are hiring)\b/.test(t)) return "jobs";
  if (/\b(hotel|flight|booking|airline|trip|travel)\b/.test(d) || /\b(book flight|book hotel)\b/.test(t)) return "travel";
  if (/\b(pharma|health|clinic|doctor|medicine)\b/.test(d)) return "health";
  if (/\b(food|delivery|restaurant)\b/.test(d)) return "food";
  if (/\b(realestate|property|properties|flat|apartment|villa)\b/.test(d) || /\b(bhk)\b/.test(t)) return "realestate";
  if (/\b(shop|store|cart|checkout|market)\b/.test(d)) return "shopping";
  return null;
}

async function geminiDomainRollupStrict(domain, title) {
  const dom = normalizeDomain(domain);
  if (!dom) return { category: "other", source: "gemini_skip" };
  const prompt = `You are classifying a website DOMAIN into exactly ONE coarse vertical for ad-tech audience packaging.

Valid categories: ${VALID_CATEGORIES.join(", ")}

Rules:
- Return ONLY valid JSON: {"category":"<word>","confidence":0.0}
- confidence is your calibrated probability this domain's primary purpose matches category (0..1)
- If unsure, use category "other" with confidence <= 0.5

Domain: ${dom}
Title: ${title || "unknown"}`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    const cat = String(parsed.category || "").trim().toLowerCase();
    const conf = typeof parsed.confidence === "number" ? parsed.confidence : null;
    if (!VALID_CATEGORIES.includes(cat) || conf == null) return { category: "other", source: "gemini_reject" };
    if (conf < GEMINI_DOMAIN_MIN_CONFIDENCE || cat === "other") return { category: "other", source: "gemini_low_confidence" };
    return { category: cat, source: "gemini", confidence: conf };
  } catch {
    return { category: "other", source: "gemini_error" };
  }
}

async function lookupDomainRollup(domain, title) {
  const dom = normalizeDomain(domain);
  const store = await domainCategoryStorePromise;

  const reg = store.get(dom);
  if (reg) return { category: reg, source: "registry", iab: null, iab_categories: null, iab_provider: null };

  if (categoryCache[dom] && Date.now() - categoryCache[dom].cachedAt < CACHE_TTL) {
    const hit = categoryCache[dom];
    return {
      category: hit.category,
      source: hit.source || "cache",
      iab: hit.iab || null,
      iab_categories: hit.iab_categories || null,
      iab_provider: hit.iab_provider || null,
    };
  }

  const h = heuristicDomainRollup(dom, title);
  if (h && VALID_CATEGORIES.includes(h)) {
    categoryCache[dom] = { category: h, cachedAt: Date.now(), source: "heuristic", iab: null, iab_categories: null, iab_provider: null };
    return { category: h, source: "heuristic", iab: null, iab_categories: null, iab_provider: null };
  }

  const whoisKey = process.env.WHOISXML_API_KEY;
  const whoisLimit = Number(process.env.WHOISXML_FREE_LIMIT || 100);
  if (whoisKey) {
    const usage = await whoisUsageStorePromise;
    if (usage.canUse(whoisKey, whoisLimit)) {
      const res = await whoisXmlLookup({ apiKey: whoisKey, urlOrDomain: dom });
      if (res.ok) {
        usage.increment(whoisKey, whoisLimit);
        const cats = (res.raw?.categories || [])
          .filter((c) => c && typeof c === "object")
          .map((c) => ({
            id: c.id,
            name: String(c.name || "").trim(),
            confidence: typeof c.confidence === "number" ? c.confidence : null,
          }))
          .filter((c) => c.name && c.confidence != null)
          .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
          .slice(0, 8);

        const mapped = pickStrictWhoisMapping(res.raw?.categories || [], WHOIS_MIN_CONFIDENCE);
        if (mapped?.category && VALID_CATEGORIES.includes(mapped.category)) {
          store.setVerified(dom, mapped.category);
          categoryCache[dom] = {
            category: mapped.category,
            cachedAt: Date.now(),
            source: "whoisxml",
            iab: mapped.iab || null,
            iab_categories: cats.length ? cats : null,
            iab_provider: "whoisxml",
          };
          return {
            category: mapped.category,
            source: "whoisxml",
            iab: mapped.iab || null,
            iab_categories: cats.length ? cats : null,
            iab_provider: "whoisxml",
          };
        }

        categoryCache[dom] = {
          category: "other",
          cachedAt: Date.now(),
          source: "whoisxml_unmapped",
          iab: null,
          iab_categories: cats.length ? cats : null,
          iab_provider: "whoisxml",
        };
        return { category: "other", source: "whoisxml_unmapped", iab: null, iab_categories: cats.length ? cats : null, iab_provider: "whoisxml" };
      }
    }
  }

  if (!ALLOW_GEMINI_DOMAIN_LOOKUP) {
    categoryCache[dom] = { category: "other", cachedAt: Date.now(), source: "domain_unknown_strict", iab: null, iab_categories: null, iab_provider: null };
    return { category: "other", source: "domain_unknown_strict", iab: null, iab_categories: null, iab_provider: null };
  }

  const g = await geminiDomainRollupStrict(dom, title);
  categoryCache[dom] = { category: g.category, cachedAt: Date.now(), source: g.source, iab: null, iab_categories: null, iab_provider: null };
  return { category: g.category, source: g.source, iab: null, iab_categories: null, iab_provider: null };
}

function pageEvidenceFromRequest(body) {
  const url = String(body?.url || "");
  let pathname = "";
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = "";
  }
  const pageTypes = Array.isArray(body?.pageTypes) ? body.pageTypes.map((x) => String(x)) : [];
  const latest = body?.pageType ? String(body.pageType) : "";
  const set = new Set([...pageTypes, latest].filter(Boolean));

  const hasPrices = body?.hasPrices === true;
  const pricesCount = typeof body?.pricesCount === "number" ? body.pricesCount : 0;

  const pathLooksCheckout = /\/(cart|checkout|bag|basket|payment|pay|order)\b/i.test(pathname);
  const pathLooksProduct = /\/(p|product|products|item|dp)\b/i.test(pathname) || /\/dp\//i.test(pathname);

  return {
    latest,
    set,
    hasPrices: hasPrices || pricesCount > 0,
    pathLooksCheckout,
    pathLooksProduct,
  };
}

function visitOverrideCategory(domainRollup, ev) {
  const base = domainRollup || "other";

  if (ev.set.has("travel_booking")) return { category: "travel", reason: "page_travel_booking", confidence: 0.95 };

  if (ev.latest === "job_listing" && ev.set.has("job_listing")) {
    return { category: "jobs", reason: "page_job_listing", confidence: 0.9 };
  }

  if (ev.latest === "property_listing" && ev.set.has("property_listing")) {
    return { category: "realestate", reason: "page_property_listing", confidence: 0.9 };
  }

  const strongCommerce =
    ev.set.has("checkout") ||
    ev.pathLooksCheckout ||
    (ev.set.has("product") && (ev.hasPrices || ev.pathLooksProduct)) ||
    (ev.set.has("category") && ev.hasPrices);

  if (strongCommerce) {
    if (["travel", "jobs", "realestate"].includes(base)) {
      return { category: base, reason: "commerce_signal_ignored_conflicting_vertical", confidence: 0.55 };
    }
    return { category: "shopping", reason: "commerce_signals", confidence: 0.9 };
  }

  return null;
}

function mergeDomainAndVisit(domainBundle, visitBundle) {
  const dCat = domainBundle.category;
  const v = visitBundle;
  if (!v) return { category: dCat, decision: "domain_only" };

  if (!v.category || v.category === dCat) return { category: dCat, decision: "domain_agrees_visit" };

  // Prefer high-confidence visit vertical signals over domain rollup when they disagree.
  if ((v.confidence || 0) >= 0.9) return { category: v.category, decision: "visit_override" };
  return { category: dCat, decision: "domain_preferred_low_visit_confidence" };
}

function classifyCacheKey(payload) {
  const dom = normalizeDomain(payload.domain);
  const url = String(payload.url || "");
  const pts = Array.isArray(payload.pageTypes) ? [...payload.pageTypes].sort().join(",") : "";
  const latest = String(payload.pageType || "");
  const hq = payload.hasPrices ? "1" : "0";
  const pc = String(payload.pricesCount ?? "");
  const mc = String(payload.modelCategory || "");
  return crypto.createHash("sha256").update(`${dom}|${url}|${latest}|${pts}|${hq}|${pc}|${mc}`).digest("hex");
}

async function mapVendorCategoriesToIabContent(vendorCategories) {
  const taxonomy = await iabTaxonomyPromise;
  const list = Array.isArray(vendorCategories) ? vendorCategories : [];
  const mapped = [];

  for (const c of list) {
    if (!c || typeof c !== "object") continue;
    const vendorName = String(c.name || "").trim();
    const vendorId = c.id ?? null;
    const vendorConfidence = typeof c.confidence === "number" ? c.confidence : null;
    if (!vendorName || vendorConfidence == null) continue;

    const exact = taxonomy.lookupExactName(vendorName);
    if (exact) {
      mapped.push({
        vendor: { id: vendorId, name: vendorName, confidence: vendorConfidence },
        iab_content: { id: exact.id, name: exact.name, tier1: exact.tier1, tier2: exact.tier2 },
        match: { method: "exact_name", confidence: Math.min(0.95, vendorConfidence) },
      });
      continue;
    }

    const inferred = mapVendorLabelToIabContentId(taxonomy.normalizeLabel(vendorName));
    if (!inferred) continue;
    const node = taxonomy.byId.get(inferred.id);
    if (!node) continue;
    const mapConf = inferred.confidence;
    mapped.push({
      vendor: { id: vendorId, name: vendorName, confidence: vendorConfidence },
      iab_content: { id: node.id, name: node.name, tier1: node.tier1, tier2: node.tier2 },
      match: { method: inferred.method, confidence: Math.min(vendorConfidence, mapConf) },
    });
  }

  mapped.sort((a, b) => (b.match.confidence || 0) - (a.match.confidence || 0));
  const primary = mapped.length ? mapped[0] : null;

  return {
    taxonomy_version: `IAB Tech Lab Content Taxonomy v${taxonomy.version}`,
    mappings: mapped.slice(0, 12),
    primary: primary
      ? {
          id: primary.iab_content.id,
          name: primary.iab_content.name,
          confidence: primary.match.confidence,
          match_method: primary.match.method,
          vendor: primary.vendor,
        }
      : null,
  };
}

const EARNINGS_RATE = {
  shopping: 0.05, finance: 0.06, health: 0.05, travel: 0.04,
  social: 0.02, news: 0.02, entertainment: 0.02, technology: 0.02,
  education: 0.01, food: 0.02, realestate: 0.08, jobs: 0.03, other: 0.005
};

const FALLBACK_INSIGHTS = {
  shopping: "Your shopping behavior is valuable — brands pay a premium to understand cross-site purchase intent.",
  social: "Social browsing patterns reveal content preferences advertisers can't get anywhere else.",
  entertainment: "Entertainment habits predict subscription churn and content demand.",
  finance: "Finance browsing signals high purchase intent — one of the most valuable data segments.",
  news: "News consumption patterns reveal interests that media companies actively purchase for audience targeting.",
  education: "EdTech companies pay for learning behavior data to improve course recommendations.",
  technology: "Tech browsing signals developer and early adopter behavior — highly sought after for B2B.",
  health: "Health browsing data is among the most sensitive and valuable for pharma and wellness brands.",
  travel: "Travel intent data is extremely valuable — airlines and hotels pay for signals weeks before booking.",
  food: "Food preference data helps delivery platforms and FMCG brands understand consumer habits.",
  realestate: "Real estate browsing signals buyer intent weeks before a purchase decision.",
  jobs: "Job seeking behavior is extremely valuable to recruiters and HR platforms.",
  other: "Your browsing data has been anonymized and packaged for market researchers."
};

function cacheKey(domain, title) {
  return crypto.createHash("md5").update(`${domain}::${title || ""}`).digest("hex");
}

// ─── COMPANY AUTH HELPERS ─────────────────────────────────────────────────────

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function signCookieValue(value) {
  const sig = crypto.createHmac("sha256", COMPANY_COOKIE_SECRET).update(value).digest();
  return `${value}.${base64UrlEncode(sig)}`;
}

function verifySignedCookie(signedValue) {
  if (!signedValue || typeof signedValue !== "string") return null;
  const lastDot = signedValue.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const value = signedValue.slice(0, lastDot);
  const sig = signedValue.slice(lastDot + 1);
  const expected = base64UrlEncode(crypto.createHmac("sha256", COMPANY_COOKIE_SECRET).update(value).digest());
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    return value;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach(part => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) return;
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookie]);
    return;
  }
  res.setHeader("Set-Cookie", [existing, cookie]);
}

function setCompanySessionCookie(res, sessionId) {
  const signed = signCookieValue(sessionId);
  const isProd = process.env.NODE_ENV === "production";
  // SameSite=Lax works with OAuth redirects and still protects most CSRF cases.
  const cookie = [
    `${COMPANY_SESSION_COOKIE}=${encodeURIComponent(signed)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    isProd ? "Secure" : null,
    `Max-Age=${Math.floor(COMPANY_SESSION_TTL_MS / 1000)}`
  ].filter(Boolean).join("; ");
  appendSetCookie(res, cookie);
}

function clearCompanySessionCookie(res) {
  appendSetCookie(res, `${COMPANY_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function getCompanyFromRequest(req) {
  const cookies = parseCookies(req);
  const signed = cookies[COMPANY_SESSION_COOKIE];
  const sessionId = verifySignedCookie(signed);
  if (!sessionId) return null;
  const session = companySessions[sessionId];
  if (!session) return null;
  if (Date.now() - session.createdAt > COMPANY_SESSION_TTL_MS) {
    delete companySessions[sessionId];
    return null;
  }
  session.lastSeenAt = Date.now();
  const company = companies[session.companyId];
  if (!company) return null;
  return { company, sessionId };
}

function requireCompanyAuth(req, res, next) {
  const ctx = getCompanyFromRequest(req);
  if (!ctx) return res.status(401).json({ error: "company not authenticated" });
  req.companyAuth = ctx; // { company, sessionId }
  next();
}

function companyCors() {
  return cors({
    origin: COMPANY_DASHBOARD_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  });
}

// Ensure CORS preflights succeed for company endpoints (credentials required).
// Express 5 path patterns don't accept "/api/company/*" here; use regex.
app.options(/^\/api\/company\/.*$/, companyCors());

// ─── /api/auth/google ─────────────────────────────────────────────────────────
app.post("/api/auth/google", async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) return res.status(400).json({ error: "accessToken required" });

  try {
    const r = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${accessToken}`);
    if (!r.ok) return res.status(401).json({ error: "invalid token" });
    const google = await r.json();

    const isNewUser = !users[google.id];
    if (!users[google.id]) {
      users[google.id] = {
        id: google.id,
        email: google.email,
        name: google.name,
        picture: google.picture,
        profile: null,
        createdAt: Date.now()
      };
    }

    const hasDemographics = !!users[google.id].profile;

    return res.json({
      userId: google.id,
      name: google.name,
      email: google.email,
      picture: google.picture,
      isNewUser,
      hasDemographics
    });
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(500).json({ error: "auth failed" });
  }
});

// ─── /api/auth/user ───────────────────────────────────────────────────────────
app.post("/api/auth/user", (req, res) => {
  const { userId, profile } = req.body;
  if (!userId || !profile) return res.status(400).json({ error: "userId and profile required" });

  if (!users[userId]) users[userId] = { id: userId, profile: null };
  users[userId].profile = profile;
  userProfiles[userId] = { ...userProfiles[userId], ...profile };

  return res.json({ status: "saved" });
});

// ─── /api/auth/user/:userId ───────────────────────────────────────────────────
app.get("/api/auth/user/:userId", (req, res) => {
  const user = users[req.params.userId];
  if (!user) return res.status(404).json({ error: "user not found" });
  return res.json(user);
});

// ─── /api/company/auth/google (OAuth) ─────────────────────────────────────────
// Uses a separate OAuth client from extension auth.
// Env required:
// - COMPANY_GOOGLE_CLIENT_ID
// - COMPANY_GOOGLE_CLIENT_SECRET
// - COMPANY_OAUTH_REDIRECT_URL (should point to /api/company/auth/google/callback)

app.get("/api/company/auth/google/start", companyCors(), (req, res) => {
  const clientId = process.env.COMPANY_GOOGLE_CLIENT_ID;
  const redirectUri = process.env.COMPANY_OAUTH_REDIRECT_URL;
  if (!clientId || !redirectUri) {
    const missing = [];
    if (!clientId) missing.push("COMPANY_GOOGLE_CLIENT_ID");
    if (!redirectUri) missing.push("COMPANY_OAUTH_REDIRECT_URL");
    return res.status(500).send(
      `Company OAuth not configured. Missing: ${missing.join(", ")}. ` +
      `Set these in your backend environment and restart the server.`
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  // store state in a short-lived cookie (dev simplicity)
  appendSetCookie(res, `reclaim_company_oauth_state=${state}; Path=/; SameSite=Lax; Max-Age=600`);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/api/company/auth/google/callback", companyCors(), async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send("Missing code");

  const cookies = parseCookies(req);
  const expectedState = cookies.reclaim_company_oauth_state;
  if (!state || !expectedState || state !== expectedState) {
    return res.status(400).send("Invalid state");
  }

  const clientId = process.env.COMPANY_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.COMPANY_GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.COMPANY_OAUTH_REDIRECT_URL;
  if (!clientId || !clientSecret || !redirectUri) {
    const missing = [];
    if (!clientId) missing.push("COMPANY_GOOGLE_CLIENT_ID");
    if (!clientSecret) missing.push("COMPANY_GOOGLE_CLIENT_SECRET");
    if (!redirectUri) missing.push("COMPANY_OAUTH_REDIRECT_URL");
    return res.status(500).send(
      `Company OAuth not configured. Missing: ${missing.join(", ")}. ` +
      `Set these in your backend environment and restart the server.`
    );
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(401).send(tokenJson.error_description || "OAuth token exchange failed");
    }

    // Fetch profile via UserInfo endpoint.
    const accessToken = tokenJson.access_token;
    const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const info = await infoRes.json();
    if (!infoRes.ok || !info?.sub) {
      return res.status(401).send("Failed to fetch company profile");
    }

    const companyId = info.sub;
    if (!companies[companyId]) {
      companies[companyId] = {
        id: companyId,
        email: info.email || null,
        name: info.name || (info.email ? info.email.split("@")[0] : "Company"),
        picture: info.picture || null,
        createdAt: Date.now()
      };
    }

    const sessionId = crypto.randomBytes(24).toString("hex");
    companySessions[sessionId] = { companyId, createdAt: Date.now(), lastSeenAt: Date.now() };
    setCompanySessionCookie(res, sessionId);

    // Clear oauth state cookie
    appendSetCookie(res, "reclaim_company_oauth_state=; Path=/; SameSite=Lax; Max-Age=0");

    return res.redirect(`${COMPANY_DASHBOARD_ORIGIN}/company`);
  } catch (err) {
    console.error("Company OAuth callback error:", err.message);
    return res.status(500).send("Company OAuth failed");
  }
});

app.get("/api/company/auth/me", companyCors(), (req, res) => {
  const ctx = getCompanyFromRequest(req);
  if (!ctx) return res.status(401).json({ error: "not authenticated" });
  const { company } = ctx;
  return res.json({ id: company.id, email: company.email, name: company.name, picture: company.picture });
});

app.post("/api/company/auth/logout", companyCors(), (req, res) => {
  const ctx = getCompanyFromRequest(req);
  if (ctx?.sessionId) delete companySessions[ctx.sessionId];
  clearCompanySessionCookie(res);
  return res.json({ status: "ok" });
});

// ─── /api/categorize ──────────────────────────────────────────────────────────
async function getCategory(domain, title) {
  const rollup = await lookupDomainRollup(domain, title);
  return { category: rollup.category, source: rollup.source };
}

app.post("/api/categorize", async (req, res) => {
  const { domain, title } = req.body;
  if (!domain) return res.status(400).json({ error: "domain is required" });
  const result = await getCategory(domain, title);
  return res.json(result);
});

app.get("/api/domain-lookup/quota", async (_req, res) => {
  const whoisKey = process.env.WHOISXML_API_KEY;
  const whoisLimit = Number(process.env.WHOISXML_FREE_LIMIT || 100);
  if (!whoisKey) return res.json({ enabled: false });
  const usage = await whoisUsageStorePromise;
  return res.json({ enabled: true, provider: "whoisxml", ...usage.status(whoisKey, whoisLimit) });
});

app.post("/api/classify-visit", async (req, res) => {
  const body = req.body || {};
  const domain = body.domain;
  const title = body.title || "";
  const url = body.url || "";
  if (!domain) return res.status(400).json({ error: "domain required" });

  const ck = classifyCacheKey(body);
  const hit = classifyCache[ck];
  if (hit && Date.now() - hit.cachedAt < CLASSIFY_CACHE_TTL_MS) {
    return res.json({ ...hit.payload, cached: true });
  }

  const rollup = await lookupDomainRollup(domain, title);
  const ev = pageEvidenceFromRequest(body);
  const visit = visitOverrideCategory(rollup.category, ev);

  const modelCategory = String(body.modelCategory || "").trim().toLowerCase();
  let merged = mergeDomainAndVisit(
    { category: rollup.category },
    visit ? { category: visit.category, confidence: visit.confidence } : null
  );

  // Optional tie-breaker: only trust page-title model category if it matches domain or visit vertical.
  if (
    modelCategory &&
    VALID_CATEGORIES.includes(modelCategory) &&
    modelCategory !== "other" &&
    (modelCategory === rollup.category || (visit && modelCategory === visit.category))
  ) {
    merged = { category: modelCategory, decision: "model_agreement" };
  }

  const category = merged.category;
  const iabCats = Array.isArray(rollup.iab_categories) ? rollup.iab_categories : null;
  const iabPrimaryFromList = iabCats?.length ? iabCats[0] : null;
  const iabPrimary = iabPrimaryFromList || (rollup.iab ? { id: rollup.iab.id, name: rollup.iab.name, confidence: null } : null);
  const iabContent = await mapVendorCategoriesToIabContent(iabCats || []);

  const payload = {
    category,
    earnings_rate: EARNINGS_RATE[category] || EARNINGS_RATE.other,
    domain_rollup: rollup.category,
    domain_source: rollup.source,
    iab_provider: rollup.iab_provider || (iabCats ? "whoisxml" : null),
    iab_taxonomy: "whoisxml_website_categories",
    iab_categories: iabCats,
    iab_primary_id: iabPrimary?.id ?? null,
    iab_primary_name: iabPrimary?.name || null,
    iab_primary_confidence: iabPrimary?.confidence ?? null,
    // Back-compat / debugging: mapped IAB node used for strict rollup mapping (may be null)
    iab_mapped: rollup.iab || null,
    // IAB Tech Lab Content Taxonomy (mapped from vendor website categories)
    iab_content: iabContent,
    iab_content_primary_id: iabContent.primary?.id ?? null,
    iab_content_primary_name: iabContent.primary?.name ?? null,
    iab_content_primary_confidence: iabContent.primary?.confidence ?? null,
    iab_content_match_method: iabContent.primary?.match_method ?? null,
    visit_override: visit,
    merge: merged,
    model_category: modelCategory || null,
  };

  classifyCache[ck] = { cachedAt: Date.now(), payload };
  return res.json({ ...payload, cached: false });
});

// ─── /api/extract ─────────────────────────────────────────────────────────────
app.post("/api/extract", async (req, res) => {
  const { domain, title } = req.body;
  if (!domain) return res.status(400).json({ error: "domain required" });

  const key = cacheKey(domain, title);
  if (extractCache[key]) return res.json({ ...extractCache[key], cached: true });

  const store = await domainCategoryStorePromise;
  const domainRollup = store.get(domain);

  try {
    const prompt = `You are a data extraction engine for an AdTech platform. Extract structured data from this web page visit.

Domain: ${domain}
Page Title: ${title || "unknown"}

Return ONLY a valid JSON object with these exact fields:
{
  "category": "one of: shopping, social, news, finance, entertainment, education, health, travel, technology, food, realestate, jobs, other",
  "brand": "brand name or null",
  "product": "product name or null",
  "product_type": "type of product or null",
  "price_range": "one of: budget, mid, premium, luxury, or null",
  "intent_score": "number 1-10 where 10 = about to purchase",
  "keywords": ["key", "terms", "from", "title"],
  "location": "city or region mentioned in title or null",
  "job_title": "if job listing, the role or null",
  "travel_route": "if travel page, origin to destination or null",
  "property_type": "if real estate page, type or null",
  "search_type": "one of: product_search, informational, comparison, review, or null"
}

Return ONLY valid JSON, no explanation, no markdown.`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json|```/g, "").trim();
    const extracted = JSON.parse(raw);

    extracted.domain_rollup = domainRollup || null;
    extracted.earnings_rate = EARNINGS_RATE[extracted.category] || EARNINGS_RATE.other;

    extractCache[key] = extracted;
    return res.json({ ...extracted, cached: false });
  } catch (err) {
    console.error("Extract error:", err.message);
    const fallback = {
      category: "other",
      domain_rollup: domainRollup || null,
      brand: null, product: null, product_type: null,
      price_range: null, intent_score: 3, keywords: [],
      location: null, job_title: null, travel_route: null,
      property_type: null, search_type: null,
      earnings_rate: EARNINGS_RATE.other,
      cached: false
    };
    extractCache[key] = fallback;
    return res.json(fallback);
  }
});

function mergeSessionDays(prev = {}, incoming = {}) {
  const out = { ...prev };
  for (const day of Object.keys(incoming)) {
    out[day] = { ...(out[day] || {}) };
    for (const dom of Object.keys(incoming[day])) {
      out[day][dom] = incoming[day][dom];
    }
  }
  return out;
}

function mergeVisitLogsById(prev = [], incoming = []) {
  const map = new Map();
  for (const v of prev) {
    if (v && v.id) map.set(v.id, v);
  }
  for (const v of incoming) {
    if (v && v.id) map.set(v.id, v);
  }
  const merged = [...map.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const cap = 10000;
  return merged.length > cap ? merged.slice(-cap) : merged;
}

// ─── /api/sync ────────────────────────────────────────────────────────────────
app.post("/api/sync", (req, res) => {
  const { userId, sessions, visitLog, totalEarnings, profile, collectorVersion } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId required" });

  userSessions[userId] = mergeSessionDays(userSessions[userId], sessions || {});
  userVisitLogs[userId] = mergeVisitLogsById(
    userVisitLogs[userId],
    Array.isArray(visitLog) ? visitLog : []
  );
  userProfiles[userId] = {
    ...userProfiles[userId],
    totalEarnings: totalEarnings ?? userProfiles[userId]?.totalEarnings ?? 0,
    lastSync: Date.now(),
    ...(profile || {}),
    ...(collectorVersion ? { collectorVersion } : {}),
  };

  return res.json({
    status: "synced",
    userId,
    visitSegmentsStored: userVisitLogs[userId]?.length || 0,
  });
});

// ─── /api/profile/:userId ─────────────────────────────────────────────────────
app.get("/api/profile/:userId", async (req, res) => {
  const { userId } = req.params;
  const sessions = userSessions[userId] || {};
  const profile = userProfiles[userId] || {};
  const user = users[userId] || {};

  const todayKey = new Date().toISOString().split("T")[0];
  const todaySessions = sessions[todayKey] || {};

  const categories = {};
  const brands = {};
  const searchQueries = [];
  const visitHours = [];
  let totalSeconds = 0;
  let deviceType = null;

  for (const dayKey of Object.keys(sessions)) {
    for (const session of Object.values(sessions[dayKey])) {
      const cat = session.category || "other";
      if (!categories[cat]) categories[cat] = { seconds: 0, earned: 0, domains: [] };
      categories[cat].seconds += session.totalSeconds || 0;
      categories[cat].earned += session.earned || 0;
      categories[cat].domains.push(session.domain);
      totalSeconds += session.totalSeconds || 0;

      if (session.brand) brands[session.brand] = (brands[session.brand] || 0) + 1;
      if (session.searchQueries) searchQueries.push(...session.searchQueries);
      if (session.visitHours) visitHours.push(...session.visitHours);
      if (session.deviceType && !deviceType) deviceType = session.deviceType;
    }
  }

  const topBrands = Object.entries(brands)
    .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([b]) => b);

  const topCategories = Object.entries(categories)
    .sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 5).map(([c]) => c);

  const hourCounts = {};
  visitHours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1; });
  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const isNightOwl = visitHours.some(h => h >= 22 || h <= 2);

  const totalCatSeconds = Object.fromEntries(
    Object.entries(categories).map(([k, v]) => [k, v.seconds])
  );
  const taxonomy = await iabTaxonomyPromise;
  const segExport = audienceSegmentExportFields(
    sessions,
    totalCatSeconds,
    totalSeconds,
    visitHours,
    taxonomy.byId
  );
  const segments = segExport?.audience_segments ?? computeRollupAudienceSegments(totalCatSeconds, isNightOwl);

  return res.json({
    userId, profile,
    name: user.name || null,
    email: user.email || null,
    picture: user.picture || null,
    totalEarnings: profile.totalEarnings || 0,
    totalBrowsingHours: (totalSeconds / 3600).toFixed(1),
    topCategories, topBrands, categories,
    searchQueries: [...new Set(searchQueries)].slice(-50),
    segments, todaySessions,
    deviceType, peakHour, isNightOwl
  });
});

// ─── /api/packages ────────────────────────────────────────────────────────────
function getPackagesPayload() {
  // Compute real user counts per package
  const allUserIds = Object.keys(userSessions);

  function countPackageUsers(filterId) {
    return allUserIds.filter(uid => {
      const sessions = userSessions[uid] || {};
      let totalCatSeconds = {};
      let hasLateNight = false;
      let hasLateNightCommerce = false;

      for (const day of Object.values(sessions)) {
        for (const s of Object.values(day)) {
          const cat = s.category || "other";
          totalCatSeconds[cat] = (totalCatSeconds[cat] || 0) + (s.totalSeconds || 0);
          const isLate = s.visitHours?.some(h => h >= 22 || h <= 2);
          if (isLate) {
            hasLateNight = true;
            const pts = Array.isArray(s.pageTypes) ? s.pageTypes : [];
            const hasPrices = Array.isArray(s.pricesFound) && s.pricesFound.length > 0;
            const commerce =
              cat === "shopping" ||
              pts.includes("checkout") ||
              (pts.includes("product") && hasPrices) ||
              ((s.intent_score ?? 0) >= 7);
            if (commerce) hasLateNightCommerce = true;
          }
        }
      }

      switch (filterId) {
        case "high_intent_shoppers":
          return Object.values(sessions).some(day =>
            Object.values(day).some(s => s.category === "shopping" && s.intent_score >= 7)
          );
        case "cross_platform_behavioral":
          return Object.keys(totalCatSeconds).length >= 3;
        case "finance_decision_makers":
          return (totalCatSeconds.finance || 0) > 900;
        case "tech_early_adopters":
          return (totalCatSeconds.technology || 0) > 1800;
        case "real_estate_prospects":
          return (totalCatSeconds.realestate || 0) > 0;
        case "night_owl_impulse_buyers":
          return hasLateNight && hasLateNightCommerce;
        default:
          return false;
      }
    }).length;
  }

  // NOTE: formats must match what exports actually support (csv/json).
  return [
    {
      id: "high_intent_shoppers",
      tier: 1,
      name: "High Intent Shoppers",
      tagline: "Users actively comparing products across sites — ready to buy",
      description: "Consent-based behavioral data from users showing strong cross-site purchase intent. Powered by intent scores, search queries, prices viewed, breadcrumb category paths, and scroll depth on product pages. Includes audience segments from both internal rollups and IAB Content Taxonomy topic time.",
      strongNow: true,
      strongerAfterOnboarding: false,
      signals: [
        "Intent score 7+ on product/checkout pages",
        "Cross-site product comparison (3+ domains)",
        "Search queries containing product names and prices",
        "Prices viewed with currency and availability",
        "Breadcrumb paths: Electronics > Mobiles > Apple",
        "Scroll depth 60%+ on product pages",
        "Audience segments: internal rollups + IAB Content Taxonomy tier-1 time"
      ],
      dataFields: [
        "user_id", "visit_segments_30d", "audience_segments", "audience_segments_iab", "audience_segments_rollup",
        "intent_score", "top_brands", "search_queries",
        "shopping_query_intent_level", "shopping_query_intent_reasons", "shopping_query_topics", "shopping_query_keyword_hits",
        "prices_viewed", "breadcrumbs", "page_types", "scroll_depth",
        "visit_frequency", "age_range", "gender", "occupation", "city", "region", "country", "device"
      ],
      sampleData: [
        {
          user_id: "usr_a7f2k9", visit_segments_30d: 40,
          audience_segments: ["high_intent_shopper", "iab_shopping_core", "iab_technology_core"],
          audience_segments_iab: ["iab_shopping_core", "iab_technology_core"],
          audience_segments_rollup: ["high_intent_shopper"],
          intent_score: 9, top_brands: ["Apple", "Samsung"],
          search_queries: ["iphone 15 pro price india", "iphone 15 pro vs 14 pro"],
          prices_viewed: ["₹134900", "₹124900"], breadcrumbs: ["Electronics", "Mobiles", "Apple"],
          page_types: ["product", "search", "comparison"], scroll_depth: 84,
          visit_frequency: 12, age_range: "18-24", gender: "M", city: "Roorkee", device: "desktop"
        },
        {
          user_id: "usr_b3m8p1", visit_segments_30d: 28,
          audience_segments: ["high_intent_shopper", "iab_shopping_audience_dominant"],
          audience_segments_iab: ["iab_shopping_audience_dominant", "iab_shopping_core"],
          audience_segments_rollup: ["high_intent_shopper"],
          intent_score: 8, top_brands: ["Samsung", "OnePlus"],
          search_queries: ["samsung s24 ultra review", "best android phone 2026"],
          prices_viewed: ["₹89999", "₹79999"], breadcrumbs: ["Electronics", "Mobiles", "Samsung"],
          page_types: ["product", "review"], scroll_depth: 71,
          visit_frequency: 8, age_range: "25-34", gender: "M", city: "Delhi", device: "mobile"
        },
        {
          user_id: "usr_c9x4r6", visit_segments_30d: 51,
          audience_segments: ["high_intent_shopper", "iab_shopping_core", "iab_entertainment_fan"],
          audience_segments_iab: ["iab_shopping_core", "iab_entertainment_fan"],
          audience_segments_rollup: ["high_intent_shopper"],
          intent_score: 9, top_brands: ["Apple", "Sony", "Bose"],
          search_queries: ["airpods pro 2 vs sony wf1000xm5", "best wireless earbuds india"],
          prices_viewed: ["₹24900", "₹19990"], breadcrumbs: ["Electronics", "Audio", "Earbuds"],
          page_types: ["comparison", "product", "checkout"], scroll_depth: 91,
          visit_frequency: 15, age_range: "18-24", gender: "F", city: "Mumbai", device: "desktop"
        }
      ],
      userCount: countPackageUsers("high_intent_shoppers"),
      price: 449,
      formats: ["csv", "json"],
      useCases: ["Performance marketing", "Retargeting campaigns", "Product launch targeting", "Competitive conquest"]
    },
    {
      id: "cross_platform_behavioral",
      tier: 1,
      name: "Cross-Platform Behavioral Profile",
      tagline: "Full 360° consumer behavior — data no single platform can offer",
      description: "The most comprehensive behavioral dataset available. Reclaim's browser extension captures behavior across ALL sites — something Meta, Google, or Amazon can never do individually. Includes audience segments from both internal rollups and IAB Content Taxonomy topic time.",
      strongNow: true,
      strongerAfterOnboarding: false,
      signals: [
        "Cross-site category distribution",
        "Brand affinity scores across all categories",
        "Search queries across Google, Amazon, YouTube, Flipkart",
        "Time-of-day browsing patterns",
        "Device type and peak active hours",
        "Content engagement (scroll depth)",
        "Page type journey",
        "IAB Content Taxonomy tier-1 time segments (parallel to internal rollups)"
      ],
      dataFields: [
        "user_id", "visit_segments_30d", "audience_segments", "audience_segments_iab", "audience_segments_rollup",
        "category_distribution_pct", "top_other_domains",
        "top_brands", "all_search_queries", "peak_hour", "device", "avg_scroll_depth",
        "cross_platform_query_intent_level", "cross_platform_query_intent_reasons", "cross_platform_query_topics", "cross_platform_query_keyword_hits",
        "total_browsing_hours", "age_range", "gender", "occupation", "city", "region", "country"
      ],
      sampleData: [
        {
          user_id: "usr_a7f2k9", visit_segments_30d: 42,
          audience_segments: ["tech_early_adopter", "iab_technology_core", "iab_multi_category_researcher"],
          audience_segments_iab: ["iab_technology_core", "iab_multi_category_researcher", "iab_shopping_core"],
          audience_segments_rollup: ["tech_early_adopter"],
          category_distribution_pct: { shopping: 34, technology: 28, entertainment: 18, finance: 12, other: 8 },
          top_other_domains: ["reddit.com", "medium.com"],
          top_brands: ["Apple", "Netflix", "GitHub", "Zerodha"],
          all_search_queries: ["iphone 15 pro", "best mutual fund 2026", "react hooks tutorial"],
          peak_hour: 23, device: "desktop",
          avg_scroll_depth: 67, total_browsing_hours: 4.2,
          age_range: "18-24", gender: "M", occupation: "Student", city: "Roorkee"
        },
        {
          user_id: "usr_d2n7q3", visit_segments_30d: 28,
          audience_segments: ["finance_decision_maker", "iab_business_finance_core", "iab_personal_finance_core"],
          audience_segments_iab: ["iab_business_finance_core", "iab_personal_finance_core"],
          audience_segments_rollup: ["finance_decision_maker"],
          category_distribution_pct: { finance: 41, news: 22, technology: 19, shopping: 11, other: 7 },
          top_other_domains: ["economictimes.indiatimes.com"],
          top_brands: ["Zerodha", "Bloomberg", "Microsoft", "Amazon"],
          all_search_queries: ["nifty 50 analysis", "best index fund india", "macbook pro m4"],
          peak_hour: 8, device: "mobile",
          avg_scroll_depth: 55, total_browsing_hours: 3.1,
          age_range: "25-34", gender: "M", occupation: "Software Engineer", city: "Bangalore"
        },
        {
          user_id: "usr_e5k2r8", visit_segments_30d: 51,
          audience_segments: ["high_intent_shopper", "iab_health_wellness", "iab_style_fashion"],
          audience_segments_iab: ["iab_health_wellness", "iab_style_fashion", "iab_shopping_core"],
          audience_segments_rollup: ["high_intent_shopper"],
          category_distribution_pct: { shopping: 29, social: 24, entertainment: 21, health: 14, other: 12 },
          top_other_domains: ["quora.com", "pinterest.com"],
          top_brands: ["Nykaa", "Netflix", "Practo", "Myntra"],
          all_search_queries: ["vitamin c serum india", "best skincare routine", "zara sale 2026"],
          peak_hour: 21, device: "mobile",
          avg_scroll_depth: 73, total_browsing_hours: 5.8,
          age_range: "18-24", gender: "F", occupation: "Student", city: "Mumbai"
        }
      ],
      userCount: countPackageUsers("cross_platform_behavioral"),
      price: 599,
      formats: ["csv", "json"],
      useCases: ["Audience segmentation", "Lookalike modeling", "Brand affinity research", "Consumer journey mapping"]
    },
    {
      id: "finance_decision_makers",
      tier: 2,
      name: "Finance Decision Makers",
      tagline: "Users actively researching financial products — near conversion",
      description: "High-value audience actively browsing investment platforms, loan calculators, banking products, and insurance comparisons. Includes audience segments from both internal rollups and IAB Content Taxonomy topic time.",
      strongNow: true,
      strongerAfterOnboarding: true,
      onboardingUpgrade: "Occupation data (salaried/business owner/student) increases package value 3x for lenders and investment platforms",
      signals: [
        "Finance category browsing 15+ minutes",
        "Search queries: home loan, mutual fund, SIP, insurance, EMI calculator",
        "Investment platform visits (Zerodha, Groww, Upstox)",
        "Banking product page visits",
        "Intent scores on finance pages"
      ],
      dataFields: [
        "user_id", "visit_segments_30d", "audience_segments", "audience_segments_iab", "audience_segments_rollup",
        "finance_platforms_visited", "search_queries", "intent_score",
        "finance_query_intent_level", "finance_query_intent_reasons", "finance_query_topics", "finance_query_keyword_hits",
        "visit_frequency", "age_range", "gender", "occupation", "city", "region", "country", "device"
      ],
      sampleData: [
        {
          user_id: "usr_f1m4k9", visit_segments_30d: 31,
          audience_segments: ["finance_decision_maker", "iab_business_finance_core"],
          audience_segments_iab: ["iab_business_finance_core", "iab_personal_finance_core"],
          audience_segments_rollup: ["finance_decision_maker"],
          finance_platforms_visited: ["zerodha.com", "groww.in", "moneycontrol.com"],
          search_queries: ["best mutual fund sip 2026", "nifty 50 index fund returns"],
          intent_score: 8,
          visit_frequency: 9, age_range: "25-34", gender: "M", occupation: "Software Engineer", city: "Bangalore", device: "desktop"
        },
        {
          user_id: "usr_g7p2s1", visit_segments_30d: 19,
          audience_segments: ["finance_decision_maker", "iab_finance_content_dominant"],
          audience_segments_iab: ["iab_finance_content_dominant", "iab_business_finance_core"],
          audience_segments_rollup: ["finance_decision_maker"],
          finance_platforms_visited: ["sbi.co.in", "hdfc.com", "bankbazaar.com"],
          search_queries: ["home loan eligibility calculator", "sbi home loan rate 2026"],
          intent_score: 9,
          visit_frequency: 14, age_range: "28-35", gender: "M", occupation: "Salaried", city: "Pune", device: "mobile"
        },
        {
          user_id: "usr_h3n8t4", visit_segments_30d: 12,
          audience_segments: ["finance_decision_maker", "iab_personal_finance_core"],
          audience_segments_iab: ["iab_personal_finance_core", "iab_business_finance_core"],
          audience_segments_rollup: ["finance_decision_maker"],
          finance_platforms_visited: ["policybazaar.com", "coverfox.com"],
          search_queries: ["term insurance 1 crore premium", "best health insurance family floater"],
          intent_score: 7,
          visit_frequency: 6, age_range: "30-40", gender: "F", occupation: "Business Owner", city: "Delhi", device: "desktop"
        }
      ],
      userCount: countPackageUsers("finance_decision_makers"),
      price: 649,
      formats: ["csv", "json"],
      useCases: ["Fintech user acquisition", "Loan lead generation", "Investment platform growth", "Insurance cross-sell"]
    },
    {
      id: "tech_early_adopters",
      tier: 1,
      name: "Tech Early Adopters",
      tagline: "Developers, AI users, and tech enthusiasts — first to adopt new tools",
      description: "Heavy technology browsers who use AI tools, developer platforms, and consume tech content daily. Includes audience segments from both internal rollups and IAB Content Taxonomy topic time.",
      strongNow: true,
      strongerAfterOnboarding: false,
      signals: [
        "Technology category 30%+ of total browsing",
        "AI tool usage (claude.ai, openai.com)",
        "Developer platform visits (GitHub, StackOverflow, Vercel)",
        "Tech news consumption",
        "Search queries for tools, frameworks, APIs",
        "Audience segments: internal rollups + IAB Content Taxonomy tier-1 time"
      ],
      dataFields: [
        "user_id", "visit_segments_30d", "audience_segments", "audience_segments_iab", "audience_segments_rollup",
        "tech_tools_used", "ai_tools_used", "search_queries",
        "tech_query_intent_level", "tech_query_intent_reasons", "tech_query_topics", "tech_query_keyword_hits",
        "dev_platforms_visited", "tech_browsing_hours", "device", "age_range",
        "gender", "occupation", "city", "region", "country"
      ],
      sampleData: [
        {
          user_id: "usr_i9q5v2", visit_segments_30d: 36,
          audience_segments: ["tech_early_adopter", "iab_technology_core", "iab_technology_audience_dominant"],
          audience_segments_iab: ["iab_technology_core", "iab_technology_audience_dominant"],
          audience_segments_rollup: ["tech_early_adopter"],
          tech_tools_used: ["github.com", "vercel.com", "figma.com"],
          ai_tools_used: ["claude.ai", "openai.com"],
          search_queries: ["react server components 2026", "next.js vs remix"],
          dev_platforms_visited: ["stackoverflow.com", "github.com"],
          tech_browsing_hours: 3.8, device: "desktop",
          age_range: "18-24", gender: "M", occupation: "Student", city: "Roorkee"
        },
        {
          user_id: "usr_j2w7b6", visit_segments_30d: 44,
          audience_segments: ["tech_early_adopter", "iab_technology_core"],
          audience_segments_iab: ["iab_technology_core", "iab_gaming_enthusiast"],
          audience_segments_rollup: ["tech_early_adopter"],
          tech_tools_used: ["github.com", "aws.amazon.com"],
          ai_tools_used: ["openai.com", "claude.ai"],
          search_queries: ["gpt-4o api vs claude 3.5", "aws lambda pricing"],
          dev_platforms_visited: ["github.com", "stackoverflow.com"],
          tech_browsing_hours: 5.1, device: "desktop",
          age_range: "25-34", gender: "M", occupation: "Software Engineer", city: "Hyderabad"
        },
        {
          user_id: "usr_k4r1m8", visit_segments_30d: 22,
          audience_segments: ["tech_early_adopter", "iab_technology_core"],
          audience_segments_iab: ["iab_technology_core", "iab_style_fashion"],
          audience_segments_rollup: ["tech_early_adopter"],
          tech_tools_used: ["figma.com", "notion.so"],
          ai_tools_used: ["claude.ai"],
          search_queries: ["figma vs framer 2026", "best design system 2026"],
          dev_platforms_visited: ["producthunt.com", "figma.com"],
          tech_browsing_hours: 2.9, device: "desktop",
          age_range: "25-34", gender: "F", occupation: "Product Manager", city: "Bangalore"
        }
      ],
      userCount: countPackageUsers("tech_early_adopters"),
      price: 399,
      formats: ["csv", "json"],
      useCases: ["SaaS user acquisition", "Developer tool marketing", "B2B tech sales", "AI product launch"]
    },
    {
      id: "real_estate_prospects",
      tier: 2,
      name: "Real Estate Prospects",
      tagline: "Active property searchers weeks before they contact a broker",
      description: "Users actively browsing property listings with location-specific searches. Includes audience segments from both internal rollups and IAB Content Taxonomy topic time.",
      strongNow: true,
      strongerAfterOnboarding: true,
      onboardingUpgrade: "City from onboarding allows geo-targeted delivery — a Mumbai user searching 3BHK is worth 10x more than anonymous",
      signals: [
        "Real estate platform visits (MagicBricks, 99acres, NoBroker)",
        "Property search queries with BHK, location, budget",
        "Property type extraction from titles",
        "Intent scores on listing pages",
        "Audience segments: internal rollups + IAB Content Taxonomy tier-1 time"
      ],
      dataFields: [
        "user_id", "visit_segments_30d", "audience_segments", "audience_segments_iab", "audience_segments_rollup",
        "property_platforms_visited", "search_queries", "property_types",
        "property_query_intent_level", "property_query_intent_reasons", "property_query_topics", "property_query_keyword_hits",
        "locations_searched", "intent_score", "visit_frequency", "age_range",
        "gender", "occupation", "city", "region", "country", "device"
      ],
      sampleData: [
        {
          user_id: "usr_l6s3n1", visit_segments_30d: 24,
          audience_segments: ["property_seeker", "iab_real_estate_intender"],
          audience_segments_iab: ["iab_real_estate_intender"],
          audience_segments_rollup: ["property_seeker"],
          property_platforms_visited: ["magicbricks.com", "99acres.com"],
          search_queries: ["3bhk flat roorkee", "flat for sale under 50 lakhs roorkee"],
          property_types: ["3BHK", "2BHK"], locations_searched: ["Roorkee", "Haridwar Road"],
          intent_score: 8, visit_frequency: 11,
          age_range: "25-34", gender: "M", occupation: "Engineer", city: "Roorkee", device: "mobile"
        },
        {
          user_id: "usr_m8t5p3", visit_segments_30d: 18,
          audience_segments: ["property_seeker", "iab_real_estate_intender", "iab_travel_core"],
          audience_segments_iab: ["iab_real_estate_intender", "iab_travel_core"],
          audience_segments_rollup: ["property_seeker"],
          property_platforms_visited: ["housing.com", "magicbricks.com"],
          search_queries: ["2bhk rent mumbai andheri west", "flat on rent bandra"],
          property_types: ["2BHK", "PG"], locations_searched: ["Andheri West", "Bandra"],
          intent_score: 7, visit_frequency: 8,
          age_range: "22-28", gender: "F", occupation: "Working Professional", city: "Mumbai", device: "mobile"
        },
        {
          user_id: "usr_n2v4k7", visit_segments_30d: 31,
          audience_segments: ["property_seeker", "iab_real_estate_intender", "iab_automotive_intender"],
          audience_segments_iab: ["iab_real_estate_intender", "iab_automotive_intender"],
          audience_segments_rollup: ["property_seeker"],
          property_platforms_visited: ["99acres.com", "nobroker.in"],
          search_queries: ["villa for sale bangalore whitefield", "plot in sarjapur road"],
          property_types: ["Villa", "Plot"], locations_searched: ["Whitefield", "Sarjapur Road"],
          intent_score: 9, visit_frequency: 17,
          age_range: "35-45", gender: "M", occupation: "Business Owner", city: "Bangalore", device: "desktop"
        }
      ],
      userCount: countPackageUsers("real_estate_prospects"),
      price: 549,
      formats: ["csv", "json"],
      useCases: ["Real estate developer targeting", "Home loan lead gen", "Broker acquisition"]
    },
    {
      id: "night_owl_impulse_buyers",
      tier: 1,
      name: "Night Owl Impulse Buyers",
      tagline: "Late-night mobile shoppers — highest impulse purchase rate",
      description: "Users who show late-night commerce intent (shopping domains, product/checkout behavior, prices seen, or high intent scores) between 10pm–2am. Includes audience segments from both internal rollups and IAB Content Taxonomy topic time.",
      strongNow: true,
      strongerAfterOnboarding: false,
      signals: [
        "Late-night commerce intent between 10pm–2am",
        "Shopping domains and product/checkout behavior",
        "Prices seen or high intent scores (7+)",
        "Impulse categories: fashion, electronics, food delivery, OTT",
        "Audience segments: internal rollups + IAB Content Taxonomy tier-1 time"
      ],
      dataFields: [
        "user_id", "visit_segments_30d", "audience_segments", "audience_segments_iab", "audience_segments_rollup",
        "peak_shopping_hours", "device", "late_night_categories",
        "late_night_brands", "late_night_search_queries",
        "late_night_query_intent_level", "late_night_query_intent_reasons", "late_night_query_topics",
        "late_night_query_keyword_hits",
        "avg_session_duration_night_seconds",
        "age_range", "gender", "occupation", "city", "region", "country"
      ],
      sampleData: [
        {
          user_id: "usr_o3x6q9", visit_segments_30d: 38,
          audience_segments: ["night_owl_shopper", "high_intent_shopper", "iab_food_drink_enthusiast", "iab_entertainment_fan"],
          audience_segments_iab: ["iab_food_drink_enthusiast", "iab_entertainment_fan", "iab_shopping_core"],
          audience_segments_rollup: ["night_owl_shopper", "high_intent_shopper"],
          peak_shopping_hours: ["23:00", "00:30", "01:15"],
          device: "mobile", late_night_categories: ["shopping", "entertainment", "food"],
          late_night_brands: ["Myntra", "Swiggy", "Netflix"],
          late_night_search_queries: ["myntra sale tonight", "swiggy promo code"],
          late_night_query_intent_level: "high",
          late_night_query_intent_reasons: ["deal", "coupon", "delivery"],
          late_night_query_topics: ["fashion", "food_delivery"],
          late_night_query_keyword_hits: { deal: 1, coupon: 1, delivery: 1 },
          avg_session_duration_night_seconds: 1240,
          age_range: "18-24", gender: "F", occupation: "Student", city: "Delhi"
        },
        {
          user_id: "usr_p7y1s5", visit_segments_30d: 22,
          audience_segments: ["night_owl_shopper", "tech_early_adopter", "iab_technology_core"],
          audience_segments_iab: ["iab_technology_core", "iab_shopping_core"],
          audience_segments_rollup: ["night_owl_shopper", "tech_early_adopter"],
          peak_shopping_hours: ["22:30", "23:45", "00:15"],
          device: "mobile", late_night_categories: ["shopping", "technology"],
          late_night_brands: ["Amazon", "Flipkart", "YouTube"],
          late_night_search_queries: ["amazon flash sale tonight", "budget gaming laptop"],
          late_night_query_intent_level: "medium",
          late_night_query_intent_reasons: ["deal", "price", "compare"],
          late_night_query_topics: ["electronics"],
          late_night_query_keyword_hits: { deal: 1, price: 1, compare: 1 },
          avg_session_duration_night_seconds: 980,
          age_range: "18-24", gender: "M", occupation: "Student", city: "Pune"
        },
        {
          user_id: "usr_q5w8r2", visit_segments_30d: 45,
          audience_segments: ["night_owl_shopper", "high_intent_shopper", "iab_food_drink_enthusiast"],
          audience_segments_iab: ["iab_food_drink_enthusiast", "iab_shopping_core"],
          audience_segments_rollup: ["night_owl_shopper", "high_intent_shopper"],
          peak_shopping_hours: ["23:00", "00:45"],
          device: "mobile", late_night_categories: ["food", "shopping", "social"],
          late_night_brands: ["Zomato", "Meesho", "Instagram"],
          late_night_search_queries: ["zomato midnight delivery", "meesho sale dresses"],
          late_night_query_intent_level: "high",
          late_night_query_intent_reasons: ["delivery", "deal"],
          late_night_query_topics: ["food_delivery", "fashion"],
          late_night_query_keyword_hits: { delivery: 1, deal: 1 },
          avg_session_duration_night_seconds: 1520,
          age_range: "22-30", gender: "F", occupation: "Working Professional", city: "Hyderabad"
        }
      ],
      userCount: countPackageUsers("night_owl_impulse_buyers"),
      price: 379,
      formats: ["csv", "json"],
      useCases: ["D2C flash sale targeting", "Food delivery promotions", "Late-night OTT acquisition"]
    }
  ];
}

app.get("/api/packages", (req, res) => {
  return res.json(getPackagesPayload());
});

// ─── PACKAGE ROW BUILDER (shared) ─────────────────────────────────────────────

async function buildPackageRows(packageId, opts = {}) {
  const idScope = opts.companyScope ? `company:${opts.companyScope}` : "public";
  const allUserIds = Object.keys(userSessions);
  const rows = [];
  const taxonomy = await iabTaxonomyPromise;

  for (const uid of allUserIds) {
    const uidOut = exportUserId(idScope, uid);
    const sessions = userSessions[uid] || {};
    const profile = userProfiles[uid] || {};
    const user = users[uid] || {};

    let totalCatSeconds = {};
    let allSearchQueries = [];
    let allBrands = {};
    let allDomains = {};
    let visitHours = [];
    let maxScrollDepth = 0;
    let deviceType = null;

    for (const day of Object.values(sessions)) {
      for (const s of Object.values(day)) {
        const cat = s.category || "other";
        totalCatSeconds[cat] = (totalCatSeconds[cat] || 0) + (s.totalSeconds || 0);
        if (s.searchQueries) allSearchQueries.push(...s.searchQueries);
        if (s.brand) allBrands[s.brand] = (allBrands[s.brand] || 0) + 1;
        if (s.visitHours) visitHours.push(...s.visitHours);
        if (s.maxScrollDepth > maxScrollDepth) maxScrollDepth = s.maxScrollDepth;
        if (s.deviceType) deviceType = s.deviceType;
        if (!allDomains[cat]) allDomains[cat] = [];
        allDomains[cat].push(s.domain);
      }
    }

    const topBrands = Object.entries(allBrands).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([b]) => b);
    const totalSecAll = Object.values(totalCatSeconds).reduce((a, b) => a + b, 0);
    const totalHours = (totalSecAll / 3600).toFixed(1);
    const lateNightHours = visitHours.filter(h => h >= 22 || h <= 2);

    const visitCutoff = Date.now() - 30 * 86400000;
    const visitSegments30d = (userVisitLogs[uid] || []).filter(v => (v.ts || 0) >= visitCutoff).length;
    const visitMeta = { visit_segments_30d: visitSegments30d };
    const segFields = audienceSegmentExportFields(sessions, totalCatSeconds, totalSecAll, visitHours, taxonomy.byId);
    const segCols = segFields || {
      audience_segments: null,
      audience_segments_iab: null,
      audience_segments_rollup: null,
    };

    const dem = {
      age_range: profile.age_range || user.profile?.age_range || null,
      gender: profile.gender || user.profile?.gender || null,
      occupation: profile.occupation || user.profile?.occupation || null,
      city: profile.location?.city || null,
      region: profile.location?.region || null,
      country: profile.location?.country || null,
    };

    switch (packageId) {
      case "high_intent_shoppers": {
        const shoppingSessions = Object.values(sessions).flatMap(d =>
          Object.values(d).filter(s => s.category === "shopping" && s.intent_score >= 7)
        );
        if (!shoppingSessions.length) continue;
        const maxIntent = Math.max(...shoppingSessions.map(s => s.intent_score));
        const prices = normalizePricesFound(shoppingSessions.flatMap(s => s.pricesFound || [])).slice(0, 5);
        const breadcrumbs = shoppingSessions.find(s => s.breadcrumbs?.length)?.breadcrumbs || [];
        const qList = [...new Set(allSearchQueries)].slice(0, 10);
        const qInsights = inferQueryInsights(qList, "shopping");
        rows.push({
          user_id: uidOut, ...visitMeta,
          ...segCols,
          intent_score: maxIntent, top_brands: topBrands,
          search_queries: qList,
          ...qInsights,
          shopping_query_intent_level: qInsights.shopping_query_intent_level ?? null,
          shopping_query_intent_reasons: qInsights.shopping_query_intent_reasons ?? null,
          shopping_query_topics: qInsights.shopping_query_topics ?? null,
          shopping_query_keyword_hits: qInsights.shopping_query_keyword_hits ?? null,
          prices_viewed: prices, breadcrumbs,
          page_types: [...new Set(shoppingSessions.flatMap(s => s.pageTypes || []))],
          scroll_depth: maxScrollDepth,
          visit_frequency: shoppingSessions.reduce((a, s) => a + s.visits, 0),
          ...dem, device: deviceType
        });
        break;
      }
      case "cross_platform_behavioral": {
        if (Object.keys(totalCatSeconds).length < 3) continue;
        const total = Object.values(totalCatSeconds).reduce((a, b) => a + b, 0);
        const catDist = {};
        for (const [c, sec] of Object.entries(totalCatSeconds)) {
          catDist[c] = Math.round((sec / total) * 100);
        }
        const otherHosts = [...new Set((allDomains.other || []).map(d => String(d).replace(/^www\./i, "")))].slice(0, 10);
        const hourCounts = {};
        visitHours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1; });
        const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        const allQ = [...new Set(allSearchQueries)].slice(0, 20);
        const qInsights = inferQueryInsights(allQ, "cross_platform");
        rows.push({
          user_id: uidOut, ...visitMeta,
          ...segCols,
          category_distribution_pct: catDist,
          ...(otherHosts.length ? { top_other_domains: otherHosts } : {}),
          top_brands: topBrands,
          all_search_queries: allQ,
          ...qInsights,
          cross_platform_query_intent_level: qInsights.cross_platform_query_intent_level ?? null,
          cross_platform_query_intent_reasons: qInsights.cross_platform_query_intent_reasons ?? null,
          cross_platform_query_topics: qInsights.cross_platform_query_topics ?? null,
          cross_platform_query_keyword_hits: qInsights.cross_platform_query_keyword_hits ?? null,
          peak_hour: peakHour ? parseInt(peakHour) : null,
          device: deviceType, avg_scroll_depth: maxScrollDepth,
          total_browsing_hours: parseFloat(totalHours),
          ...dem
        });
        break;
      }
      case "finance_decision_makers": {
        if ((totalCatSeconds.finance || 0) < 900) continue;
        const finDomains = allDomains.finance || [];
        const finQueries = allSearchQueries.filter(q =>
          /loan|mutual|sip|insurance|emi|invest|fund|bank|credit|demat/i.test(q)
        );
        const finIntent = Object.values(sessions).flatMap(d =>
          Object.values(d).filter(s => s.category === "finance").map(s => s.intent_score || 3)
        );
        const qList = finQueries.slice(0, 10);
        const qInsights = inferQueryInsights(qList, "finance");
        rows.push({
          user_id: uidOut, ...visitMeta,
          ...segCols,
          finance_platforms_visited: [...new Set(finDomains)].slice(0, 5),
          search_queries: qList,
          ...qInsights,
          finance_query_intent_level: qInsights.finance_query_intent_level ?? null,
          finance_query_intent_reasons: qInsights.finance_query_intent_reasons ?? null,
          finance_query_topics: qInsights.finance_query_topics ?? null,
          finance_query_keyword_hits: qInsights.finance_query_keyword_hits ?? null,
          intent_score: finIntent.length ? Math.max(...finIntent) : 3,
          visit_frequency: Object.values(sessions).flatMap(d =>
            Object.values(d).filter(s => s.category === "finance")
          ).reduce((a, s) => a + s.visits, 0),
          ...dem, device: deviceType
        });
        break;
      }
      case "tech_early_adopters": {
        if ((totalCatSeconds.technology || 0) < 1800) continue;
        const techDomains = allDomains.technology || [];
        const aiTools = techDomains.filter(d => ["claude.ai", "openai.com", "midjourney.com", "perplexity.ai"].includes(d));
        const devPlatforms = techDomains.filter(d => ["github.com", "stackoverflow.com", "vercel.com", "netlify.com", "leetcode.com"].includes(d));
        const qList = allSearchQueries.slice(0, 10);
        const qInsights = inferQueryInsights(qList, "tech");
        rows.push({
          user_id: uidOut, ...visitMeta,
          ...segCols,
          tech_tools_used: [...new Set(techDomains)].slice(0, 8),
          ai_tools_used: [...new Set(aiTools)],
          search_queries: qList,
          ...qInsights,
          tech_query_intent_level: qInsights.tech_query_intent_level ?? null,
          tech_query_intent_reasons: qInsights.tech_query_intent_reasons ?? null,
          tech_query_topics: qInsights.tech_query_topics ?? null,
          tech_query_keyword_hits: qInsights.tech_query_keyword_hits ?? null,
          dev_platforms_visited: [...new Set(devPlatforms)],
          tech_browsing_hours: parseFloat((totalCatSeconds.technology / 3600).toFixed(1)),
          device: deviceType, ...dem
        });
        break;
      }
      case "real_estate_prospects": {
        if (!(totalCatSeconds.realestate > 0)) continue;
        const reSessions = Object.values(sessions).flatMap(d =>
          Object.values(d).filter(s => s.category === "realestate")
        );
        const reDomains = allDomains.realestate || [];
        const reQueries = allSearchQueries.filter(q =>
          /bhk|flat|apartment|villa|plot|rent|sale|property/i.test(q)
        );
        const qList = reQueries.slice(0, 10);
        const qInsights = inferQueryInsights(qList, "property");
        rows.push({
          user_id: uidOut, ...visitMeta,
          ...segCols,
          property_platforms_visited: [...new Set(reDomains)].slice(0, 5),
          search_queries: qList,
          ...qInsights,
          property_query_intent_level: qInsights.property_query_intent_level ?? null,
          property_query_intent_reasons: qInsights.property_query_intent_reasons ?? null,
          property_query_topics: qInsights.property_query_topics ?? null,
          property_query_keyword_hits: qInsights.property_query_keyword_hits ?? null,
          property_types: [...new Set(reSessions.map(s => s.property_type).filter(Boolean))],
          locations_searched: [...new Set(reSessions.map(s => s.location).filter(Boolean))],
          intent_score: Math.max(...reSessions.map(s => s.intent_score || 3)),
          visit_frequency: reSessions.reduce((a, s) => a + s.visits, 0),
          ...dem, device: deviceType
        });
        break;
      }
      case "night_owl_impulse_buyers": {
        if (!lateNightHours.length) continue;
        const nightSessions = Object.values(sessions).flatMap(d =>
          Object.values(d).filter(s => s.visitHours?.some(h => h >= 22 || h <= 2))
        );
        if (!nightSessions.length) continue;

        const commerceSessions = nightSessions.filter((s) => {
          const cat = s.category || "other";
          const pts = Array.isArray(s.pageTypes) ? s.pageTypes : [];
          const hasPrices = Array.isArray(s.pricesFound) && s.pricesFound.length > 0;
          return (
            cat === "shopping" ||
            pts.includes("checkout") ||
            (pts.includes("product") && hasPrices) ||
            ((s.intent_score ?? 0) >= 7)
          );
        });
        if (!commerceSessions.length) continue;

        const commerceHours = commerceSessions.flatMap(s => (Array.isArray(s.visitHours) ? s.visitHours : [])).filter(h => h >= 22 || h <= 2);
        const hasPricesSeen = commerceSessions.some(s => Array.isArray(s.pricesFound) && s.pricesFound.length > 0);
        const hasCheckout = commerceSessions.some(s => Array.isArray(s.pageTypes) && s.pageTypes.includes("checkout"));
        const purchaseQueryRe = /\b(buy|price|deal|discount|coupon|sale|offer|best|under|cheap|review|vs|compare|specs?|shipping|delivery)\b/i;
        const commerceQueries = [...new Set(commerceSessions.flatMap(s => Array.isArray(s.searchQueries) ? s.searchQueries : []))]
          .map(q => String(q || "").trim())
          .filter(q => q && purchaseQueryRe.test(q))
          .slice(0, 12);
        if (!commerceQueries.length && !hasPricesSeen && !hasCheckout) continue;

        const queryInsights = inferQueryInsights(commerceQueries, "late_night");

        rows.push({
          user_id: uidOut, ...visitMeta,
          ...segCols,
          peak_shopping_hours: (commerceHours.length ? commerceHours : lateNightHours).map(h => `${h}:00`),
          device: deviceType,
          late_night_categories: [...new Set(commerceSessions.map(s => s.category).filter(Boolean))],
          late_night_brands: [...new Set(commerceSessions.map(s => s.brand).filter(Boolean))].slice(0, 5),
          late_night_search_queries: commerceQueries.length ? commerceQueries : null,
          ...queryInsights,
          avg_session_duration_night_seconds: Math.round(
            commerceSessions.reduce((a, s) => a + (s.totalSeconds || 0), 0) / (commerceSessions.length || 1)
          ),
          ...dem
        });
        break;
      }
      default:
        break;
    }
  }

  return rows;
}

// ─── CUSTOM PACKAGE PRICING (source of truth; must stay in sync with dashboard DATA_CATEGORIES) ─

const CUSTOM_PACKAGE_BASE_USD = 49;
/** Addon prices — keep in sync with `DATA_CATEGORIES[].price` in `dashboard/src/pages/CompanyDashboard.jsx`. */
const CUSTOM_CATEGORY_PRICE_USD = {
  demographics: 39,
  browsing_behavior: 49,
  purchase_intent: 69,
  brand_affinity: 49,
  content_signals: 39,
  temporal_patterns: 35,
  ecommerce_signals: 59,
  finance_signals: 79,
  tech_affinity: 49,
  audience_segments: 45,
};

/** Export field names per category — keep in sync with `DATA_CATEGORIES[].exportColumns` in CompanyDashboard.jsx and with `buildCustomPackageRows`. */
const CUSTOM_CATEGORY_EXPORT_COLUMNS = {
  demographics: ["age_range", "gender", "occupation", "city", "state", "country", "device"],
  browsing_behavior: [
    "top_categories",
    "total_browsing_hours",
    "time_spent_per_category",
    "active_days",
    "peak_hour",
    "iab_provider",
    "iab_taxonomy",
    "iab_primary_id",
    "iab_primary_name",
    "iab_primary_confidence",
    "iab_primary_weight_seconds",
    "iab_top_categories",
    "iab_content_taxonomy_version",
    "iab_content_primary_id",
    "iab_content_primary_name",
    "iab_content_primary_confidence",
    "iab_content_primary_weight_seconds",
    "iab_content_affinity_top",
  ],
  purchase_intent: [
    "max_intent_score",
    "intent_by_vertical",
    "price_ranges_viewed",
    "intent_search_queries",
    "intent_query_intent_level",
    "intent_query_intent_reasons",
    "intent_query_topics",
    "intent_query_keyword_hits",
  ],
  brand_affinity: ["top_brands_researched", "premium_brands", "premium_brand_flag", "brand_cross_site_visits"],
  content_signals: [
    "page_types",
    "search_queries",
    "content_query_intent_level",
    "content_query_intent_reasons",
    "content_query_topics",
    "content_query_keyword_hits",
    "max_scroll_depth",
    "breadcrumbs",
    "keywords",
  ],
  temporal_patterns: ["peak_hour", "is_night_owl", "late_night_hours", "hour_distribution", "active_days"],
  ecommerce_signals: ["shopping_domains", "prices_found", "checkout_visits", "product_page_visits", "shopping_brands"],
  finance_signals: [
    "finance_browsing_hours", "finance_intent_level", "finance_decision_maker", "finance_domains_visited",
    "finance_search_queries", "max_finance_intent_score",
    "finance_query_intent_level", "finance_query_intent_reasons", "finance_query_topics", "finance_query_keyword_hits",
  ],
  tech_affinity: [
    "tech_browsing_hours", "tech_early_adopter", "tech_domains_visited", "ai_tools_used",
    "dev_platforms_visited", "tech_brands_researched", "device",
  ],
  audience_segments: ["audience_segments", "audience_segments_iab", "audience_segments_rollup"],
};

function parseCustomCategoryIds(categoryIds) {
  if (!categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0) {
    return { ok: false, error: "categoryIds array required" };
  }
  const asStrings = categoryIds.map(id => String(id));
  const uniq = [...new Set(asStrings)];
  if (uniq.length !== asStrings.length) {
    return { ok: false, error: "duplicate categoryIds are not allowed" };
  }
  for (const id of uniq) {
    if (!CUSTOM_CATEGORY_PRICE_USD[id]) {
      return { ok: false, error: `unknown category: ${id}` };
    }
  }
  return { ok: true, ids: uniq };
}

function computeCustomPackagePriceUsd(ids) {
  return CUSTOM_PACKAGE_BASE_USD + ids.reduce((s, id) => s + CUSTOM_CATEGORY_PRICE_USD[id], 0);
}

// ─── CUSTOM PACKAGE ROW BUILDER ───────────────────────────────────────────────

const PREMIUM_BRANDS_LOWER = new Set([
  "apple", "samsung", "sony", "bmw", "mercedes", "nike", "adidas",
  "rolex", "lv", "gucci", "netflix", "google", "microsoft", "amazon",
]);

async function buildCustomPackageRows(categoryIds, opts = {}) {
  const idScope = opts.companyScope ? `company:${opts.companyScope}` : "public";
  const catSet = new Set(categoryIds);
  const allUserIds = Object.keys(userSessions);
  const rows = [];
  const taxonomy = await iabTaxonomyPromise;

  for (const uid of allUserIds) {
    const uidOut = exportUserId(idScope, uid);
    const sessions = userSessions[uid] || {};
    const profile = userProfiles[uid] || {};
    const user = users[uid] || {};

    let totalCatSeconds = {};
    let allSearchQueries = [];
    let allBrands = {};
    let allDomains = {};
    let visitHours = [];
    let maxScrollDepth = 0;
    let deviceType = null;
    let allPricesFound = [];
    let allBreadcrumbs = [];
    let allPageTypes = [];
    let allKeywords = [];
    let checkoutVisits = 0;
    let productVisits = 0;
    let intentScores = [];

    for (const day of Object.values(sessions)) {
      for (const s of Object.values(day)) {
        const cat = s.category || "other";
        totalCatSeconds[cat] = (totalCatSeconds[cat] || 0) + (s.totalSeconds || 0);
        if (s.searchQueries) allSearchQueries.push(...s.searchQueries);
        if (s.brand) allBrands[s.brand] = (allBrands[s.brand] || 0) + 1;
        if (s.visitHours) visitHours.push(...s.visitHours);
        if ((s.maxScrollDepth || 0) > maxScrollDepth) maxScrollDepth = s.maxScrollDepth;
        if (s.deviceType && !deviceType) deviceType = s.deviceType;
        if (s.pricesFound) allPricesFound.push(...s.pricesFound);
        if (s.breadcrumbs) allBreadcrumbs.push(...s.breadcrumbs);
        if (s.pageTypes) allPageTypes.push(...s.pageTypes);
        if (s.keywords) allKeywords.push(...s.keywords);
        if (s.intent_score) intentScores.push(s.intent_score);
        const pts = Array.isArray(s.pageTypes) ? s.pageTypes : [];
        if (pts.includes("checkout")) checkoutVisits++;
        if (pts.includes("product")) productVisits++;
        if (!allDomains[cat]) allDomains[cat] = [];
        allDomains[cat].push(s.domain);
      }
    }

    const totalSecondsAll = Object.values(totalCatSeconds).reduce((a, b) => a + b, 0);
    if (totalSecondsAll === 0) continue;

    const topBrands = Object.entries(allBrands).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([b]) => b);
    const lateNightHrs = visitHours.filter(h => h >= 22 || h <= 2);
    const peakHour = visitHours.length
      ? (() => {
          const c = {};
          visitHours.forEach(h => { c[h] = (c[h] || 0) + 1; });
          return parseInt(Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]);
        })()
      : null;

    const visitCutoff = Date.now() - 30 * 86400000;
    const visitSegments30d = (userVisitLogs[uid] || []).filter(v => (v.ts || 0) >= visitCutoff).length;

    const dem = {
      age_range: profile.age_range || user.profile?.age_range || null,
      gender: profile.gender || user.profile?.gender || null,
      occupation: profile.occupation || user.profile?.occupation || null,
      city: profile.location?.city || null,
      state: profile.location?.region || null,
      country: profile.location?.country || null,
    };

    const row = { user_id: uidOut, visit_segments_30d: visitSegments30d };
    let hasAnyData = false;

    if (catSet.has("demographics")) {
      Object.assign(row, {
        age_range: dem.age_range,
        gender: dem.gender,
        occupation: dem.occupation,
        city: dem.city,
        state: dem.state,
        country: dem.country,
        device: deviceType,
      });
      hasAnyData = true;
    }

    if (catSet.has("browsing_behavior")) {
      const topCats = Object.entries(totalCatSeconds)
        .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
      const catHours = {};
      for (const [c, sec] of Object.entries(totalCatSeconds)) {
        catHours[c] = parseFloat((sec / 3600).toFixed(2));
      }
      if (topCats.length) {
        const flatSessions = Object.values(sessions).flatMap((day) => Object.values(day || {}));
        const iabWeights = new Map();
        let iabProvider = null;
        let iabTaxonomy = null;

        const contentWeights = new Map();
        let contentTaxonomyVersion = null;

        for (const s of flatSessions) {
          const w = s.totalSeconds || 0;
          if (!w) continue;
          if (!iabProvider && s.iab_provider) iabProvider = s.iab_provider;
          if (!iabTaxonomy && s.iab_taxonomy) iabTaxonomy = s.iab_taxonomy;

          const key = s.iab_primary_id != null ? `id:${s.iab_primary_id}` : (s.iab_primary_name ? `name:${s.iab_primary_name}` : null);
          if (!key) continue;
          const prev = iabWeights.get(key) || {
            id: s.iab_primary_id ?? null,
            name: s.iab_primary_name || null,
            confidence: s.iab_primary_confidence ?? null,
            seconds: 0,
          };
          prev.seconds += w;
          if (prev.confidence == null && s.iab_primary_confidence != null) prev.confidence = s.iab_primary_confidence;
          iabWeights.set(key, prev);

          const cid = s.iab_content_primary_id ?? null;
          const cname = s.iab_content_primary_name || null;
          const cconf = s.iab_content_primary_confidence ?? null;
          const ckey = cid != null ? `id:${cid}` : (cname ? `name:${cname}` : null);
          if (ckey) {
            if (!contentTaxonomyVersion && s.iab_content?.taxonomy_version) contentTaxonomyVersion = s.iab_content.taxonomy_version;
            const prevC = contentWeights.get(ckey) || { id: cid, name: cname, confidence: cconf, seconds: 0 };
            prevC.seconds += w;
            if (prevC.confidence == null && cconf != null) prevC.confidence = cconf;
            contentWeights.set(ckey, prevC);
          }
        }

        let best = null;
        for (const v of iabWeights.values()) {
          if (!best || v.seconds > best.seconds) best = v;
        }

        let bestContent = null;
        for (const v of contentWeights.values()) {
          if (!bestContent || v.seconds > bestContent.seconds) bestContent = v;
        }

        const catCounts = new Map();
        for (const s of flatSessions) {
          const list = Array.isArray(s.iab_categories) ? s.iab_categories : [];
          for (const c of list) {
            const id = c?.id;
            const name = c?.name;
            const conf = c?.confidence;
            const k = id != null ? `id:${id}` : (name ? `name:${name}` : null);
            if (!k) continue;
            const cur = catCounts.get(k) || { id: id ?? null, name: name || null, confidence: conf ?? null, hits: 0 };
            cur.hits += 1;
            if (cur.confidence == null && conf != null) cur.confidence = conf;
            catCounts.set(k, cur);
          }
        }
        const iabTop = [...catCounts.values()].sort((a, b) => b.hits - a.hits).slice(0, 8);

        const contentAffinityCounts = new Map();
        for (const s of flatSessions) {
          const list = Array.isArray(s.iab_content?.mappings) ? s.iab_content.mappings : [];
          for (const m of list) {
            const id = m?.iab_content?.id;
            const name = m?.iab_content?.name;
            const conf = m?.match?.confidence;
            const k = id != null ? `id:${id}` : (name ? `name:${name}` : null);
            if (!k) continue;
            const cur = contentAffinityCounts.get(k) || { id: id ?? null, name: name || null, confidence: conf ?? null, hits: 0 };
            cur.hits += 1;
            if (cur.confidence == null && conf != null) cur.confidence = conf;
            contentAffinityCounts.set(k, cur);
          }
        }
        const contentTop = [...contentAffinityCounts.values()].sort((a, b) => b.hits - a.hits).slice(0, 8);

        Object.assign(row, {
          top_categories: topCats,
          total_browsing_hours: parseFloat((totalSecondsAll / 3600).toFixed(2)),
          time_spent_per_category: catHours,
          active_days: Object.keys(sessions).slice(-7),
          peak_hour: peakHour,
          ...(best
            ? {
                iab_provider: iabProvider,
                iab_taxonomy: iabTaxonomy,
                iab_primary_id: best.id,
                iab_primary_name: best.name,
                iab_primary_confidence: best.confidence,
                iab_primary_weight_seconds: Math.round(best.seconds),
              }
            : {
                iab_provider: iabProvider,
                iab_taxonomy: iabTaxonomy,
                iab_primary_id: null,
                iab_primary_name: null,
                iab_primary_confidence: null,
                iab_primary_weight_seconds: null,
              }),
          iab_top_categories: iabTop.length ? iabTop : null,
          iab_content_taxonomy_version: contentTaxonomyVersion,
          ...(bestContent
            ? {
                iab_content_primary_id: bestContent.id,
                iab_content_primary_name: bestContent.name,
                iab_content_primary_confidence: bestContent.confidence,
                iab_content_primary_weight_seconds: Math.round(bestContent.seconds),
              }
            : {
                iab_content_primary_id: null,
                iab_content_primary_name: null,
                iab_content_primary_confidence: null,
                iab_content_primary_weight_seconds: null,
              }),
          iab_content_affinity_top: contentTop.length ? contentTop : null,
        });
        hasAnyData = true;
      }
    }

    if (catSet.has("purchase_intent")) {
      const maxIntent = intentScores.length ? Math.max(...intentScores) : null;
      const intentByVertical = {};
      for (const [cat, sec] of Object.entries(totalCatSeconds)) {
        if (sec > 300) {
          intentByVertical[cat] = sec > 1800 ? "high" : sec > 900 ? "medium" : "low";
        }
      }
      if (maxIntent !== null || Object.keys(intentByVertical).length) {
        const qList = [...new Set(allSearchQueries)].slice(0, 10);
        const qInsights = inferQueryInsights(qList, "intent");
        Object.assign(row, {
          max_intent_score: maxIntent,
          intent_by_vertical: intentByVertical,
          price_ranges_viewed: normalizePricesFound(allPricesFound).slice(0, 8),
          intent_search_queries: qList,
          ...qInsights,
        });
        hasAnyData = true;
      }
    }

    if (catSet.has("brand_affinity")) {
      if (topBrands.length) {
        const premiumFound = topBrands.filter(b => PREMIUM_BRANDS_LOWER.has((b || "").toLowerCase()));
        Object.assign(row, {
          top_brands_researched: topBrands,
          premium_brands: premiumFound,
          premium_brand_flag: premiumFound.length > 0,
          brand_cross_site_visits: Object.fromEntries(
            Object.entries(allBrands).sort((a, b) => b[1] - a[1]).slice(0, 8)
          ),
        });
        hasAnyData = true;
      }
    }

    if (catSet.has("content_signals")) {
      if (allPageTypes.length || allSearchQueries.length || allBreadcrumbs.length) {
        const qList = [...new Set(allSearchQueries)].slice(0, 15);
        const qInsights = inferQueryInsights(qList, "content");
        Object.assign(row, {
          page_types: [...new Set(allPageTypes)],
          search_queries: qList,
          ...qInsights,
          max_scroll_depth: maxScrollDepth,
          breadcrumbs: [...new Set(allBreadcrumbs)].slice(0, 10),
          keywords: [...new Set(allKeywords)].slice(0, 20),
        });
        hasAnyData = true;
      }
    }

    if (catSet.has("temporal_patterns")) {
      if (visitHours.length) {
        const hourDist = {};
        visitHours.forEach(h => { hourDist[h] = (hourDist[h] || 0) + 1; });
        Object.assign(row, {
          peak_hour: peakHour,
          is_night_owl: lateNightHrs.length > 0,
          late_night_hours: [...new Set(lateNightHrs)].map(h => `${h}:00`),
          hour_distribution: hourDist,
          active_days: Object.keys(sessions).slice(-7),
        });
        hasAnyData = true;
      }
    }

    if (catSet.has("ecommerce_signals")) {
      const shoppingDomains = allDomains.shopping || [];
      if (shoppingDomains.length || checkoutVisits || productVisits) {
        Object.assign(row, {
          shopping_domains: [...new Set(shoppingDomains)].slice(0, 8),
          prices_found: normalizePricesFound(allPricesFound).slice(0, 10),
          checkout_visits: checkoutVisits,
          product_page_visits: productVisits,
          shopping_brands: topBrands.slice(0, 5),
        });
        hasAnyData = true;
      }
    }

    if (catSet.has("finance_signals")) {
      const finSec = totalCatSeconds.finance || 0;
      if (finSec > 0) {
        const finDomains = allDomains.finance || [];
        const finQueries = allSearchQueries.filter(q =>
          /loan|mutual|sip|insurance|emi|invest|fund|bank|credit|demat|nifty|sensex/i.test(q)
        );
        const qList = finQueries.slice(0, 10);
        const qInsights = inferQueryInsights(qList, "finance");
        const finIntents = Object.values(sessions).flatMap(d =>
          Object.values(d).filter(s => s.category === "finance").map(s => s.intent_score || 3)
        );
        Object.assign(row, {
          finance_browsing_hours: parseFloat((finSec / 3600).toFixed(2)),
          finance_intent_level: finSec > 1800 ? "high" : finSec > 900 ? "medium" : "low",
          finance_decision_maker: finSec > 900,
          finance_domains_visited: [...new Set(finDomains)].slice(0, 6),
          finance_search_queries: qList,
          ...qInsights,
          max_finance_intent_score: finIntents.length ? Math.max(...finIntents) : null,
        });
        hasAnyData = true;
      }
    }

    if (catSet.has("tech_affinity")) {
      const techSec = totalCatSeconds.technology || 0;
      const techDomains = allDomains.technology || [];
      if (techSec > 0 || techDomains.length) {
        const aiTools = [...new Set(techDomains.filter(d =>
          ["claude.ai", "openai.com", "midjourney.com", "perplexity.ai", "gemini.google.com"].includes(d)
        ))];
        const devTools = [...new Set(techDomains.filter(d =>
          ["github.com", "stackoverflow.com", "vercel.com", "netlify.com", "leetcode.com"].includes(d)
        ))];
        const techNameSet = new Set(["apple", "google", "microsoft", "samsung", "sony", "intel", "nvidia"]);
        Object.assign(row, {
          tech_browsing_hours: parseFloat((techSec / 3600).toFixed(2)),
          tech_early_adopter: techSec > 1800,
          tech_domains_visited: [...new Set(techDomains)].slice(0, 8),
          ai_tools_used: aiTools,
          dev_platforms_visited: devTools,
          tech_brands_researched: topBrands.filter(b => techNameSet.has((b || "").toLowerCase())),
          device: deviceType,
        });
        hasAnyData = true;
      }
    }

    if (catSet.has("audience_segments")) {
      const segFields = audienceSegmentExportFields(
        sessions,
        totalCatSeconds,
        totalSecondsAll,
        visitHours,
        taxonomy.byId
      );
      Object.assign(row, segFields || {
        audience_segments: null,
        audience_segments_iab: null,
        audience_segments_rollup: null,
      });
      if (segFields) hasAnyData = true;
    }

    if (hasAnyData) rows.push(row);
  }

  return rows;
}

function csvEncodeCell(v) {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) {
    const primitive = v.every(x => x === null || x === undefined || ["string", "number", "boolean"].includes(typeof x));
    const inner = primitive
      ? v.map(x => String(x)).join("; ")
      : JSON.stringify(v);
    return csvEncodeScalar(inner);
  }
  if (typeof v === "object") return csvEncodeScalar(JSON.stringify(v));
  return csvEncodeScalar(v);
}

function csvEncodeScalar(v) {
  let s = (v ?? "").toString();
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) return `"${s.replaceAll("\"", "\"\"")}"`;
  return s;
}

function sendCsvDownload(res, filenameBase, rows) {
  if (!rows.length) return res.status(404).json({ error: "no data available for this package yet" });
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(row => headers.map(h => csvEncodeCell(row[h])).join(","))
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.csv"`);
  return res.send(csv);
}

function sendJsonDownload(res, filenameBase, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.json"`);
  return res.send(JSON.stringify(payload, null, 2));
}

// ─── /api/purchase ────────────────────────────────────────────────────────────
app.post("/api/purchase", async (req, res) => {
  const { packageId, format = "json" } = req.body;
  if (!packageId) return res.status(400).json({ error: "packageId required" });
  const rows = await buildPackageRows(packageId);
  if (format === "csv") {
    return sendCsvDownload(res, `${packageId}_${Date.now()}`, rows);
  }
  return res.json({ packageId, rowCount: rows.length, data: rows });
});

// ─── COMPANY PACKAGES + PURCHASES ─────────────────────────────────────────────

app.get("/api/company/packages", companyCors(), requireCompanyAuth, (req, res) => {
  return res.json(getPackagesPayload());
});

app.get("/api/company/purchases", companyCors(), requireCompanyAuth, (req, res) => {
  const { company } = req.companyAuth;
  const list = companyPurchases[company.id] || [];
  return res.json({ purchases: list.slice().sort((a, b) => b.createdAt - a.createdAt) });
});

app.post("/api/company/purchase", companyCors(), requireCompanyAuth, async (req, res) => {
  const { company } = req.companyAuth;
  const { packageId, format = "csv" } = req.body || {};
  if (!packageId) return res.status(400).json({ error: "packageId required" });
  if (!["csv", "json"].includes(format)) return res.status(400).json({ error: "format must be csv or json" });

  const rows = await buildPackageRows(packageId, { companyScope: company.id });
  if (!rows.length) return res.status(404).json({ error: "no data available for this package yet" });
  const purchaseId = crypto.randomBytes(12).toString("hex");
  const rec = {
    id: purchaseId, packageId, format, createdAt: Date.now(), rowCount: rows.length, isCustom: false,
  };
  if (!companyPurchases[company.id]) companyPurchases[company.id] = [];
  companyPurchases[company.id].push(rec);

  const downloadUrl = `/api/company/download/${purchaseId}?format=${encodeURIComponent(format)}`;
  return res.json({ purchaseId, rowCount: rows.length, downloadUrl });
});

app.post("/api/company/purchase/custom", companyCors(), requireCompanyAuth, async (req, res) => {
  const { company } = req.companyAuth;
  const { categoryIds, signals, format = "csv" } = req.body || {};

  const parsed = parseCustomCategoryIds(categoryIds);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  if (!["csv", "json"].includes(format)) {
    return res.status(400).json({ error: "format must be csv or json" });
  }

  const ids = parsed.ids;
  const priceUsd = computeCustomPackagePriceUsd(ids);

  const rows = await buildCustomPackageRows(ids, { companyScope: company.id });
  if (!rows.length) {
    return res.status(404).json({ error: "no matching user data for the selected categories yet" });
  }

  const purchaseId = crypto.randomBytes(12).toString("hex");
  const customLabel = ids.join(", ");
  const rec = {
    id: purchaseId,
    packageId: null,
    customLabel,
    categoryIds: ids,
    signals: Array.isArray(signals) ? signals : [],
    price: priceUsd,
    format,
    createdAt: Date.now(),
    rowCount: rows.length,
    isCustom: true,
  };

  if (!companyPurchases[company.id]) companyPurchases[company.id] = [];
  companyPurchases[company.id].push(rec);

  const downloadUrl = `/api/company/download/${purchaseId}?format=${encodeURIComponent(format)}`;
  return res.json({ purchaseId, rowCount: rows.length, downloadUrl, priceUsd });
});

app.get("/api/company/custom-pricing", companyCors(), requireCompanyAuth, (_req, res) => {
  return res.json({
    baseUsd: CUSTOM_PACKAGE_BASE_USD,
    baseColumns: ["user_id", "visit_segments_30d"],
    categories: Object.entries(CUSTOM_CATEGORY_PRICE_USD).map(([id, priceUsd]) => ({
      id,
      priceUsd,
      exportColumns: CUSTOM_CATEGORY_EXPORT_COLUMNS[id] || [],
    })),
  });
});

app.get("/api/company/download/:purchaseId", companyCors(), requireCompanyAuth, async (req, res) => {
  const { company } = req.companyAuth;
  const { purchaseId } = req.params;
  const format = (req.query.format || "csv").toString();
  if (!["csv", "json"].includes(format)) return res.status(400).json({ error: "format must be csv or json" });

  const purchases = companyPurchases[company.id] || [];
  const purchase = purchases.find(p => p.id === purchaseId);
  if (!purchase) return res.status(404).json({ error: "purchase not found" });

  const date = new Date(purchase.createdAt).toISOString().split("T")[0];
  const filenameBase = purchase.isCustom
    ? `reclaim_custom_${(purchase.categoryIds || []).join("_")}_${date}_${purchase.id}`
    : `${purchase.packageId}_${date}_${purchase.id}`;

  const rows = purchase.isCustom
    ? await buildCustomPackageRows(purchase.categoryIds || [], { companyScope: company.id })
    : await buildPackageRows(purchase.packageId, { companyScope: company.id });

  if (format === "csv") {
    return sendCsvDownload(res, filenameBase, rows);
  }
  return sendJsonDownload(res, filenameBase, {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    label: purchase.customLabel || purchase.packageId,
    rowCount: rows.length,
    data: rows,
    ...(purchase.isCustom ? { categoryIds: purchase.categoryIds, signals: purchase.signals } : { packageId: purchase.packageId }),
  });
});

// ─── /api/insight ─────────────────────────────────────────────────────────────
app.post("/api/insight", async (req, res) => {
  const { summary } = req.body;
  if (!summary) return res.status(400).json({ error: "summary is required" });

  const topCat = summary.split(",")[0].trim().split(":")[0].trim().toLowerCase();

  try {
    const prompt = `You are an AI for Reclaim, an app that pays users for their browsing data.\nUser browsing today: ${summary}\nWrite ONE short useful insight (max 2 sentences). Be specific, conversational, no emojis.`;
    const result = await model.generateContent(prompt);
    return res.json({ insight: result.response.text().trim(), source: "gemini" });
  } catch (err) {
    console.error("Gemini insight error:", err.message);
    const fallback = FALLBACK_INSIGHTS[topCat] || FALLBACK_INSIGHTS.other;
    return res.json({ insight: fallback, source: "fallback" });
  }
});

// ─── /api/health ──────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({
  status: "ok",
  categoryCacheSize: Object.keys(categoryCache).length,
  extractCacheSize: Object.keys(extractCache).length,
  users: Object.keys(users).length,
  profiles: Object.keys(userProfiles).length,
  visitLogUsers: Object.keys(userVisitLogs).length,
  visitLogSegments: Object.values(userVisitLogs).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0),
}));

app.listen(PORT, () => {
  console.log(`Reclaim backend running on http://localhost:${PORT}`);
  console.log(`Gemini API key: ${process.env.GEMINI_API_KEY ? "✓ loaded" : "✗ missing"}`);
});
