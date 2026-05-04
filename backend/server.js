import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";

// Always load env from backend/.env (works even if process cwd is repo root)
dotenv.config({ path: new URL("./.env", import.meta.url) });

const app = express();
const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

const VALID_CATEGORIES = [
  "shopping", "social", "news", "finance", "entertainment",
  "education", "health", "travel", "technology", "food",
  "realestate", "jobs", "other"
];

const KNOWN_DOMAINS = {
  "amazon.in": "shopping", "amazon.com": "shopping", "flipkart.com": "shopping",
  "myntra.com": "shopping", "meesho.com": "shopping", "ajio.com": "shopping",
  "nykaa.com": "shopping", "snapdeal.com": "shopping", "ebay.com": "shopping",
  "etsy.com": "shopping", "walmart.com": "shopping",
  "instagram.com": "social", "facebook.com": "social", "twitter.com": "social",
  "x.com": "social", "linkedin.com": "social", "reddit.com": "social",
  "pinterest.com": "social", "snapchat.com": "social", "threads.net": "social",
  "discord.com": "social", "telegram.org": "social",
  "youtube.com": "entertainment", "netflix.com": "entertainment", "spotify.com": "entertainment",
  "hotstar.com": "entertainment", "primevideo.com": "entertainment", "twitch.tv": "entertainment",
  "zee5.com": "entertainment", "sonyliv.com": "entertainment",
  "timesofindia.com": "news", "hindustantimes.com": "news", "ndtv.com": "news",
  "thehindu.com": "news", "bbc.com": "news", "cnn.com": "news",
  "reuters.com": "news", "bloomberg.com": "news", "techcrunch.com": "news", "theverge.com": "news",
  "zerodha.com": "finance", "groww.in": "finance", "upstox.com": "finance",
  "moneycontrol.com": "finance", "paytm.com": "finance", "phonepe.com": "finance",
  "economictimes.indiatimes.com": "finance", "investing.com": "finance",
  "wikipedia.org": "education", "coursera.org": "education", "udemy.com": "education",
  "khanacademy.org": "education", "stackoverflow.com": "education", "leetcode.com": "education",
  "nptel.ac.in": "education", "unacademy.com": "education",
  "google.com": "technology", "microsoft.com": "technology", "apple.com": "technology",
  "claude.ai": "technology", "openai.com": "technology", "notion.so": "technology",
  "figma.com": "technology", "canva.com": "technology", "github.com": "technology",
  "vercel.com": "technology", "netlify.com": "technology",
  "practo.com": "health", "1mg.com": "health", "webmd.com": "health",
  "healthline.com": "health", "pharmeasy.in": "health",
  "makemytrip.com": "travel", "goibibo.com": "travel", "airbnb.com": "travel",
  "booking.com": "travel", "irctc.co.in": "travel", "uber.com": "travel",
  "cleartrip.com": "travel", "skyscanner.com": "travel",
  "swiggy.com": "food", "zomato.com": "food", "dunzo.com": "food",
  "blinkit.com": "food", "zepto.com": "food",
  "magicbricks.com": "realestate", "99acres.com": "realestate",
  "housing.com": "realestate", "nobroker.in": "realestate",
  "naukri.com": "jobs", "internshala.com": "jobs", "wellfound.com": "jobs",
  "indeed.com": "jobs", "shine.com": "jobs"
};

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
  if (KNOWN_DOMAINS[domain]) return { category: KNOWN_DOMAINS[domain], source: "known" };
  if (categoryCache[domain] && Date.now() - categoryCache[domain].cachedAt < CACHE_TTL) {
    return { category: categoryCache[domain].category, source: "cache" };
  }
  try {
    const prompt = `Categorize this website into exactly ONE of: ${VALID_CATEGORIES.join(", ")}\nDomain: ${domain}\nTitle: ${title || "unknown"}\nReply with ONLY the single category word.`;
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().toLowerCase();
    const category = VALID_CATEGORIES.includes(raw) ? raw : "other";
    categoryCache[domain] = { category, cachedAt: Date.now() };
    return { category, source: "gemini" };
  } catch (err) {
    console.error("Gemini categorize error:", err.message);
    return { category: "other", source: "fallback" };
  }
}

app.post("/api/categorize", async (req, res) => {
  const { domain, title } = req.body;
  if (!domain) return res.status(400).json({ error: "domain is required" });
  const result = await getCategory(domain, title);
  return res.json(result);
});

// ─── /api/extract ─────────────────────────────────────────────────────────────
app.post("/api/extract", async (req, res) => {
  const { domain, title } = req.body;
  if (!domain) return res.status(400).json({ error: "domain required" });

  const key = cacheKey(domain, title);
  if (extractCache[key]) return res.json({ ...extractCache[key], cached: true });

  const knownCategory = KNOWN_DOMAINS[domain];

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

    if (knownCategory) extracted.category = knownCategory;
    extracted.earnings_rate = EARNINGS_RATE[extracted.category] || EARNINGS_RATE.other;

    extractCache[key] = extracted;
    return res.json({ ...extracted, cached: false });
  } catch (err) {
    console.error("Extract error:", err.message);
    const fallback = {
      category: knownCategory || "other",
      brand: null, product: null, product_type: null,
      price_range: null, intent_score: 3, keywords: [],
      location: null, job_title: null, travel_route: null,
      property_type: null, search_type: null,
      earnings_rate: EARNINGS_RATE[knownCategory || "other"],
      cached: false
    };
    extractCache[key] = fallback;
    return res.json(fallback);
  }
});

// ─── /api/sync ────────────────────────────────────────────────────────────────
app.post("/api/sync", (req, res) => {
  const { userId, sessions, totalEarnings, profile } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });

  userSessions[userId] = sessions || {};
  userProfiles[userId] = {
    ...userProfiles[userId],
    totalEarnings: totalEarnings || 0,
    lastSync: Date.now(),
    ...(profile || {})
  };

  return res.json({ status: "synced", userId });
});

// ─── /api/profile/:userId ─────────────────────────────────────────────────────
app.get("/api/profile/:userId", (req, res) => {
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

  const segments = [];
  if ((categories.shopping?.seconds || 0) > 1800) segments.push("high_intent_shopper");
  if ((categories.finance?.seconds || 0) > 900) segments.push("finance_decision_maker");
  if ((categories.technology?.seconds || 0) > 1800) segments.push("tech_early_adopter");
  if ((categories.realestate?.seconds || 0) > 600) segments.push("property_seeker");
  if ((categories.jobs?.seconds || 0) > 600) segments.push("job_seeker");
  if ((categories.travel?.seconds || 0) > 600) segments.push("travel_planner");
  if (isNightOwl && (categories.shopping?.seconds || 0) > 600) segments.push("night_owl_shopper");

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

      for (const day of Object.values(sessions)) {
        for (const s of Object.values(day)) {
          const cat = s.category || "other";
          totalCatSeconds[cat] = (totalCatSeconds[cat] || 0) + (s.totalSeconds || 0);
          if (s.visitHours?.some(h => h >= 22 || h <= 2)) hasLateNight = true;
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
          return hasLateNight && (totalCatSeconds.shopping || 0) > 0;
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
      description: "Consent-based behavioral data from users showing strong cross-site purchase intent. Powered by intent scores, search queries, prices viewed, breadcrumb category paths, and scroll depth on product pages.",
      strongNow: true,
      strongerAfterOnboarding: false,
      signals: [
        "Intent score 7+ on product/checkout pages",
        "Cross-site product comparison (3+ domains)",
        "Search queries containing product names and prices",
        "Prices viewed with currency and availability",
        "Breadcrumb paths: Electronics > Mobiles > Apple",
        "Scroll depth 60%+ on product pages"
      ],
      dataFields: [
        "user_id", "intent_score", "top_brands", "search_queries",
        "prices_viewed", "breadcrumbs", "page_types", "scroll_depth",
        "visit_frequency", "age_range", "gender", "city", "device"
      ],
      sampleData: [
        {
          user_id: "usr_a7f2k9", intent_score: 9, top_brands: ["Apple", "Samsung"],
          search_queries: ["iphone 15 pro price india", "iphone 15 pro vs 14 pro"],
          prices_viewed: ["₹134900", "₹124900"], breadcrumbs: ["Electronics", "Mobiles", "Apple"],
          page_types: ["product", "search", "comparison"], scroll_depth: 84,
          visit_frequency: 12, age_range: "18-24", gender: "M", city: "Roorkee", device: "desktop"
        },
        {
          user_id: "usr_b3m8p1", intent_score: 8, top_brands: ["Samsung", "OnePlus"],
          search_queries: ["samsung s24 ultra review", "best android phone 2026"],
          prices_viewed: ["₹89999", "₹79999"], breadcrumbs: ["Electronics", "Mobiles", "Samsung"],
          page_types: ["product", "review"], scroll_depth: 71,
          visit_frequency: 8, age_range: "25-34", gender: "M", city: "Delhi", device: "mobile"
        },
        {
          user_id: "usr_c9x4r6", intent_score: 9, top_brands: ["Apple", "Sony", "Bose"],
          search_queries: ["airpods pro 2 vs sony wf1000xm5", "best wireless earbuds india"],
          prices_viewed: ["₹24900", "₹19990"], breadcrumbs: ["Electronics", "Audio", "Earbuds"],
          page_types: ["comparison", "product", "checkout"], scroll_depth: 91,
          visit_frequency: 15, age_range: "18-24", gender: "F", city: "Mumbai", device: "desktop"
        }
      ],
      userCount: countPackageUsers("high_intent_shoppers"),
      price: 299,
      formats: ["csv", "json"],
      useCases: ["Performance marketing", "Retargeting campaigns", "Product launch targeting", "Competitive conquest"]
    },
    {
      id: "cross_platform_behavioral",
      tier: 1,
      name: "Cross-Platform Behavioral Profile",
      tagline: "Full 360° consumer behavior — data no single platform can offer",
      description: "The most comprehensive behavioral dataset available. Reclaim's browser extension captures behavior across ALL sites — something Meta, Google, or Amazon can never do individually.",
      strongNow: true,
      strongerAfterOnboarding: false,
      signals: [
        "Cross-site category distribution",
        "Brand affinity scores across all categories",
        "Search queries across Google, Amazon, YouTube, Flipkart",
        "Time-of-day browsing patterns",
        "Device type and peak active hours",
        "Content engagement (scroll depth)",
        "Page type journey"
      ],
      dataFields: [
        "user_id", "category_distribution", "top_brands", "all_search_queries",
        "active_hours", "peak_hour", "device", "avg_scroll_depth",
        "page_type_breakdown", "total_browsing_hours", "age_range", "gender",
        "occupation", "city"
      ],
      sampleData: [
        {
          user_id: "usr_a7f2k9",
          category_distribution: { shopping: "34%", technology: "28%", entertainment: "18%", finance: "12%", other: "8%" },
          top_brands: ["Apple", "Netflix", "GitHub", "Zerodha"],
          all_search_queries: ["iphone 15 pro", "best mutual fund 2026", "react hooks tutorial"],
          active_hours: "9pm-2am", peak_hour: 23, device: "desktop",
          avg_scroll_depth: 67, total_browsing_hours: 4.2,
          age_range: "18-24", gender: "M", occupation: "Student", city: "Roorkee"
        },
        {
          user_id: "usr_d2n7q3",
          category_distribution: { finance: "41%", news: "22%", technology: "19%", shopping: "11%", other: "7%" },
          top_brands: ["Zerodha", "Bloomberg", "Microsoft", "Amazon"],
          all_search_queries: ["nifty 50 analysis", "best index fund india", "macbook pro m4"],
          active_hours: "7am-10am, 8pm-11pm", peak_hour: 8, device: "mobile",
          avg_scroll_depth: 55, total_browsing_hours: 3.1,
          age_range: "25-34", gender: "M", occupation: "Software Engineer", city: "Bangalore"
        },
        {
          user_id: "usr_e5k2r8",
          category_distribution: { shopping: "29%", social: "24%", entertainment: "21%", health: "14%", other: "12%" },
          top_brands: ["Nykaa", "Netflix", "Practo", "Myntra"],
          all_search_queries: ["vitamin c serum india", "best skincare routine", "zara sale 2026"],
          active_hours: "12pm-2pm, 9pm-12am", peak_hour: 21, device: "mobile",
          avg_scroll_depth: 73, total_browsing_hours: 5.8,
          age_range: "18-24", gender: "F", occupation: "Student", city: "Mumbai"
        }
      ],
      userCount: countPackageUsers("cross_platform_behavioral"),
      price: 399,
      formats: ["csv", "json"],
      useCases: ["Audience segmentation", "Lookalike modeling", "Brand affinity research", "Consumer journey mapping"]
    },
    {
      id: "finance_decision_makers",
      tier: 2,
      name: "Finance Decision Makers",
      tagline: "Users actively researching financial products — near conversion",
      description: "High-value audience actively browsing investment platforms, loan calculators, banking products, and insurance comparisons.",
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
        "user_id", "finance_platforms_visited", "search_queries", "intent_score",
        "finance_products_researched", "visit_frequency", "age_range", "gender",
        "occupation", "city", "device"
      ],
      sampleData: [
        {
          user_id: "usr_f1m4k9", finance_platforms_visited: ["zerodha.com", "groww.in", "moneycontrol.com"],
          search_queries: ["best mutual fund sip 2026", "nifty 50 index fund returns"],
          intent_score: 8, finance_products_researched: ["mutual_fund", "index_fund"],
          visit_frequency: 9, age_range: "25-34", gender: "M", occupation: "Software Engineer", city: "Bangalore", device: "desktop"
        },
        {
          user_id: "usr_g7p2s1", finance_platforms_visited: ["sbi.co.in", "hdfc.com", "bankbazaar.com"],
          search_queries: ["home loan eligibility calculator", "sbi home loan rate 2026"],
          intent_score: 9, finance_products_researched: ["home_loan", "mortgage"],
          visit_frequency: 14, age_range: "28-35", gender: "M", occupation: "Salaried", city: "Pune", device: "mobile"
        },
        {
          user_id: "usr_h3n8t4", finance_platforms_visited: ["policybazaar.com", "coverfox.com"],
          search_queries: ["term insurance 1 crore premium", "best health insurance family floater"],
          intent_score: 7, finance_products_researched: ["term_insurance", "health_insurance"],
          visit_frequency: 6, age_range: "30-40", gender: "F", occupation: "Business Owner", city: "Delhi", device: "desktop"
        }
      ],
      userCount: countPackageUsers("finance_decision_makers"),
      price: 499,
      formats: ["csv", "json"],
      useCases: ["Fintech user acquisition", "Loan lead generation", "Investment platform growth", "Insurance cross-sell"]
    },
    {
      id: "tech_early_adopters",
      tier: 1,
      name: "Tech Early Adopters",
      tagline: "Developers, AI users, and tech enthusiasts — first to adopt new tools",
      description: "Heavy technology browsers who use AI tools, developer platforms, and consume tech content daily.",
      strongNow: true,
      strongerAfterOnboarding: false,
      signals: [
        "Technology category 30%+ of total browsing",
        "AI tool usage (claude.ai, openai.com)",
        "Developer platform visits (GitHub, StackOverflow, Vercel)",
        "Tech news consumption",
        "Search queries for tools, frameworks, APIs"
      ],
      dataFields: [
        "user_id", "tech_tools_used", "ai_tools_used", "search_queries",
        "dev_platforms_visited", "tech_browsing_hours", "device", "age_range",
        "gender", "occupation", "city"
      ],
      sampleData: [
        {
          user_id: "usr_i9q5v2", tech_tools_used: ["github.com", "vercel.com", "figma.com"],
          ai_tools_used: ["claude.ai", "openai.com"],
          search_queries: ["react server components 2026", "next.js vs remix"],
          dev_platforms_visited: ["stackoverflow.com", "github.com"],
          tech_browsing_hours: 3.8, device: "desktop",
          age_range: "18-24", gender: "M", occupation: "Student", city: "Roorkee"
        },
        {
          user_id: "usr_j2w7b6", tech_tools_used: ["github.com", "aws.amazon.com"],
          ai_tools_used: ["openai.com", "claude.ai"],
          search_queries: ["gpt-4o api vs claude 3.5", "aws lambda pricing"],
          dev_platforms_visited: ["github.com", "stackoverflow.com"],
          tech_browsing_hours: 5.1, device: "desktop",
          age_range: "25-34", gender: "M", occupation: "Software Engineer", city: "Hyderabad"
        },
        {
          user_id: "usr_k4r1m8", tech_tools_used: ["figma.com", "notion.so"],
          ai_tools_used: ["claude.ai"],
          search_queries: ["figma vs framer 2026", "best design system 2026"],
          dev_platforms_visited: ["producthunt.com", "figma.com"],
          tech_browsing_hours: 2.9, device: "desktop",
          age_range: "25-34", gender: "F", occupation: "Product Manager", city: "Bangalore"
        }
      ],
      userCount: countPackageUsers("tech_early_adopters"),
      price: 199,
      formats: ["csv", "json"],
      useCases: ["SaaS user acquisition", "Developer tool marketing", "B2B tech sales", "AI product launch"]
    },
    {
      id: "real_estate_prospects",
      tier: 2,
      name: "Real Estate Prospects",
      tagline: "Active property searchers weeks before they contact a broker",
      description: "Users actively browsing property listings with location-specific searches.",
      strongNow: true,
      strongerAfterOnboarding: true,
      onboardingUpgrade: "City from onboarding allows geo-targeted delivery — a Mumbai user searching 3BHK is worth 10x more than anonymous",
      signals: [
        "Real estate platform visits (MagicBricks, 99acres, NoBroker)",
        "Property search queries with BHK, location, budget",
        "Property type extraction from titles",
        "Intent scores on listing pages"
      ],
      dataFields: [
        "user_id", "property_platforms_visited", "search_queries", "property_types",
        "locations_searched", "intent_score", "visit_frequency", "age_range",
        "gender", "occupation", "city", "device"
      ],
      sampleData: [
        {
          user_id: "usr_l6s3n1", property_platforms_visited: ["magicbricks.com", "99acres.com"],
          search_queries: ["3bhk flat roorkee", "flat for sale under 50 lakhs roorkee"],
          property_types: ["3BHK", "2BHK"], locations_searched: ["Roorkee", "Haridwar Road"],
          intent_score: 8, visit_frequency: 11,
          age_range: "25-34", gender: "M", occupation: "Engineer", city: "Roorkee", device: "mobile"
        },
        {
          user_id: "usr_m8t5p3", property_platforms_visited: ["housing.com", "magicbricks.com"],
          search_queries: ["2bhk rent mumbai andheri west", "flat on rent bandra"],
          property_types: ["2BHK", "PG"], locations_searched: ["Andheri West", "Bandra"],
          intent_score: 7, visit_frequency: 8,
          age_range: "22-28", gender: "F", occupation: "Working Professional", city: "Mumbai", device: "mobile"
        },
        {
          user_id: "usr_n2v4k7", property_platforms_visited: ["99acres.com", "nobroker.in"],
          search_queries: ["villa for sale bangalore whitefield", "plot in sarjapur road"],
          property_types: ["Villa", "Plot"], locations_searched: ["Whitefield", "Sarjapur Road"],
          intent_score: 9, visit_frequency: 17,
          age_range: "35-45", gender: "M", occupation: "Business Owner", city: "Bangalore", device: "desktop"
        }
      ],
      userCount: countPackageUsers("real_estate_prospects"),
      price: 449,
      formats: ["csv", "json"],
      useCases: ["Real estate developer targeting", "Home loan lead gen", "Broker acquisition"]
    },
    {
      id: "night_owl_impulse_buyers",
      tier: 1,
      name: "Night Owl Impulse Buyers",
      tagline: "Late-night mobile shoppers — highest impulse purchase rate",
      description: "Users who browse shopping and entertainment sites between 10pm–2am on mobile devices.",
      strongNow: true,
      strongerAfterOnboarding: false,
      signals: [
        "Shopping/entertainment browsing between 10pm–2am",
        "Mobile device dominant",
        "Product pages visited after midnight",
        "Impulse categories: fashion, electronics, food delivery, OTT"
      ],
      dataFields: [
        "user_id", "peak_shopping_hours", "device", "late_night_categories",
        "late_night_brands", "late_night_search_queries", "avg_session_duration_night",
        "age_range", "gender", "city"
      ],
      sampleData: [
        {
          user_id: "usr_o3x6q9", peak_shopping_hours: ["23:00", "00:30", "01:15"],
          device: "mobile", late_night_categories: ["shopping", "entertainment", "food"],
          late_night_brands: ["Myntra", "Swiggy", "Netflix"],
          late_night_search_queries: ["myntra sale tonight", "swiggy promo code"],
          avg_session_duration_night: 34,
          age_range: "18-24", gender: "F", city: "Delhi"
        },
        {
          user_id: "usr_p7y1s5", peak_shopping_hours: ["22:30", "23:45", "00:15"],
          device: "mobile", late_night_categories: ["shopping", "technology"],
          late_night_brands: ["Amazon", "Flipkart", "YouTube"],
          late_night_search_queries: ["amazon flash sale tonight", "budget gaming laptop"],
          avg_session_duration_night: 28,
          age_range: "18-24", gender: "M", city: "Pune"
        },
        {
          user_id: "usr_q5w8r2", peak_shopping_hours: ["23:00", "00:45"],
          device: "mobile", late_night_categories: ["food", "shopping", "social"],
          late_night_brands: ["Zomato", "Meesho", "Instagram"],
          late_night_search_queries: ["zomato midnight delivery", "meesho sale dresses"],
          avg_session_duration_night: 41,
          age_range: "22-30", gender: "F", city: "Hyderabad"
        }
      ],
      userCount: countPackageUsers("night_owl_impulse_buyers"),
      price: 179,
      formats: ["csv", "json"],
      useCases: ["D2C flash sale targeting", "Food delivery promotions", "Late-night OTT acquisition"]
    }
  ];
}

app.get("/api/packages", (req, res) => {
  return res.json(getPackagesPayload());
});

// ─── PACKAGE ROW BUILDER (shared) ─────────────────────────────────────────────

function buildPackageRows(packageId) {
  const allUserIds = Object.keys(userSessions);
  const rows = [];

  for (const uid of allUserIds) {
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
    const totalHours = (Object.values(totalCatSeconds).reduce((a, b) => a + b, 0) / 3600).toFixed(1);
    const lateNightHours = visitHours.filter(h => h >= 22 || h <= 2);

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
        const prices = shoppingSessions.flatMap(s => s.pricesFound?.map(p => p.price) || []).slice(0, 5);
        const breadcrumbs = shoppingSessions.find(s => s.breadcrumbs?.length)?.breadcrumbs || [];
        rows.push({
          user_id: uid, intent_score: maxIntent, top_brands: topBrands,
          search_queries: [...new Set(allSearchQueries)].slice(0, 10),
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
        for (const [c, s] of Object.entries(totalCatSeconds)) {
          catDist[c] = Math.round((s / total) * 100) + "%";
        }
        const hourCounts = {};
        visitHours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1; });
        const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        rows.push({
          user_id: uid, category_distribution: catDist,
          top_brands: topBrands,
          all_search_queries: [...new Set(allSearchQueries)].slice(0, 20),
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
        rows.push({
          user_id: uid,
          finance_platforms_visited: [...new Set(finDomains)].slice(0, 5),
          search_queries: finQueries.slice(0, 10),
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
        rows.push({
          user_id: uid,
          tech_tools_used: [...new Set(techDomains)].slice(0, 8),
          ai_tools_used: [...new Set(aiTools)],
          search_queries: allSearchQueries.slice(0, 10),
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
        rows.push({
          user_id: uid,
          property_platforms_visited: [...new Set(reDomains)].slice(0, 5),
          search_queries: reQueries.slice(0, 10),
          property_types: [...new Set(reSessions.map(s => s.property_type).filter(Boolean))],
          locations_searched: [...new Set(reSessions.map(s => s.location).filter(Boolean))],
          intent_score: Math.max(...reSessions.map(s => s.intent_score || 3)),
          visit_frequency: reSessions.reduce((a, s) => a + s.visits, 0),
          ...dem, device: deviceType
        });
        break;
      }
      case "night_owl_impulse_buyers": {
        if (!lateNightHours.length || !(totalCatSeconds.shopping > 0)) continue;
        const nightSessions = Object.values(sessions).flatMap(d =>
          Object.values(d).filter(s =>
            s.visitHours?.some(h => h >= 22 || h <= 2) &&
            ["shopping", "entertainment", "food", "social"].includes(s.category)
          )
        );
        if (!nightSessions.length) continue;
        rows.push({
          user_id: uid,
          peak_shopping_hours: lateNightHours.map(h => `${h}:00`),
          device: deviceType,
          late_night_categories: [...new Set(nightSessions.map(s => s.category))],
          late_night_brands: [...new Set(nightSessions.map(s => s.brand).filter(Boolean))].slice(0, 5),
          late_night_search_queries: allSearchQueries.slice(0, 8),
          avg_session_duration_night: Math.round(
            nightSessions.reduce((a, s) => a + (s.totalSeconds || 0), 0) / (nightSessions.length || 1)
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

function sendCsvDownload(res, filenameBase, rows) {
  if (!rows.length) return res.status(404).json({ error: "no data available for this package yet" });
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(row => headers.map(h => {
      const v = row[h];
      if (Array.isArray(v)) return `"${v.join("; ").replaceAll("\"", "\"\"")}"`;
      if (typeof v === "object" && v !== null) return `"${JSON.stringify(v).replaceAll("\"", "\"\"")}"`;
      const s = (v ?? "").toString();
      // Basic CSV escaping
      if (/[",\n]/.test(s)) return `"${s.replaceAll("\"", "\"\"")}"`;
      return s;
    }).join(","))
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
app.post("/api/purchase", (req, res) => {
  const { packageId, format = "json" } = req.body;
  if (!packageId) return res.status(400).json({ error: "packageId required" });
  const rows = buildPackageRows(packageId);
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

app.post("/api/company/purchase", companyCors(), requireCompanyAuth, (req, res) => {
  const { company } = req.companyAuth;
  const { packageId, format = "csv" } = req.body || {};
  if (!packageId) return res.status(400).json({ error: "packageId required" });
  if (!["csv", "json"].includes(format)) return res.status(400).json({ error: "format must be csv or json" });

  const rows = buildPackageRows(packageId);
  if (!rows.length) return res.status(404).json({ error: "no data available for this package yet" });
  const purchaseId = crypto.randomBytes(12).toString("hex");
  const rec = { id: purchaseId, packageId, format, createdAt: Date.now(), rowCount: rows.length };
  if (!companyPurchases[company.id]) companyPurchases[company.id] = [];
  companyPurchases[company.id].push(rec);

  const downloadUrl = `/api/company/download/${purchaseId}?format=${encodeURIComponent(format)}`;
  return res.json({ purchaseId, rowCount: rows.length, downloadUrl });
});

app.get("/api/company/download/:purchaseId", companyCors(), requireCompanyAuth, (req, res) => {
  const { company } = req.companyAuth;
  const { purchaseId } = req.params;
  const format = (req.query.format || "csv").toString();
  if (!["csv", "json"].includes(format)) return res.status(400).json({ error: "format must be csv or json" });

  const purchases = companyPurchases[company.id] || [];
  const purchase = purchases.find(p => p.id === purchaseId);
  if (!purchase) return res.status(404).json({ error: "purchase not found" });

  const rows = buildPackageRows(purchase.packageId);
  const date = new Date(purchase.createdAt).toISOString().split("T")[0];
  const filenameBase = `${purchase.packageId}_${date}_${purchase.id}`;

  if (format === "csv") {
    return sendCsvDownload(res, filenameBase, rows);
  }
  return sendJsonDownload(res, filenameBase, { packageId: purchase.packageId, rowCount: rows.length, data: rows });
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
  profiles: Object.keys(userProfiles).length
}));

app.listen(PORT, () => {
  console.log(`Reclaim backend running on http://localhost:${PORT}`);
  console.log(`Gemini API key: ${process.env.GEMINI_API_KEY ? "✓ loaded" : "✗ missing"}`);
});
