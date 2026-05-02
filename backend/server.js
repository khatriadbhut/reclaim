import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

// In-memory storage
const categoryCache = {};
const extractCache = {};
const userProfiles = {};
const userSessions = {};
const CACHE_TTL = 1000 * 60 * 60 * 24;

const VALID_CATEGORIES = [
  "shopping", "social", "news", "finance", "entertainment",
  "education", "health", "travel", "technology", "food",
  "realestate", "jobs", "other"
];

const KNOWN_DOMAINS = {
  // Shopping
  "amazon.in": "shopping", "amazon.com": "shopping", "flipkart.com": "shopping",
  "myntra.com": "shopping", "meesho.com": "shopping", "ajio.com": "shopping",
  "nykaa.com": "shopping", "snapdeal.com": "shopping", "ebay.com": "shopping",
  "etsy.com": "shopping", "walmart.com": "shopping",
  // Social
  "instagram.com": "social", "facebook.com": "social", "twitter.com": "social",
  "x.com": "social", "linkedin.com": "social", "reddit.com": "social",
  "pinterest.com": "social", "snapchat.com": "social", "threads.net": "social",
  "discord.com": "social", "telegram.org": "social",
  // Entertainment
  "youtube.com": "entertainment", "netflix.com": "entertainment", "spotify.com": "entertainment",
  "hotstar.com": "entertainment", "primevideo.com": "entertainment", "twitch.tv": "entertainment",
  "zee5.com": "entertainment", "sonyliv.com": "entertainment",
  // News
  "timesofindia.com": "news", "hindustantimes.com": "news", "ndtv.com": "news",
  "thehindu.com": "news", "bbc.com": "news", "cnn.com": "news",
  "reuters.com": "news", "bloomberg.com": "news", "techcrunch.com": "news", "theverge.com": "news",
  // Finance
  "zerodha.com": "finance", "groww.in": "finance", "upstox.com": "finance",
  "moneycontrol.com": "finance", "paytm.com": "finance", "phonepe.com": "finance",
  "economictimes.indiatimes.com": "finance", "investing.com": "finance",
  // Education
  "wikipedia.org": "education", "coursera.org": "education", "udemy.com": "education",
  "khanacademy.org": "education", "stackoverflow.com": "education", "leetcode.com": "education",
  "nptel.ac.in": "education", "unacademy.com": "education",
  // Technology
  "google.com": "technology", "microsoft.com": "technology", "apple.com": "technology",
  "claude.ai": "technology", "openai.com": "technology", "notion.so": "technology",
  "figma.com": "technology", "canva.com": "technology", "github.com": "technology",
  "vercel.com": "technology", "netlify.com": "technology",
  // Health
  "practo.com": "health", "1mg.com": "health", "webmd.com": "health",
  "healthline.com": "health", "pharmeasy.in": "health",
  // Travel
  "makemytrip.com": "travel", "goibibo.com": "travel", "airbnb.com": "travel",
  "booking.com": "travel", "irctc.co.in": "travel", "uber.com": "travel",
  "cleartrip.com": "travel", "skyscanner.com": "travel",
  // Food
  "swiggy.com": "food", "zomato.com": "food", "dunzo.com": "food",
  "blinkit.com": "food", "zepto.com": "food",
  // Real Estate
  "magicbricks.com": "realestate", "99acres.com": "realestate",
  "housing.com": "realestate", "nobroker.in": "realestate",
  // Jobs
  "naukri.com": "jobs", "internshala.com": "jobs", "wellfound.com": "jobs",
  "indeed.com": "jobs", "shine.com": "jobs"
};

const EARNINGS_RATE = {
  shopping: 0.05, finance: 0.06, health: 0.05, travel: 0.04,
  social: 0.02, news: 0.02, entertainment: 0.02, technology: 0.02,
  education: 0.01, food: 0.02, realestate: 0.08, jobs: 0.03, other: 0.005
};

const FALLBACK_INSIGHTS = {
  shopping: "Your shopping behavior is valuable — brands pay a premium to understand cross-site purchase intent. Today's data has been packaged for retail advertisers.",
  social: "Social browsing patterns reveal content preferences advertisers can't get anywhere else. Your cross-platform behavior is worth more than any single app knows.",
  entertainment: "Entertainment habits predict subscription churn and content demand. Streaming platforms pay for exactly this behavioral data.",
  finance: "Finance browsing signals high purchase intent. This is some of the most valuable data in the market — fintechs and banks pay top dollar for it.",
  news: "News consumption patterns reveal political and commercial interests that media companies actively purchase for audience targeting.",
  education: "EdTech companies pay for learning behavior data to improve course recommendations. Your study patterns have real market value.",
  technology: "Tech browsing signals developer and early adopter behavior — one of the most sought-after audience segments for B2B companies.",
  health: "Health browsing data is among the most sensitive and valuable. Pharma and wellness brands pay a premium for consented health interest signals.",
  travel: "Travel intent data is extremely valuable — airlines and hotels pay for signals weeks before a booking decision is made.",
  food: "Food preference data helps delivery platforms and FMCG brands understand consumer habits and target better.",
  realestate: "Real estate browsing signals buyer intent weeks before a purchase decision — developers pay premium for this data.",
  jobs: "Job seeking behavior is extremely valuable to recruiters and HR platforms looking for active candidates.",
  other: "Your browsing data has been anonymized and packaged. Market researchers pay for behavioral patterns across all categories."
};

// Cache key from domain + title
function cacheKey(domain, title) {
  return crypto.createHash("md5").update(`${domain}::${title || ""}`).digest("hex");
}

// ─── /api/categorize (kept for backward compatibility with extension) ──────────
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

// ─── /api/extract (new — full structured extraction) ─────────────────────────
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

Intent score guide:
- 8-10: specific product page, cart, checkout, comparison
- 5-7: category browsing, review reading, search results
- 1-4: homepage, general browsing, social feed

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

// ─── /api/sync (extension pushes data here) ───────────────────────────────────
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

// ─── /api/profile/:userId (dashboard reads from here) ─────────────────────────
app.get("/api/profile/:userId", (req, res) => {
  const { userId } = req.params;
  const sessions = userSessions[userId] || {};
  const profile = userProfiles[userId] || {};

  const todayKey = new Date().toISOString().split("T")[0];
  const todaySessions = sessions[todayKey] || {};

  const categories = {};
  const brands = {};
  const searchQueries = [];
  let totalSeconds = 0;

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
    }
  }

  const topBrands = Object.entries(brands)
    .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([b]) => b);

  const topCategories = Object.entries(categories)
    .sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 5).map(([c]) => c);

  const segments = [];
  if ((categories.shopping?.seconds || 0) > 1800) segments.push("high_intent_shopper");
  if ((categories.finance?.seconds || 0) > 900) segments.push("finance_decision_maker");
  if ((categories.technology?.seconds || 0) > 1800) segments.push("tech_early_adopter");
  if ((categories.realestate?.seconds || 0) > 600) segments.push("property_seeker");
  if ((categories.jobs?.seconds || 0) > 600) segments.push("job_seeker");
  if ((categories.travel?.seconds || 0) > 600) segments.push("travel_planner");

  return res.json({
    userId, profile,
    totalEarnings: profile.totalEarnings || 0,
    totalBrowsingHours: (totalSeconds / 3600).toFixed(1),
    topCategories, topBrands, categories,
    searchQueries: searchQueries.slice(-50),
    segments, todaySessions
  });
});

// ─── /api/packages (company dashboard) ────────────────────────────────────────
app.get("/api/packages", (req, res) => {
  return res.json([
    {
      id: "high_intent_shoppers",
      name: "High Intent Shoppers",
      description: "Users actively researching products across multiple e-commerce sites with high purchase intent signals.",
      signals: ["Cross-site product comparison", "Brand research", "Search queries with product names", "High scroll depth on product pages"],
      userCount: 1247,
      price: 299,
      formats: ["csv", "json"],
      sampleFields: ["user_id", "age_range", "gender", "city", "top_brands", "intent_score", "search_queries"]
    },
    {
      id: "finance_decision_makers",
      name: "Finance Decision Makers",
      description: "Users browsing investment, banking, and loan products — near financial decision signals.",
      signals: ["Loan calculator usage", "Investment platform browsing", "Bank comparison behavior", "Finance search queries"],
      userCount: 892,
      price: 499,
      formats: ["csv", "json", "pdf"],
      sampleFields: ["user_id", "age_range", "gender", "city", "occupation", "finance_products_viewed", "intent_score"]
    },
    {
      id: "tech_early_adopters",
      name: "Tech Early Adopters",
      description: "Heavy technology and entertainment browsers — early adopters of new tools, platforms and products.",
      signals: ["AI tool usage", "Developer platform browsing", "Tech news consumption", "Multiple streaming subscriptions"],
      userCount: 2341,
      price: 199,
      formats: ["csv", "json"],
      sampleFields: ["user_id", "age_range", "gender", "city", "top_tech_tools", "daily_browsing_hours"]
    }
  ]);
});

// ─── /api/insight (unchanged from old) ────────────────────────────────────────
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

// ─── /api/health ───────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({
  status: "ok",
  categoryCacheSize: Object.keys(categoryCache).length,
  extractCacheSize: Object.keys(extractCache).length,
  users: Object.keys(userProfiles).length
}));

app.listen(PORT, () => {
  console.log(`Reclaim backend running on http://localhost:${PORT}`);
  console.log(`Gemini API key: ${process.env.GEMINI_API_KEY ? "✓ loaded" : "✗ missing"}`);
});