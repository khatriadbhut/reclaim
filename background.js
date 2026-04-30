// Reclaim - Background Service Worker
// Tracks domains visited, time spent, and categorizes browsing data

const CATEGORIES = {
  shopping: [
    "amazon", "ebay", "flipkart", "myntra", "shopify", "etsy", "walmart",
    "target", "bestbuy", "aliexpress", "meesho", "ajio", "nykaa", "snapdeal"
  ],
  social: [
    "facebook", "instagram", "twitter", "x.com", "linkedin", "reddit",
    "pinterest", "snapchat", "tiktok", "threads", "discord", "telegram"
  ],
  news: [
    "nytimes", "bbc", "cnn", "theguardian", "reuters", "bloomberg",
    "hindustantimes", "thehindu", "ndtv", "timesofindia", "indiatoday",
    "washingtonpost", "forbes", "techcrunch", "theverge", "wired"
  ],
  finance: [
    "zerodha", "groww", "upstox", "robinhood", "coinbase", "binance",
    "moneycontrol", "economictimes", "investing", "tradingview", "paypal",
    "stripe", "razorpay", "paytm", "phonepe", "bankofamerica", "chase"
  ],
  entertainment: [
    "youtube", "netflix", "spotify", "primevideo", "hotstar", "jiocinema",
    "hulu", "disneyplus", "twitch", "soundcloud", "apple", "zee5"
  ],
  education: [
    "coursera", "udemy", "khan", "edx", "nptel", "unacademy", "byju",
    "medium", "stackoverflow", "github", "leetcode", "hackerrank", "wikipedia"
  ],
  health: [
    "healthline", "webmd", "practo", "1mg", "pharmeasy", "mayoclinic",
    "nih", "who", "fitbit", "strava", "myfitnesspal"
  ],
  travel: [
    "makemytrip", "goibibo", "airbnb", "booking", "expedia", "tripadvisor",
    "skyscanner", "kayak", "cleartrip", "irctc", "ola", "uber", "rapido"
  ],
  technology: [
    "google", "microsoft", "apple", "cloudflare", "vercel", "netlify",
    "digitalocean", "aws", "heroku", "notion", "figma", "canva", "slack"
  ]
};

// Earnings rate per category ($ per hour of browsing - realistic estimates)
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

function categorize(domain) {
  if (!domain) return "other";
  const lower = domain.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some(k => lower.includes(k))) return category;
  }
  return "other";
}

function getTodayKey() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

// Track active tab and start time
let activeTabId = null;
let activeTabUrl = null;
let activeTabStart = null;

async function saveSession(url, durationSeconds) {
  if (!url || durationSeconds < 2) return;

  const domain = getDomain(url);
  if (!domain) return;

  // Skip chrome internal pages
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return;

  const category = categorize(domain);
  const todayKey = getTodayKey();
  const earningsPerSecond = EARNINGS_RATE[category] / 3600;
  const earned = earningsPerSecond * durationSeconds;

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
      earned: 0
    };
  }

  sessions[todayKey][domain].totalSeconds += durationSeconds;
  sessions[todayKey][domain].visits += 1;
  sessions[todayKey][domain].earned += earned;

  await chrome.storage.local.set({
    sessions,
    totalEarnings: totalEarnings + earned,
    lastUpdated: Date.now()
  });
}

// Tab activated
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // Save previous session
  if (activeTabUrl && activeTabStart) {
    const duration = (Date.now() - activeTabStart) / 1000;
    await saveSession(activeTabUrl, duration);
  }

  // Start new session
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    activeTabId = activeInfo.tabId;
    activeTabUrl = tab.url;
    activeTabStart = Date.now();
  } catch {
    activeTabId = null;
    activeTabUrl = null;
    activeTabStart = null;
  }
});

// Tab updated (navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== activeTabId) return;
  if (changeInfo.status !== "complete") return;

  // Save previous session
  if (activeTabUrl && activeTabStart) {
    const duration = (Date.now() - activeTabStart) / 1000;
    await saveSession(activeTabUrl, duration);
  }

  activeTabUrl = tab.url;
  activeTabStart = Date.now();
});

// Window focus lost (user switched apps)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Lost focus - save current session
    if (activeTabUrl && activeTabStart) {
      const duration = (Date.now() - activeTabStart) / 1000;
      await saveSession(activeTabUrl, duration);
      activeTabStart = Date.now(); // Reset timer
    }
  }
});

// Periodic save every 30 seconds to avoid data loss
chrome.alarms.create("periodicSave", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodicSave" && activeTabUrl && activeTabStart) {
    const duration = (Date.now() - activeTabStart) / 1000;
    await saveSession(activeTabUrl, duration);
    activeTabStart = Date.now(); // Reset to avoid double counting
  }
});

console.log("Reclaim background worker started");
