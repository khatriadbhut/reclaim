const WHOISXML_ENDPOINT = "https://website-categorization.whoisxmlapi.com/api/v3";

function mapWhoisXmlCategoryToReclaim(name) {
  const n = String(name || "").toLowerCase();
  // Normalize a few common variants
  const s = n.replace(/&/g, "and");

  // --- High precision first ---
  if (/\b(real estate|real-estate|property|properties|housing|apartments?)\b/.test(s)) return "realestate";
  if (/\b(job|jobs|career|careers|employment|recruit|recruiting|recruitment|hr|human resources|talent|hiring|resume|cv)\b/.test(s)) return "jobs";
  if (/\b(travel|tourism|hotel|hotels|airline|air travel|flights?|booking|vacation|trip|transportation|ride share|rideshare|car rental|rail)\b/.test(s)) return "travel";
  if (/\b(shopping|retail|e-?commerce|marketplace|coupons?|deals?|discounts?)\b/.test(s)) return "shopping";
  if (/\b(bank|banking|finance|financial|fintech|insurance|invest|investment|trading|broker|brokerage|stocks?|equity|crypto|loans?|mortgage|credit|credit card|payments?|payment processing|vc|venture capital|private equity)\b/.test(s)) {
    return "finance";
  }
  if (/\b(news|newspaper|journalism|current events|media|press|politic|government|international affairs)\b/.test(s)) return "news";
  if (/\b(social network|social networking|social media|community|forums?|messaging|chat|dating)\b/.test(s)) return "social";
  if (/\b(health|healthy living|wellness|fitness|medical|medicine|pharma|pharmaceutical|doctor|clinic|hospital|disease)\b/.test(s)) return "health";
  if (/\b(education|training|courses?|learning|university|college|school|reference|tutorials?)\b/.test(s)) return "education";

  // --- Broader tech coverage (common vendor labels) ---
  if (
    /\b(technology|tech|computer|computing|software|internet|web|developer|programming|cloud|saas|ai|artificial intelligence|it services|information technology|hosting|data center|cybersecurity|security)\b/.test(s)
  ) {
    return "technology";
  }

  // --- Entertainment ---
  if (/\b(entertainment|television|tv|movies?|film|music|streaming|games?|gaming|sports)\b/.test(s)) return "entertainment";

  // --- Food ---
  if (/\b(food|restaurant|dining|recipes?|cuisine|delivery|takeout|groceries?)\b/.test(s)) return "food";

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
    .filter((c) => c.name && c.confidence != null && c.confidence > 0 && c.confidence >= minConfidence)
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
