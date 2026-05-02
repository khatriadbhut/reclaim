// Reclaim - Content Script v2
// Production-grade data extraction using industry standards
// Price extraction: JSON-LD → Open Graph → Microdata → CSS selectors → Regex
// Captures: search queries, scroll depth, prices, product info

(function () {
  if (!window.location.href.startsWith("http")) return;

  const domain = window.location.hostname.replace("www.", "");

  // ─── 1. SEARCH QUERY CAPTURE ─────────────────────────────────────────────────

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
  };

  function extractSearchQuery() {
    const paramKey = SEARCH_PARAMS[domain];
    if (!paramKey) return null;
    const params = new URLSearchParams(window.location.search);
    const query = params.get(paramKey);
    return query ? decodeURIComponent(query).trim() : null;
  }

  // ─── 2. PRICE EXTRACTION (Production Grade) ───────────────────────────────────

  // Step 1: JSON-LD (schema.org standard — used by Google Shopping, Shopify, WooCommerce)
  function extractFromJSONLD() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const results = [];

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          // Handle @graph array (common in Shopify)
          const nodes = item["@graph"] ? item["@graph"] : [item];

          for (const node of nodes) {
            const type = node["@type"];
            if (!type) continue;

            // Product schema
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

            // BreadcrumbList — useful for category context
            if (type === "BreadcrumbList" && node.itemListElement) {
              // stored for context, not price
            }
          }
        }
      } catch {
        // Invalid JSON — skip
      }
    }
    return results;
  }

  // Step 2: Open Graph / Meta tags (Facebook, Twitter, Google standards)
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

  // Step 3: Microdata (schema.org itemprop — used by many Indian e-commerce sites)
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

  // Step 4: Site-specific CSS selectors (fallback for major Indian sites)
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

  // Step 5: Regex fallback — scan visible text for price patterns
  function extractFromRegex() {
    const PRICE_REGEX = /[₹$€£¥]\s?\d[\d,]*(\.\d{1,2})?/g;
    const bodyText = document.body.innerText.slice(0, 8000);
    const matches = [...new Set(bodyText.match(PRICE_REGEX) || [])];
    return matches.slice(0, 5).map((p) => ({
      price: p.trim(), currency: null, name: null, brand: null, availability: null
    }));
  }

  // Master price extractor — runs all methods in priority order
  function extractPrices() {
    let results = extractFromJSONLD();
    if (results.length === 0) results = extractFromMetaTags();
    if (results.length === 0) results = extractFromMicrodata();
    if (results.length === 0) results = extractFromSelectors();
    if (results.length === 0) results = extractFromRegex();
    return results.slice(0, 5);
  }

  // ─── 3. SCROLL DEPTH TRACKING ────────────────────────────────────────────────

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

  // ─── 4. SEND DATA TO BACKGROUND ──────────────────────────────────────────────

  function sendData(extra = {}) {
    try {
      chrome.runtime.sendMessage({ type: "CONTENT_DATA", ...extra });
    } catch {
      // Extension context invalidated — ignore
    }
  }

  // Send search query immediately
  const searchQuery = extractSearchQuery();
  if (searchQuery) {
    sendData({ searchQuery });
  }

  // Extract prices + send after page fully loads
  window.addEventListener("load", () => {
    const prices = extractPrices();
    if (prices.length > 0) {
      sendData({ prices });
    }

    const initialDepth = calculateScrollDepth();
    if (initialDepth > 0) {
      sendData({ scrollDepth: initialDepth });
    }
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
