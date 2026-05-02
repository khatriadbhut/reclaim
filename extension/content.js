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

    // Cart / Checkout — highest intent
    if (/cart|checkout|basket|buy-now|payment|order/.test(url)) return "checkout";

    // Product page
    if (/product|item|dp\/|pdp|detail|p\/[a-z0-9]/.test(url)) return "product";

    // Search results
    if (/search|query|find|results|keyword|s=|q=|k=/.test(url)) return "search";

    // Category / Listing page
    if (/category|collection|listing|browse|shop|c\//.test(url)) return "category";

    // Article / Blog
    if (/article|blog|news|post|story|read/.test(url)) return "article";

    // Job listing
    if (/job|career|vacancy|hiring|position|role/.test(url)) return "job_listing";

    // Property listing
    if (/property|flat|apartment|villa|bhk|rent|sale/.test(url)) return "property_listing";

    // Travel booking
    if (/flight|hotel|bus|train|holiday|package|booking/.test(url)) return "travel_booking";

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

    if (price) {
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
