const WHOISXML_ENDPOINT = "https://website-categorization.whoisxmlapi.com/api/v3";

function mapWhoisXmlCategoryToReclaim(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("news")) return "news";
  if (n.includes("politic")) return "news";
  if (n.includes("business") || n.includes("finance") || n.includes("banking") || n.includes("invest")) return "finance";
  if (n.includes("shopping") || n.includes("e-commerce") || n.includes("ecommerce") || n.includes("retail")) return "shopping";
  if (n.includes("social network") || /\bsocial\b/.test(n)) return "social";
  if (n.includes("education") || n.includes("reference") || n.includes("training")) return "education";
  if (n.includes("health") || n.includes("medical") || n.includes("medicine")) return "health";
  if (n.includes("travel") || n.includes("hotel") || n.includes("airline") || n.includes("tourism")) return "travel";
  if (n.includes("computer") || n.includes("software") || n.includes("technology") || n.includes("internet")) return "technology";
  if (n.includes("food") || n.includes("restaurant")) return "food";
  if (n.includes("real estate") || n.includes("property")) return "realestate";
  if (n.includes("career") || n.includes("jobs") || n.includes("employment")) return "jobs";
  if (n.includes("entertainment") || n.includes("television") || n.includes("movies") || n.includes("music") || n.includes("media")) {
    return "entertainment";
  }
  return null;
}

export function pickStrictWhoisMapping(categories, minConfidence) {
  if (!Array.isArray(categories) || categories.length === 0) return null;
  const ranked = categories
    .filter((c) => c && typeof c === "object")
    .map((c) => ({
      id: c.id,
      name: String(c.name || "").trim(),
      confidence: typeof c.confidence === "number" ? c.confidence : null,
    }))
    .filter((c) => c.name && c.confidence != null && c.confidence >= minConfidence)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  for (const c of ranked) {
    const mapped = mapWhoisXmlCategoryToReclaim(c.name);
    if (mapped) return { category: mapped, confidence: c.confidence, iab: { id: c.id, name: c.name } };
  }
  return null;
}

export async function whoisXmlLookup({ apiKey, urlOrDomain }) {
  const target = String(urlOrDomain || "").trim();
  if (!apiKey || !target) return { ok: false, error: "missing apiKey or urlOrDomain" };

  const url = new URL(WHOISXML_ENDPOINT);
  url.searchParams.set("apiKey", apiKey);
  const asUrl = target.startsWith("http://") || target.startsWith("https://") ? target : `https://${target}/`;
  url.searchParams.set("url", asUrl);

  const res = await fetch(url.toString(), { method: "GET" });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: (json && json.message) || text || "whoisxml lookup failed", raw: json };
  }
  return { ok: true, raw: json };
}
