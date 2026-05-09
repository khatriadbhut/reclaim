// Reclaim - Content Script v2
// Production-grade data extraction using industry standards
// Price extraction: JSON-LD → Open Graph → Microdata → CSS selectors → Regex
// Captures: search queries, scroll depth, prices, device type, time of day, page type, breadcrumbs

(function () {
  if (!window.location.href.startsWith("http")) return;

  const domain = window.location.hostname.replace("www.", "");

  // ─── 1. DEVICE TYPE ──────────────────────────────────────────────────────────

  function getDeviceType() {
    const ua = navigator.userAgent.toLowerCase();
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return "tablet";
    if (/mobile|iphone|ipod|android|blackberry|mini|windows\sce|palm/i.test(ua)) return "mobile";
    return "desktop";
  }

  const deviceType = getDeviceType();

  // ─── 2. TIME OF DAY ──────────────────────────────────────────────────────────

  function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }

  const timeOfDay = getTimeOfDay();
  const visitHour = new Date().getHours();

  // ─── 3. PAGE TYPE DETECTION ──────────────────────────────────────────────────

  function getPageType() {
    const url = window.location.href.toLowerCase();
    const path = window.location.pathname.toLowerCase();

    function hasSchemaProductSignals() {
      try {
        // JSON-LD Product / Offer
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const s of scripts) {
          const t = s.textContent;
          if (!t) continue;
          if (/"@type"\s*:\s*"Product"/i.test(t) && /"offers"\s*:/i.test(t)) return true;
          if (/"@type"\s*:\s*"Offer"/i.test(t) && /"price"\s*:/i.test(t)) return true;
        }
        // Microdata Product
        if (document.querySelector('[itemtype*="schema.org/Product"] [itemprop="price"]')) return true;
      } catch {
        /* ignore */
      }
      return false;
    }

    function hasAddToCartSignals() {
      try {
        const btn = document.querySelector('button, [role="button"], input[type="submit"]');
        if (!btn) return false;
        const txt = (btn.textContent || btn.getAttribute("value") || "").toLowerCase();
        return /\b(add to cart|add to bag|buy now|checkout|place order)\b/.test(txt);
      } catch {
        return false;
      }
    }

    function isLikelyEcommerceContext() {
      // Known commerce domains (from search params + selector maps)
      const known = new Set([
        "amazon.in", "amazon.com", "flipkart.com", "myntra.com", "nykaa.com", "meesho.com", "ajio.com", "snapdeal.com",
        "swiggy.com", "zomato.com", "booking.com", "makemytrip.com", "cleartrip.com", "skyscanner.com", "irctc.co.in"
      ]);
      if (known.has(domain)) return true;
      if (hasSchemaProductSignals()) return true;
      if (hasAddToCartSignals()) return true;
      return false;
    }

    // Cart / Checkout — highest intent
    if (/cart|checkout|basket|buy-now|payment|order/.test(url)) return "checkout";

    // Job listing (avoid generic "role" false positives)
    if (/\/(careers?|jobs?)\b/.test(path) || /\/job\/|\/jobs\//.test(path)) return "job_listing";

    // Property listing (avoid generic "sale" false positives)
    if (/\/(property|properties|real-estate)\b/.test(path) || /\b(bhk|apartment|villa)\b/.test(url)) return "property_listing";

    // Travel booking (keep tight; "package" is too ambiguous and caused false positives)
    if (/\b(flight|flights|hotel|hotels|booking|itinerary|pnr|checkin|boarding|airline|airlines)\b/.test(url)) {
      return "travel_booking";
    }

    const isEcom = isLikelyEcommerceContext();

    // Product page: only if site looks like ecommerce (schema/add-to-cart/known domain)
    if (isEcom && (/\/(dp|p|product|products|item|items)\b/.test(path) || /pdp|product-detail|\/p\/[a-z0-9]/.test(url))) {
      return "product";
    }

    // Search results
    if (/search|query|find|results|keyword|s=|q=|k=/.test(url)) return "search";

    // Category / Listing page (avoid "shop" keyword on corporate sites)
    if (isEcom && (/\/(category|collection|collections|listing|browse)\b/.test(path) || /\/c\//.test(path))) {
      return "category";
    }

    // Article / Blog
    if (/article|blog|news|post|story|read/.test(url)) return "article";

    // Homepage
    if (path === "/" || path === "") return "homepage";

    return "other";
  }

  const pageType = getPageType();

  // ─── 4. SEARCH QUERY CAPTURE ─────────────────────────────────────────────────

  const SEARCH_PARAMS = {
    "google.com": "q",
    "youtube.com": "search_query",
    "amazon.in": "k",
    "amazon.com": "k",
    "flipkart.com": "q",
    "bing.com": "q",
    "duckduckgo.com": "q",
    "reddit.com": "q",
    "myntra.com": "q",
    "meesho.com": "q",
    "ajio.com": "q",
    "nykaa.com": "q",
    "snapdeal.com": "keyword",
    "swiggy.com": "query",
    "zomato.com": "q",
    "naukri.com": "k",
    "internshala.com": "q",
    "indeed.com": "q",
    "magicbricks.com": "q",
    "99acres.com": "q",
    "nobroker.in": "q",
    "booking.com": "ss",
    "makemytrip.com": "query",
    "cleartrip.com": "query",
    "skyscanner.com": "query",
    "irctc.co.in": "query",
    "practo.com": "q",
    "1mg.com": "q",
    "nykaa.com": "q",
    "zepto.com": "q",
    "blinkit.com": "q",
  };

  function extractSearchQuery() {
    const paramKey = SEARCH_PARAMS[domain];
    if (!paramKey) return null;
    const params = new URLSearchParams(window.location.search);
    const query = params.get(paramKey);
    return query ? decodeURIComponent(query).trim() : null;
  }

  // ─── 5. PRICE EXTRACTION (Production Grade) ──────────────────────────────────

  // Step 1: JSON-LD (schema.org standard — used by Google Shopping, Shopify, WooCommerce)
  function extractFromJSONLD() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const results = [];

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          const nodes = item["@graph"] ? item["@graph"] : [item];

          for (const node of nodes) {
            const type = node["@type"];
            if (!type) continue;

            if (type === "Product" || type === "IndividualProduct") {
              const offer = node.offers || node.Offers;
              if (offer) {
                const offers = Array.isArray(offer) ? offer : [offer];
                for (const o of offers) {
                  if (o.price) {
                    results.push({
                      price: String(o.price),
                      currency: o.priceCurrency || "INR",
                      name: node.name || null,
                      brand: node.brand?.name || node.brand || null,
                      availability: o.availability?.replace("https://schema.org/", "") || null
                    });
                  }
                }
              }
            }
          }
        }
      } catch {
        // Invalid JSON — skip
      }
    }
    return results;
  }

  // Step 2: Open Graph / Meta tags
  function extractFromMetaTags() {
    function looksLikeMoney(v) {
      const s = String(v || "").trim();
      if (!s) return false;
      // Reject common non-price counters like "19+" or "75%" etc.
      if (/[+%]/.test(s) && !/[₹$€£¥]/.test(s)) return false;
      // Currency symbol + amount
      if (/[₹$€£¥]\s?\d/.test(s)) return true;
      // Currency code with amount
      if (/\b(usd|inr|eur|gbp|jpy|cad|aud)\b/i.test(s) && /\d/.test(s)) return true;
      return false;
    }

    const getMeta = (name) => {
      const el = document.querySelector(
        `meta[property="${name}"], meta[name="${name}"]`
      );
      return el?.getAttribute("content") || null;
    };

    const price = getMeta("product:price:amount") ||
                  getMeta("og:price:amount") ||
                  getMeta("twitter:data1");

    const currency = getMeta("product:price:currency") ||
                     getMeta("og:price:currency") || "INR";

    const name = getMeta("og:title") || getMeta("twitter:title");
    const brand = getMeta("og:brand") || getMeta("product:brand");

    if (price && looksLikeMoney(price)) {
      return [{ price, currency, name, brand, availability: null }];
    }
    return [];
  }

  // Step 3: Microdata
  function extractFromMicrodata() {
    const results = [];
    const products = document.querySelectorAll('[itemtype*="schema.org/Product"]');

    for (const product of products) {
      const priceEl = product.querySelector('[itemprop="price"]');
      const currencyEl = product.querySelector('[itemprop="priceCurrency"]');
      const nameEl = product.querySelector('[itemprop="name"]');
      const brandEl = product.querySelector('[itemprop="brand"]');

      const price = priceEl?.getAttribute("content") || priceEl?.textContent?.trim();
      if (price) {
        results.push({
          price,
          currency: currencyEl?.getAttribute("content") || "INR",
          name: nameEl?.textContent?.trim() || null,
          brand: brandEl?.textContent?.trim() || null,
          availability: null
        });
      }
    }
    return results;
  }

  // Step 4: Site-specific CSS selectors
  function extractFromSelectors() {
    const SELECTORS = {
      "amazon.in":   [".a-price-whole", "#corePriceDisplay_desktop_feature_div .a-price-whole"],
      "amazon.com":  [".a-price-whole", "#corePriceDisplay_desktop_feature_div .a-price-whole"],
      "flipkart.com": ["._30jeq3", "._16Jk6d"],
      "myntra.com":  [".pdp-price strong"],
      "nykaa.com":   [".post-card__content-price"],
      "meesho.com":  ["h4[class*='price']"],
      "ajio.com":    [".prod-sp"],
      "snapdeal.com": [".payBlkBig"],
    };

    const selectors = SELECTORS[domain];
    if (!selectors) return [];

    const results = [];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) {
        results.push({
          price: el.textContent.trim(),
          currency: "INR",
          name: null, brand: null, availability: null
        });
        break;
      }
    }
    return results;
  }

  // Step 5: Regex fallback
  function extractFromRegex() {
    const PRICE_REGEX = /[₹$€£¥]\s?\d[\d,]*(\.\d{1,2})?/g;
    const bodyText = document.body.innerText.slice(0, 8000);
    const matches = [...new Set(bodyText.match(PRICE_REGEX) || [])];
    return matches.slice(0, 5).map((p) => ({
      price: p.trim(), currency: null, name: null, brand: null, availability: null
    }));
  }

  function extractPrices() {
    let results = extractFromJSONLD();
    if (results.length === 0) results = extractFromMetaTags();
    if (results.length === 0) results = extractFromMicrodata();
    if (results.length === 0) results = extractFromSelectors();
    if (results.length === 0) results = extractFromRegex();
    return results.slice(0, 5);
  }

  // ─── 6. BREADCRUMB EXTRACTION ────────────────────────────────────────────────

  function extractBreadcrumbs() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          const nodes = item["@graph"] ? item["@graph"] : [item];
          for (const node of nodes) {
            if (node["@type"] === "BreadcrumbList" && node.itemListElement) {
              return node.itemListElement
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .map(el => el.name || el.item?.name || "")
                .filter(Boolean)
                .slice(0, 5);
            }
          }
        }
      } catch {
        // skip
      }
    }

    // Fallback: look for breadcrumb nav elements
    const breadcrumbEl = document.querySelector(
      'nav[aria-label*="breadcrumb"], [class*="breadcrumb"], [class*="Breadcrumb"]'
    );
    if (breadcrumbEl) {
      const items = breadcrumbEl.querySelectorAll("a, span, li");
      return [...items]
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0 && t.length < 50)
        .slice(0, 5);
    }

    return [];
  }

  // ─── 7. SCROLL DEPTH TRACKING ────────────────────────────────────────────────

  let maxScrollDepth = 0;
  let scrollTimer = null;

  function calculateScrollDepth() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return 0;
    return Math.round((scrollTop / docHeight) * 100);
  }

  function onScroll() {
    const depth = calculateScrollDepth();
    if (depth > maxScrollDepth) {
      maxScrollDepth = depth;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        sendData({ scrollDepth: maxScrollDepth });
      }, 2000);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  // ─── 8. SEND DATA TO BACKGROUND ──────────────────────────────────────────────

  function extractSeoText() {
    try {
      const getMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        const v = el?.getAttribute("content");
        return v ? String(v).trim() : "";
      };
      const title = String(document.title || "").trim();
      const desc =
        getMeta("description") ||
        getMeta("og:description") ||
        getMeta("twitter:description") ||
        "";
      const h1 = String(document.querySelector("h1")?.textContent || "").trim();
      const parts = [title, desc, h1].filter(Boolean);
      const txt = parts.join(" · ").replace(/\s+/g, " ").trim();
      return txt.length > 400 ? txt.slice(0, 400) : txt;
    } catch {
      return "";
    }
  }

  function extractPageHints() {
    try {
      const getMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        const v = el?.getAttribute("content");
        return v ? String(v).trim() : "";
      };
      const keywords = getMeta("keywords");
      const ogType = getMeta("og:type") || "";

      // Pull a few schema.org @type markers (very strong when present).
      const schemaTypes = [];
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        try {
          const txt = s.textContent || "";
          if (!txt) continue;
          const data = JSON.parse(txt);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            const nodes = item && item["@graph"] ? item["@graph"] : [item];
            for (const node of nodes) {
              const t = node?.["@type"];
              if (!t) continue;
              const types = Array.isArray(t) ? t : [t];
              for (const one of types) {
                const st = String(one || "").trim();
                if (!st) continue;
                if (!schemaTypes.includes(st)) schemaTypes.push(st);
                if (schemaTypes.length >= 6) break;
              }
              if (schemaTypes.length >= 6) break;
            }
            if (schemaTypes.length >= 6) break;
          }
          if (schemaTypes.length >= 6) break;
        } catch {
          /* ignore */
        }
      }

      return {
        keywords: keywords && keywords.length > 250 ? keywords.slice(0, 250) : keywords,
        ogType: ogType && ogType.length > 60 ? ogType.slice(0, 60) : ogType,
        schemaTypes,
      };
    } catch {
      return { keywords: "", ogType: "", schemaTypes: [] };
    }
  }

  function sendData(extra = {}) {
    try {
      chrome.runtime.sendMessage({ type: "CONTENT_DATA", ...extra });
    } catch {
      // Extension context invalidated — ignore
    }
  }

  // Send immediately on page load — device, time, page type, search query
  const searchQuery = extractSearchQuery();
  const immediateData = {
    deviceType,
    timeOfDay,
    visitHour,
    pageType,
  };
  if (searchQuery) immediateData.searchQuery = searchQuery;
  const seoText = extractSeoText();
  if (seoText) immediateData.seoText = seoText;
  const hints = extractPageHints();
  if (hints.keywords) immediateData.metaKeywords = hints.keywords;
  if (hints.ogType) immediateData.ogType = hints.ogType;
  if (Array.isArray(hints.schemaTypes) && hints.schemaTypes.length) immediateData.schemaTypes = hints.schemaTypes;
  sendData(immediateData);

  // Extract prices + breadcrumbs after full page load
  window.addEventListener("load", () => {
    const prices = extractPrices();
    const breadcrumbs = extractBreadcrumbs();

    const loadData = {};
    if (prices.length > 0) loadData.prices = prices;
    if (breadcrumbs.length > 0) loadData.breadcrumbs = breadcrumbs;

    const initialDepth = calculateScrollDepth();
    if (initialDepth > 0) loadData.scrollDepth = initialDepth;

    if (Object.keys(loadData).length > 0) sendData(loadData);
  });

  // Send max scroll depth on page unload
  window.addEventListener("beforeunload", () => {
    if (maxScrollDepth > 0) {
      sendData({ scrollDepth: maxScrollDepth });
    }
  });

  // Periodic scroll depth update every 30 seconds
  setInterval(() => {
    if (maxScrollDepth > 0) {
      sendData({ scrollDepth: maxScrollDepth });
    }
  }, 30000);

})();
