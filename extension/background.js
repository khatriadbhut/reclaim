// Reclaim - Background Service Worker v2
// Uses /api/extract for full structured data extraction
// Syncs to backend every 5 minutes
// Location is handled by onboarding page

const BACKEND_URL = "http://localhost:3000";

// Fallback earnings rates (backend returns the real rate via /api/extract)
const FALLBACK_EARNINGS_RATE = {
  shopping: 0.05, finance: 0.06, health: 0.05, travel: 0.04,
  social: 0.02, news: 0.02, entertainment: 0.02, technology: 0.02,
  education: 0.01, food: 0.02, realestate: 0.08, jobs: 0.03, other: 0.005
};

// Generate or retrieve persistent user ID
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

// Extract structured data from domain + title via backend
async function extractData(domain, title) {
  const cacheKey = `ext_${domain}_${(title || "").slice(0, 50)}`;
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) return cached[cacheKey];

  try {
    const res = await fetch(`${BACKEND_URL}/api/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, title })
    });
    const data = await res.json();
    await chrome.storage.local.set({ [cacheKey]: data });
    setTimeout(() => chrome.storage.local.remove(cacheKey), 3600000);
    return data;
  } catch {
    return {
      category: "other",
      brand: null, product: null, intent_score: 3,
      keywords: [], earnings_rate: FALLBACK_EARNINGS_RATE.other
    };
  }
}

async function saveSession(url, title, durationSeconds, extraData = {}) {
  if (!url || durationSeconds < 2) return;
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return;

  const domain = getDomain(url);
  if (!domain) return;

  const extracted = await extractData(domain, title);
  const category = extracted.category || "other";
  const earningsRate = extracted.earnings_rate || FALLBACK_EARNINGS_RATE[category] || 0.005;
  const earned = (earningsRate / 3600) * durationSeconds;

  const todayKey = getTodayKey();
  const result = await chrome.storage.local.get(["sessions", "totalEarnings"]);
  const sessions = result.sessions || {};
  const totalEarnings = result.totalEarnings || 0;

  if (!sessions[todayKey]) sessions[todayKey] = {};

  if (!sessions[todayKey][domain]) {
    sessions[todayKey][domain] = {
      domain,
      category,
      totalSeconds: 0,
      visits: 0,
      earned: 0,
      brand: extracted.brand || null,
      product: extracted.product || null,
      intent_score: extracted.intent_score || 3,
      keywords: extracted.keywords || [],
      price_range: extracted.price_range || null,
      search_type: extracted.search_type || null,
      searchQueries: [],
      maxScrollDepth: 0,
      pricesFound: []
    };
  }

  const session = sessions[todayKey][domain];
  session.totalSeconds += durationSeconds;
  session.visits += 1;
  session.earned += earned;

  if (extracted.brand) session.brand = extracted.brand;
  if (extracted.intent_score) session.intent_score = Math.max(session.intent_score, extracted.intent_score);
  if (extracted.keywords?.length) session.keywords = [...new Set([...session.keywords, ...extracted.keywords])];

  if (extraData.searchQuery && !session.searchQueries.includes(extraData.searchQuery)) {
    session.searchQueries.push(extraData.searchQuery);
  }
  if (extraData.scrollDepth) {
    session.maxScrollDepth = Math.max(session.maxScrollDepth, extraData.scrollDepth);
  }
  if (extraData.prices?.length) {
    session.pricesFound = [...new Set([...session.pricesFound, ...extraData.prices])];
  }

  await chrome.storage.local.set({
    sessions,
    totalEarnings: totalEarnings + earned,
    lastUpdated: Date.now()
  });
}

// Sync all data to backend
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
    activeTabId = null; activeTabUrl = null; activeTabTitle = null; activeTabStart = null;
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
  if (message.type === "CONTENT_DATA") {
    const domain = getDomain(sender.tab?.url || "");
    if (!domain) return;
    if (!pendingContentData[domain]) pendingContentData[domain] = {};

    if (message.searchQuery) pendingContentData[domain].searchQuery = message.searchQuery;
    if (message.scrollDepth) {
      pendingContentData[domain].scrollDepth = Math.max(
        pendingContentData[domain].scrollDepth || 0,
        message.scrollDepth
      );
    }
    if (message.prices?.length) {
      pendingContentData[domain].prices = [
        ...new Set([...(pendingContentData[domain].prices || []), ...message.prices])
      ];
    }
  }
});

console.log("Reclaim background worker v2 started");
