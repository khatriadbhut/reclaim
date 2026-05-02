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

// ─── /api/categorize (kept for backward compatibility) ────────────────────────
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

  // Active hours analysis
  const hourCounts = {};
  visitHours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1; });
  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const isNightOwl = visitHours.some(h => h >= 22 || h <= 2);

  // Segment assignment
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
    totalEarnings: profile.totalEarnings || 0,
    totalBrowsingHours: (totalSeconds / 3600).toFixed(1),
    topCategories, topBrands, categories,
    searchQueries: [...new Set(searchQueries)].slice(-50),
    segments, todaySessions,
    deviceType,
    peakHour,
    isNightOwl
  });
});

// ─── /api/packages ────────────────────────────────────────────────────────────
app.get("/api/packages", (req, res) => {
  return res.json([
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
      userCount: 1247,
      price: 299,
      formats: ["csv", "json"],
      useCases: ["Performance marketing", "Retargeting campaigns", "Product launch targeting", "Competitive conquest"]
    },
    {
      id: "cross_platform_behavioral",
      tier: 1,
      name: "Cross-Platform Behavioral Profile",
      tagline: "Full 360° consumer behavior — data no single platform can offer",
      description: "The most comprehensive behavioral dataset available. Reclaim's browser extension captures behavior across ALL sites — something Meta, Google, or Amazon can never do individually. Includes category mix, brand affinities, content consumption, time patterns, and search intent.",
      strongNow: true,
      strongerAfterOnboarding: false,
      signals: [
        "Cross-site category distribution (shopping, finance, entertainment, etc.)",
        "Brand affinity scores across all categories",
        "Search queries across Google, Amazon, YouTube, Flipkart",
        "Time-of-day browsing patterns (morning/afternoon/evening/night)",
        "Device type and peak active hours",
        "Content engagement (scroll depth on articles and product pages)",
        "Page type journey (homepage → search → product → checkout)"
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
      userCount: 3892,
      price: 399,
      formats: ["csv", "json"],
      useCases: ["Audience segmentation", "Lookalike modeling", "Brand affinity research", "Consumer journey mapping"]
    },
    {
      id: "finance_decision_makers",
      tier: 2,
      name: "Finance Decision Makers",
      tagline: "Users actively researching financial products — near conversion",
      description: "High-value audience actively browsing investment platforms, loan calculators, banking products, and insurance comparisons. Occupation and age from onboarding makes this a premium qualified lead package.",
      strongNow: true,
      strongerAfterOnboarding: true,
      onboardingUpgrade: "Occupation data (salaried/business owner/student) increases package value 3x for lenders and investment platforms",
      signals: [
        "Finance category browsing 15+ minutes",
        "Search queries: home loan, mutual fund, SIP, insurance, EMI calculator",
        "Investment platform visits (Zerodha, Groww, Upstox)",
        "Banking product page visits",
        "Intent scores on finance pages",
        "Occupation from onboarding (post-launch)"
      ],
      dataFields: [
        "user_id", "finance_platforms_visited", "search_queries", "intent_score",
        "finance_products_researched", "visit_frequency", "age_range", "gender",
        "occupation", "city", "device"
      ],
      sampleData: [
        {
          user_id: "usr_f1m4k9", finance_platforms_visited: ["zerodha.com", "groww.in", "moneycontrol.com"],
          search_queries: ["best mutual fund sip 2026", "nifty 50 index fund returns", "zerodha vs groww"],
          intent_score: 8, finance_products_researched: ["mutual_fund", "index_fund", "demat_account"],
          visit_frequency: 9, age_range: "25-34", gender: "M", occupation: "Software Engineer", city: "Bangalore", device: "desktop"
        },
        {
          user_id: "usr_g7p2s1", finance_platforms_visited: ["sbi.co.in", "hdfc.com", "bankbazaar.com"],
          search_queries: ["home loan eligibility calculator", "sbi home loan rate 2026", "home loan vs rent"],
          intent_score: 9, finance_products_researched: ["home_loan", "mortgage"],
          visit_frequency: 14, age_range: "28-35", gender: "M", occupation: "Salaried", city: "Pune", device: "mobile"
        },
        {
          user_id: "usr_h3n8t4", finance_platforms_visited: ["policybazaar.com", "coverfox.com", "licindia.in"],
          search_queries: ["term insurance 1 crore premium", "best health insurance family floater"],
          intent_score: 7, finance_products_researched: ["term_insurance", "health_insurance"],
          visit_frequency: 6, age_range: "30-40", gender: "F", occupation: "Business Owner", city: "Delhi", device: "desktop"
        }
      ],
      userCount: 892,
      price: 499,
      formats: ["csv", "json", "pdf"],
      useCases: ["Fintech user acquisition", "Loan lead generation", "Investment platform growth", "Insurance cross-sell"]
    },
    {
      id: "tech_early_adopters",
      tier: 1,
      name: "Tech Early Adopters",
      tagline: "Developers, AI users, and tech enthusiasts — first to adopt new tools",
      description: "Heavy technology browsers who use AI tools, developer platforms, and consume tech content daily. High-value B2B and SaaS audience identified through actual tool usage patterns.",
      strongNow: true,
      strongerAfterOnboarding: false,
      signals: [
        "Technology category 30%+ of total browsing",
        "AI tool usage (claude.ai, openai.com, GitHub Copilot)",
        "Developer platform visits (GitHub, StackOverflow, Vercel)",
        "Tech news consumption (TechCrunch, The Verge, Hacker News)",
        "Search queries for tools, frameworks, APIs",
        "Device type (desktop-dominant for developers)"
      ],
      dataFields: [
        "user_id", "tech_tools_used", "ai_tools_used", "search_queries",
        "dev_platforms_visited", "tech_browsing_hours", "device", "age_range",
        "gender", "occupation", "city"
      ],
      sampleData: [
        {
          user_id: "usr_i9q5v2", tech_tools_used: ["github.com", "vercel.com", "figma.com", "notion.so"],
          ai_tools_used: ["claude.ai", "openai.com"],
          search_queries: ["react server components 2026", "next.js vs remix", "claude api pricing"],
          dev_platforms_visited: ["stackoverflow.com", "github.com", "leetcode.com"],
          tech_browsing_hours: 3.8, device: "desktop",
          age_range: "18-24", gender: "M", occupation: "Student", city: "Roorkee"
        },
        {
          user_id: "usr_j2w7b6", tech_tools_used: ["github.com", "aws.amazon.com", "netlify.com"],
          ai_tools_used: ["openai.com", "claude.ai", "midjourney.com"],
          search_queries: ["gpt-4o api vs claude 3.5", "best ai coding assistant 2026", "aws lambda pricing"],
          dev_platforms_visited: ["github.com", "stackoverflow.com", "devto.com"],
          tech_browsing_hours: 5.1, device: "desktop",
          age_range: "25-34", gender: "M", occupation: "Software Engineer", city: "Hyderabad"
        },
        {
          user_id: "usr_k4r1m8", tech_tools_used: ["figma.com", "canva.com", "notion.so", "linear.app"],
          ai_tools_used: ["claude.ai", "gamma.app"],
          search_queries: ["figma vs framer 2026", "product roadmap tools", "best design system 2026"],
          dev_platforms_visited: ["dribbble.com", "producthunt.com", "figma.com"],
          tech_browsing_hours: 2.9, device: "desktop",
          age_range: "25-34", gender: "F", occupation: "Product Manager", city: "Bangalore"
        }
      ],
      userCount: 2341,
      price: 199,
      formats: ["csv", "json"],
      useCases: ["SaaS user acquisition", "Developer tool marketing", "B2B tech sales", "AI product launch"]
    },
    {
      id: "real_estate_prospects",
      tier: 2,
      name: "Real Estate Prospects",
      tagline: "Active property searchers weeks before they contact a broker",
      description: "Users actively browsing property listings with location-specific searches. Real estate has the highest per-lead value in India. City data from onboarding makes this a fully qualified lead package.",
      strongNow: true,
      strongerAfterOnboarding: true,
      onboardingUpgrade: "City from onboarding allows geo-targeted delivery — a Mumbai user searching 3BHK is worth 10x more than anonymous",
      signals: [
        "Real estate platform visits (MagicBricks, 99acres, NoBroker, Housing.com)",
        "Property search queries with BHK, location, budget",
        "Property type extraction from titles (3BHK, villa, plot)",
        "Location extracted from page titles",
        "Intent scores on listing pages",
        "Visit frequency on property sites"
      ],
      dataFields: [
        "user_id", "property_platforms_visited", "search_queries", "property_types",
        "locations_searched", "intent_score", "visit_frequency", "age_range",
        "gender", "occupation", "city", "device"
      ],
      sampleData: [
        {
          user_id: "usr_l6s3n1", property_platforms_visited: ["magicbricks.com", "99acres.com", "nobroker.in"],
          search_queries: ["3bhk flat roorkee", "2bhk apartment haridwar road", "flat for sale under 50 lakhs roorkee"],
          property_types: ["3BHK", "2BHK"], locations_searched: ["Roorkee", "Haridwar Road", "BHEL"],
          intent_score: 8, visit_frequency: 11,
          age_range: "25-34", gender: "M", occupation: "Engineer", city: "Roorkee", device: "mobile"
        },
        {
          user_id: "usr_m8t5p3", property_platforms_visited: ["housing.com", "magicbricks.com"],
          search_queries: ["2bhk rent mumbai andheri west", "pg near bkc mumbai", "flat on rent bandra"],
          property_types: ["2BHK", "PG"], locations_searched: ["Andheri West", "BKC", "Bandra"],
          intent_score: 7, visit_frequency: 8,
          age_range: "22-28", gender: "F", occupation: "Working Professional", city: "Mumbai", device: "mobile"
        },
        {
          user_id: "usr_n2v4k7", property_platforms_visited: ["99acres.com", "nobroker.in", "housing.com"],
          search_queries: ["villa for sale bangalore whitefield", "independent house 4bhk bangalore", "plot in sarjapur road"],
          property_types: ["Villa", "4BHK", "Plot"], locations_searched: ["Whitefield", "Sarjapur Road", "Electronic City"],
          intent_score: 9, visit_frequency: 17,
          age_range: "35-45", gender: "M", occupation: "Business Owner", city: "Bangalore", device: "desktop"
        }
      ],
      userCount: 634,
      price: 449,
      formats: ["csv", "json", "pdf"],
      useCases: ["Real estate developer targeting", "Home loan lead gen", "Broker acquisition", "Interior design marketing"]
    },
    {
      id: "night_owl_impulse_buyers",
      tier: 1,
      name: "Night Owl Impulse Buyers",
      tagline: "Late-night mobile shoppers — highest impulse purchase rate",
      description: "Unique to Reclaim. Users who browse shopping and entertainment sites between 10pm–2am on mobile devices. This time-specific behavioral segment is impossible for any single platform to identify. D2C brands see 40% higher conversion rates targeting this segment.",
      strongNow: true,
      strongerAfterOnboarding: false,
      signals: [
        "Shopping/entertainment browsing between 10pm–2am",
        "Mobile device dominant (85%+ of this segment)",
        "Search queries during late-night hours",
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
          late_night_search_queries: ["myntra sale tonight", "swiggy promo code", "what to watch netflix"],
          avg_session_duration_night: 34,
          age_range: "18-24", gender: "F", city: "Delhi"
        },
        {
          user_id: "usr_p7y1s5", peak_shopping_hours: ["22:30", "23:45", "00:15"],
          device: "mobile", late_night_categories: ["shopping", "technology", "entertainment"],
          late_night_brands: ["Amazon", "Flipkart", "YouTube"],
          late_night_search_queries: ["amazon flash sale tonight", "flipkart big billion day deals", "budget gaming laptop"],
          avg_session_duration_night: 28,
          age_range: "18-24", gender: "M", city: "Pune"
        },
        {
          user_id: "usr_q5w8r2", peak_shopping_hours: ["23:00", "00:45"],
          device: "mobile", late_night_categories: ["food", "shopping", "social"],
          late_night_brands: ["Zomato", "Meesho", "Instagram"],
          late_night_search_queries: ["zomato midnight delivery", "meesho sale dresses", "best midnight snacks order"],
          avg_session_duration_night: 41,
          age_range: "22-30", gender: "F", city: "Hyderabad"
        }
      ],
      userCount: 1876,
      price: 179,
      formats: ["csv", "json"],
      useCases: ["D2C flash sale targeting", "Food delivery promotions", "Late-night OTT acquisition", "Mobile-first campaign optimization"]
    }
  ]);
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
  users: Object.keys(userProfiles).length
}));

app.listen(PORT, () => {
  console.log(`Reclaim backend running on http://localhost:${PORT}`);
  console.log(`Gemini API key: ${process.env.GEMINI_API_KEY ? "✓ loaded" : "✗ missing"}`);
});