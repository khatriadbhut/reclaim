/**
 * Map vendor "website category" labels (e.g., WhoisXML) onto IAB Content Taxonomy v3 nodes.
 * This is intentionally conservative: we prefer exact taxonomy name matches, then high-precision roots.
 */

export function mapVendorLabelToIabContentId(norm) {
  const s = String(norm || "").trim();
  if (!s) return null;

  // Tier-1 / obvious roots (stable IDs from Content Taxonomy v3.0 TSV)
  if (/\bpolitic\b|political\b/.test(s)) return { id: "386", method: "root_politics", confidence: 0.78 };
  if (/\bmedia industry\b/.test(s)) return { id: "106", method: "industry_media", confidence: 0.78 };
  if (/\bfinance\b|invest|bank|loan|insurance|mutual|sip\b|credit\b|mortgage\b/.test(s)) return { id: "52", method: "root_business_finance", confidence: 0.8 };
  if (/\bautomotive\b|\bcar\b|\bvehicle\b/.test(s)) return { id: "1", method: "root_automotive", confidence: 0.78 };
  if (/\bshopping\b|ecommerce|e commerce|retail|luxury goods/.test(s)) return { id: "473", method: "root_shopping", confidence: 0.78 };
  if (/\btravel\b|airline|hotel|lodging|tourism/.test(s)) return { id: "653", method: "root_travel", confidence: 0.78 };
  if (/\bfood\b|restaurant|dining|grocery|beverage|cuisine/.test(s)) return { id: "210", method: "root_food_drink", confidence: 0.74 };
  if (/\bhealth\b|medical|pharma|wellness|fitness\b/.test(s)) return { id: "223", method: "root_healthy_living", confidence: 0.74 };
  if (/\beducation\b|university|schooling|academic/.test(s)) return { id: "132", method: "root_education", confidence: 0.76 };
  if (/\btechnology\b|software|computing|internet|cloud|cyber|developer|saas\b|artificial intelligence\b|\bai\b/.test(s)) return { id: "596", method: "root_technology_computing", confidence: 0.74 };
  if (/\bsport\b|olympic|cricket|football|basketball|tennis\b/.test(s)) return { id: "483", method: "root_sports", confidence: 0.78 };
  if (/\breal estate\b|property\b|\bbhk\b|mortgage broker\b/.test(s)) return { id: "441", method: "root_real_estate", confidence: 0.76 };
  if (/\bjobs?\b|career|hiring|recruit|resume\b/.test(s)) return { id: "123", method: "root_careers", confidence: 0.76 };
  if (/\bsocial\b|social network|networking/.test(s)) return { id: "628", method: "node_social_networking", confidence: 0.72 };
  if (/\bnews\b|journalism|current events\b|international affairs\b/.test(s)) return { id: "386", method: "proxy_news_to_politics", confidence: 0.62 };
  if (/\bentertainment\b|television|tv\b|movie|music\b|celebr/.test(s)) return { id: "JLBCU7", method: "root_entertainment", confidence: 0.72 };

  return null;
}
