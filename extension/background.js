// Reclaim - Background Service Worker v3
// Full structured extraction via /api/extract
// Stores: brand, product, intent_score, keywords, pageType, deviceType, timeOfDay, visitHour, breadcrumbs, prices, searchQueries, scrollDepth
// Syncs to backend every 5 minutes

const BACKEND_URL = "http://localhost:3000";
const EXTRACT_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

const FALLBACK_EARNINGS_RATE = {
  shopping: 0.05, finance: 0.06, health: 0.05, travel: 0.04,
  social: 0.02, news: 0.02, entertainment: 0.02, technology: 0.02,
  education: 0.01, food: 0.02, realestate: 0.08, jobs: 0.03, other: 0.005
};

// Premium brands for bonus earnings
const PREMIUM_BRANDS = [
  "apple", "bmw", "mercedes", "rolex", "louis vuitton", "gucci", "prada",
  "sony", "samsung", "nike", "adidas", "dyson", "bose", "bang olufsen",
  "tata", "mahindra", "titan", "tanishq"
];

async function getUserId() {
  const result = await chrome.storage.local.get("userId");
  if (result.userId) return result.userId;
  const id = "usr_" + Math.random().toString(36).slice(2, 10);
  await chrome.storage.local.set({ userId: id });
  return id;
}

function getDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace("www.", "");
  } catch {
    return null;
  }
}

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

// Value-based earnings calculation
function calculateEarnings(durationSeconds, extracted, session) {
  const baseRate = extracted.earnings_rate || FALLBACK_EARNINGS_RATE[extracted.category || "other"] || 0.005;
  let rate = baseRate;

  // Intent score bonus
  const intentScore = extracted.intent_score || 3;
  if (intentScore >= 7) rate += intentScore * 0.001;

  // Brand extracted bonus
  if (extracted.brand) {
    rate += 0.002;
    // Premium brand bonus
    if (PREMIUM_BRANDS.includes((extracted.brand || "").toLowerCase())) {
      rate += 0.003;
    }
  }

  // Product type extracted bonus
  if (extracted.product_type) rate += 0.001;

  // Page type bonuses
  const pageType = session.pageType || "other";
  if (pageType === "checkout") rate += 0.01;
  else if (pageType === "product") rate += 0.005;
  else if (pageType === "search") rate += 0.002;

  // Cross-site bonus — same product seen on 3+ domains today
  // (checked in saveSession after storage read)

  return (rate / 3600) * durationSeconds;
}

// Extract structured data from domain + title via backend
async function extractData(domain, title) {
  const cacheKey = `ext_${domain}_${(title || "").slice(0, 50)}`;
  const cached = await chrome.storage.local.get(cacheKey);

  if (cached[cacheKey] && cached[cacheKey].expiresAt > Date.now()) {
    return cached[cacheKey].data;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, title })
    });
    const data = await res.json();

    await chrome.storage.local.set({
      [cacheKey]: { data, expiresAt: Date.now() + EXTRACT_CACHE_TTL }
    });

    return data;
  } catch {
    return {
      category: "other", brand: null, product: null,
      intent_score: 3, keywords: [], earnings_rate: FALLBACK_EARNINGS_RATE.other
    };
  }
}

async function saveSession(url, title, durationSeconds, contentData = {}) {
  if (!url || durationSeconds < 2) return;
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return;

  const domain = getDomain(url);
  if (!domain) return;

  const extracted = await extractData(domain, title);
  const category = extracted.category || "other";
  const todayKey = getTodayKey();

  const result = await chrome.storage.local.get(["sessions", "totalEarnings"]);
  const sessions = result.sessions || {};
  const totalEarnings = result.totalEarnings || 0;

  if (!sessions[todayKey]) sessions[todayKey] = {};

  // Initialize session object if new domain
  if (!sessions[todayKey][domain]) {
    sessions[todayKey][domain] = {
      domain,
      category,
      totalSeconds: 0,
      visits: 0,
      earned: 0,
      // Extracted signals
      brand: extracted.brand || null,
      product: extracted.product || null,
      product_type: extracted.product_type || null,
      price_range: extracted.price_range || null,
      intent_score: extracted.intent_score || 3,
      keywords: [],
      search_type: extracted.search_type || null,
      location: extracted.location || null,
      job_title: extracted.job_title || null,
      travel_route: extracted.travel_route || null,
      property_type: extracted.property_type || null,
      // Content script signals
      searchQueries: [],
      maxScrollDepth: 0,
      pricesFound: [],
      breadcrumbs: [],
      pageTypes: [],
      deviceType: null,
      timeOfDay: null,
      visitHours: [],
    };
  }

  const session = sessions[todayKey][domain];

  // Normalize arrays/types — handles legacy data from older versions
  session.keywords = Array.isArray(session.keywords) ? session.keywords : [];
  session.searchQueries = Array.isArray(session.searchQueries) ? session.searchQueries : [];
  session.pricesFound = Array.isArray(session.pricesFound) ? session.pricesFound : [];
  session.breadcrumbs = Array.isArray(session.breadcrumbs) ? session.breadcrumbs : [];
  session.pageTypes = Array.isArray(session.pageTypes) ? session.pageTypes : [];
  session.visitHours = Array.isArray(session.visitHours) ? session.visitHours : [];
  session.maxScrollDepth = typeof session.maxScrollDepth === "number" ? session.maxScrollDepth : 0;
  session.intent_score = typeof session.intent_score === "number" ? session.intent_score : 3;

  // Update time + visits
  session.totalSeconds += durationSeconds;
  session.visits += 1;

  // Update extracted signals — keep highest intent score
  if (extracted.brand) session.brand = extracted.brand;
  if (extracted.product) session.product = extracted.product;
  if (extracted.product_type) session.product_type = extracted.product_type;
  if (extracted.price_range) session.price_range = extracted.price_range;
  if (typeof extracted.intent_score === "number") {
    session.intent_score = Math.max(session.intent_score, extracted.intent_score);
  }
  if (Array.isArray(extracted.keywords) && extracted.keywords.length) {
    session.keywords = [...new Set([...session.keywords, ...extracted.keywords])].slice(0, 20);
  }

  // Merge content script data
  if (contentData.searchQuery && !session.searchQueries.includes(contentData.searchQuery)) {
    session.searchQueries.push(contentData.searchQuery);
  }
  if (typeof contentData.scrollDepth === "number") {
    session.maxScrollDepth = Math.max(session.maxScrollDepth, contentData.scrollDepth);
  }
  if (Array.isArray(contentData.prices) && contentData.prices.length) {
    session.pricesFound = [...session.pricesFound, ...contentData.prices].slice(0, 10);
  }
  if (Array.isArray(contentData.breadcrumbs) && contentData.breadcrumbs.length) {
    // Keep most specific breadcrumb (longest path)
    if (contentData.breadcrumbs.length > session.breadcrumbs.length) {
      session.breadcrumbs = contentData.breadcrumbs;
    }
  }
  if (contentData.pageType && !session.pageTypes.includes(contentData.pageType)) {
    session.pageTypes.push(contentData.pageType);
    // Boost intent score based on page type
    if (contentData.pageType === "checkout") session.intent_score = Math.max(session.intent_score, 9);
    else if (contentData.pageType === "product") session.intent_score = Math.max(session.intent_score, 6);
  }
  if (contentData.deviceType) session.deviceType = contentData.deviceType;
  if (contentData.timeOfDay) session.timeOfDay = contentData.timeOfDay;
  if (typeof contentData.visitHour === "number" && !session.visitHours.includes(contentData.visitHour)) {
    session.visitHours.push(contentData.visitHour);
  }

  // Cross-site bonus check — same brand seen on 3+ domains today
  let crossSiteBonus = 0;
  if (session.brand) {
    const sameBrandDomains = Object.values(sessions[todayKey])
      .filter(s => s.brand && s.brand.toLowerCase() === session.brand.toLowerCase() && s.domain !== domain);
    if (sameBrandDomains.length >= 2) crossSiteBonus = 0.005; // 3+ sites = bonus
  }

  // Calculate value-based earnings
  const earned = calculateEarnings(durationSeconds, extracted, session) + (crossSiteBonus / 3600) * durationSeconds;
  session.earned += earned;

  await chrome.storage.local.set({
    sessions,
    totalEarnings: totalEarnings + earned,
    lastUpdated: Date.now()
  });
}

// Sync to backend every 5 minutes
async function syncToBackend() {
  try {
    const userId = await getUserId();
    const result = await chrome.storage.local.get([
      "sessions", "totalEarnings", "userLocation", "userProfile"
    ]);

    await fetch(`${BACKEND_URL}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        sessions: result.sessions || {},
        totalEarnings: result.totalEarnings || 0,
        profile: {
          ...(result.userProfile || {}),
          location: result.userLocation || {}
        }
      })
    });
    console.log("Reclaim: synced to backend");
  } catch (err) {
    console.error("Reclaim: sync failed", err.message);
  }
}

// Active tab tracking
let activeTabId = null;
let activeTabUrl = null;
let activeTabTitle = null;
let activeTabStart = null;
let pendingContentData = {};

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (activeTabUrl && activeTabStart) {
    const domain = getDomain(activeTabUrl);
    await saveSession(
      activeTabUrl, activeTabTitle,
      (Date.now() - activeTabStart) / 1000,
      pendingContentData[domain] || {}
    );
    if (domain) delete pendingContentData[domain];
  }
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    activeTabId = activeInfo.tabId;
    activeTabUrl = tab.url;
    activeTabTitle = tab.title;
    activeTabStart = Date.now();
  } catch {
    activeTabId = null; activeTabUrl = null;
    activeTabTitle = null; activeTabStart = null;
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== activeTabId || changeInfo.status !== "complete") return;
  if (activeTabUrl && activeTabStart) {
    const domain = getDomain(activeTabUrl);
    await saveSession(
      activeTabUrl, activeTabTitle,
      (Date.now() - activeTabStart) / 1000,
      pendingContentData[domain] || {}
    );
    if (domain) delete pendingContentData[domain];
  }
  activeTabUrl = tab.url;
  activeTabTitle = tab.title;
  activeTabStart = Date.now();
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE && activeTabUrl && activeTabStart) {
    const domain = getDomain(activeTabUrl);
    await saveSession(
      activeTabUrl, activeTabTitle,
      (Date.now() - activeTabStart) / 1000,
      pendingContentData[domain] || {}
    );
    activeTabStart = Date.now();
  }
});

chrome.alarms.create("periodicSave", { periodInMinutes: 0.5 });
chrome.alarms.create("syncToBackend", { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodicSave" && activeTabUrl && activeTabStart) {
    const domain = getDomain(activeTabUrl);
    await saveSession(
      activeTabUrl, activeTabTitle,
      (Date.now() - activeTabStart) / 1000,
      pendingContentData[domain] || {}
    );
    activeTabStart = Date.now();
  }
  if (alarm.name === "syncToBackend") {
    await syncToBackend();
  }
});

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "CONTENT_DATA") return;

  const domain = getDomain(sender.tab?.url || "");
  if (!domain) return;

  if (!pendingContentData[domain]) pendingContentData[domain] = {};
  const pending = pendingContentData[domain];

  // Search query
  if (message.searchQuery) pending.searchQuery = message.searchQuery;

  // Scroll depth — keep maximum
  if (typeof message.scrollDepth === "number") {
    pending.scrollDepth = Math.max(pending.scrollDepth || 0, message.scrollDepth);
  }

  // Prices — deduplicate
  if (Array.isArray(message.prices) && message.prices.length) {
    pending.prices = [...new Set([...(pending.prices || []), ...message.prices])];
  }

  // Breadcrumbs — keep longest
  if (Array.isArray(message.breadcrumbs) && message.breadcrumbs.length) {
    if (!pending.breadcrumbs || message.breadcrumbs.length > pending.breadcrumbs.length) {
      pending.breadcrumbs = message.breadcrumbs;
    }
  }

  // Page type
  if (message.pageType) pending.pageType = message.pageType;

  // Device type
  if (message.deviceType) pending.deviceType = message.deviceType;

  // Time of day
  if (message.timeOfDay) pending.timeOfDay = message.timeOfDay;

  // Visit hour
  if (typeof message.visitHour === "number") pending.visitHour = message.visitHour;
});

console.log("Reclaim background worker v3 started");
