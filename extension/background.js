// Reclaim - Background Service Worker
// Uses Gemini AI via backend for smart categorization

const BACKEND_URL = "http://localhost:3000";

const EARNINGS_RATE = {
  shopping:      0.08,
  finance:       0.10,
  health:        0.07,
  travel:        0.06,
  social:        0.04,
  news:          0.03,
  entertainment: 0.03,
  education:     0.02,
  technology:    0.03,
  other:         0.01
};

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

async function categorize(domain, title) {
  // Check local cache first
  const cacheKey = `cat_${domain}`;
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) return cached[cacheKey];

  try {
    const res = await fetch(`${BACKEND_URL}/api/categorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, title })
    });
    const data = await res.json();
    const category = data.category || "other";
    // Cache locally for 24 hours
    await chrome.storage.local.set({ [cacheKey]: category });
    return category;
  } catch {
    return "other";
  }
}

async function saveSession(url, title, durationSeconds) {
  if (!url || durationSeconds < 2) return;
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return;

  const domain = getDomain(url);
  if (!domain) return;

  const category = await categorize(domain, title);
  const todayKey = getTodayKey();
  const earned = (EARNINGS_RATE[category] / 3600) * durationSeconds;

  const result = await chrome.storage.local.get(["sessions", "totalEarnings"]);
  const sessions = result.sessions || {};
  const totalEarnings = result.totalEarnings || 0;

  if (!sessions[todayKey]) sessions[todayKey] = {};
  if (!sessions[todayKey][domain]) {
    sessions[todayKey][domain] = { domain, category, totalSeconds: 0, visits: 0, earned: 0 };
  }

  sessions[todayKey][domain].totalSeconds += durationSeconds;
  sessions[todayKey][domain].visits += 1;
  sessions[todayKey][domain].earned += earned;

  await chrome.storage.local.set({ sessions, totalEarnings: totalEarnings + earned, lastUpdated: Date.now() });
}

let activeTabId = null;
let activeTabUrl = null;
let activeTabTitle = null;
let activeTabStart = null;

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (activeTabUrl && activeTabStart) {
    await saveSession(activeTabUrl, activeTabTitle, (Date.now() - activeTabStart) / 1000);
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
    await saveSession(activeTabUrl, activeTabTitle, (Date.now() - activeTabStart) / 1000);
  }
  activeTabUrl = tab.url;
  activeTabTitle = tab.title;
  activeTabStart = Date.now();
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE && activeTabUrl && activeTabStart) {
    await saveSession(activeTabUrl, activeTabTitle, (Date.now() - activeTabStart) / 1000);
    activeTabStart = Date.now();
  }
});

chrome.alarms.create("periodicSave", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodicSave" && activeTabUrl && activeTabStart) {
    await saveSession(activeTabUrl, activeTabTitle, (Date.now() - activeTabStart) / 1000);
    activeTabStart = Date.now();
  }
});

console.log("Reclaim background worker started");
