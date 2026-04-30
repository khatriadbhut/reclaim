import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

app.use(cors());
app.use(express.json());

const categoryCache = {};
const CACHE_TTL = 1000 * 60 * 60 * 24;
const VALID_CATEGORIES = ["shopping","social","news","finance","entertainment","education","health","travel","technology","other"];

app.post("/api/categorize", async (req, res) => {
  const { domain, title } = req.body;
  if (!domain) return res.status(400).json({ error: "domain is required" });
  const cached = categoryCache[domain];
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) return res.json({ category: cached.category, cached: true });
  try {
    const prompt = `Categorize this website into exactly ONE of: shopping, social, news, finance, entertainment, education, health, travel, technology, other\nDomain: ${domain}\nTitle: ${title || "unknown"}\nReply with ONLY the single category word.`;
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().toLowerCase();
    const category = VALID_CATEGORIES.includes(raw) ? raw : "other";
    categoryCache[domain] = { category, cachedAt: Date.now() };
    return res.json({ category, cached: false });
  } catch (err) {
    return res.status(500).json({ category: "other", error: err.message });
  }
});

app.post("/api/insight", async (req, res) => {
  const { summary } = req.body;
  if (!summary) return res.status(400).json({ error: "summary is required" });
  try {
    const prompt = `You are an AI for Reclaim, an app that pays users for their browsing data.\nUser browsing today: ${summary}\nWrite ONE short useful insight (max 2 sentences). Be specific, conversational, no emojis.`;
    const result = await model.generateContent(prompt);
    return res.json({ insight: result.response.text().trim() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok", cacheSize: Object.keys(categoryCache).length }));

app.listen(PORT, () => {
  console.log(`Reclaim backend running on http://localhost:${PORT}`);
  console.log(`Gemini API key: ${process.env.GEMINI_API_KEY ? "✓ loaded" : "✗ missing"}`);
});
