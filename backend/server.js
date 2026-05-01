import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

const categoryCache = {};
const CACHE_TTL = 1000 * 60 * 60 * 24;
const VALID_CATEGORIES = ["shopping","social","news","finance","entertainment","education","health","travel","technology","other"];

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
  "wikipedia.org": "education", "coursera.org": "education", "udemy.com": "education",
  "khanacademy.org": "education", "stackoverflow.com": "education", "leetcode.com": "education",
  "google.com": "technology", "microsoft.com": "technology", "apple.com": "technology",
  "claude.ai": "technology", "openai.com": "technology", "notion.so": "technology",
  "figma.com": "technology", "canva.com": "technology", "github.com": "technology",
  "practo.com": "health", "1mg.com": "health", "webmd.com": "health", "healthline.com": "health",
  "makemytrip.com": "travel", "goibibo.com": "travel", "airbnb.com": "travel",
  "booking.com": "travel", "irctc.co.in": "travel", "uber.com": "travel"
};

// Smart fallback insights based on top category
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
  other: "Your browsing data has been anonymized and packaged. Market researchers pay for behavioral patterns across all categories."
};

async function getCategory(domain, title) {
  if (KNOWN_DOMAINS[domain]) return { category: KNOWN_DOMAINS[domain], source: "known" };
  if (categoryCache[domain] && Date.now() - categoryCache[domain].cachedAt < CACHE_TTL) {
    return { category: categoryCache[domain].category, source: "cache" };
  }
  try {
    const prompt = `Categorize this website into exactly ONE of: shopping, social, news, finance, entertainment, education, health, travel, technology, other\nDomain: ${domain}\nTitle: ${title || "unknown"}\nReply with ONLY the single category word.`;
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().toLowerCase();
    const category = VALID_CATEGORIES.includes(raw) ? raw : "other";
    categoryCache[domain] = { category, cachedAt: Date.now() };
    return { category, source: "gemini" };
  } catch {
    return { category: "other", source: "fallback" };
  }
}

app.post("/api/categorize", async (req, res) => {
  const { domain, title } = req.body;
  if (!domain) return res.status(400).json({ error: "domain is required" });
  const result = await getCategory(domain, title);
  return res.json(result);
});

app.post("/api/insight", async (req, res) => {
  const { summary } = req.body;
  if (!summary) return res.status(400).json({ error: "summary is required" });

  // Find top category from summary
  const topCat = summary.split(",")[0].trim().split(":")[0].trim().toLowerCase();

  try {
    const prompt = `You are an AI for Reclaim, an app that pays users for their browsing data.\nUser browsing today: ${summary}\nWrite ONE short useful insight (max 2 sentences). Be specific, conversational, no emojis.`;
    const result = await model.generateContent(prompt);
    return res.json({ insight: result.response.text().trim(), source: "gemini" });
  } catch {
    const fallback = FALLBACK_INSIGHTS[topCat] || FALLBACK_INSIGHTS.other;
    return res.json({ insight: fallback, source: "fallback" });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok", cacheSize: Object.keys(categoryCache).length }));

app.listen(PORT, () => {
  console.log(`Reclaim backend running on http://localhost:${PORT}`);
  console.log(`Gemini API key: ${process.env.GEMINI_API_KEY ? "✓ loaded" : "✗ missing"}`);
});
