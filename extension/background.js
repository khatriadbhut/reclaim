// Reclaim - Background Service Worker v4.2
// Fix 1: refreshLocationSilently is fire-and-forget (no await) — unblocks sendResponse
// Fix 2: tab close/reopen block removed — onboarding page handles its own navigation
// Auth: chrome.identity.getAuthToken + /api/auth/google
// Full structured extraction via /api/extract
// Syncs to backend every 5 minutes

const BACKEND_URL = "http://localhost:3000";
const EXTRACT_CACHE_TTL = 1000 * 60 * 60 * 24;

const FALLBACK_EARNINGS_RATE = {
  shopping: 0.05, finance: 0.06, health: 0.05, travel: 0.04,
  social: 0.02, news: 0.02, entertainment: 0.02, technology: 0.02,
  education: 0.01, food: 0.02, realestate: 0.08, jobs: 0.03, other: 0.005
};

const PREMIUM_BRANDS = [
  "apple", "bmw", "mercedes", "rolex", "louis vuitton", "gucci", "prada",
  "sony", "samsung", "nike", "adidas", "dyson", "bose", "bang olufsen",
  "tata", "mahindra", "titan", "tanishq"
];

const DASHBOARD_STORAGE_KEYS = [
  "isLoggedIn",
  "sessions",
  "totalEarnings",
  "userId",
  "userName",
  "userEmail",
  "userPicture",
];

// Chrome's `externally_connectable` in manifest.json already enforces which origins
// can send external messages, so a secondary URL check here is redundant.
// Worse, in MV3 service worker wakeup scenarios sender.url can be unpopulated,
// causing the old check to silently reject valid messages from signed-in users.

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "RECLAIM_GET_STORAGE") return false;
  chrome.storage.local
    .get(DASHBOARD_STORAGE_KEYS)
    .then((result) => sendResponse(result || {}))
    .catch(() => sendResponse({}));
  return true;
});

chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name !== "reclaim-dashboard") {
    port.disconnect();
    return;
  }
  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "RECLAIM_GET_STORAGE") return;
    chrome.storage.local.get(DASHBOARD_STORAGE_KEYS).then((result) => {
      try {
        port.postMessage({ type: "RECLAIM_STORAGE", payload: result || {} });
      } catch {
        /* port may be gone */
      }
    });
  });
});

/** Popup / onboarding open the Vite user dashboard here (popup only sends OPEN_USER_DASHBOARD). */
const DEFAULT_USER_DASHBOARD_URL = "http://localhost:5173/user";

async function resolveUserDashboardHref() {
  const { reclaimDashboardUserUrl } = await chrome.storage.local.get(["reclaimDashboardUserUrl"]);
  if (typeof reclaimDashboardUserUrl === "string" && reclaimDashboardUserUrl.trim()) {
    try {
      return new URL(reclaimDashboardUserUrl.trim()).href;
    } catch {
      /* fall through */
    }
  }
  try {
    const tabs = await chrome.tabs.query({
      url: ["http://localhost:5173/*", "http://127.0.0.1:5173/*"],
    });
    for (const t of tabs) {
      const u = new URL(t.url || "");
      if (u.port === "5173" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
        return `${u.origin}/user`;
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_USER_DASHBOARD_URL;
}

async function openUserDashboardInBrowser() {
  const href = await resolveUserDashboardHref();
  const tabs = await chrome.tabs.query({});
  const match = tabs.find((t) => {
    try {
      const u = new URL(t.url || "");
      return (
        (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
        u.port === "5173" &&
        u.pathname === "/user"
      );
    } catch {
      return false;
    }
  });
  if (match?.id != null) {
    await chrome.tabs.update(match.id, { active: true, url: href });
    if (match.windowId != null) {
      try {
        await chrome.windows.update(match.windowId, { focused: true });
      } catch {
        /* ignore */
      }
    }
    return;
  }
  await chrome.tabs.create({ url: href, active: true });
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await chrome.storage.local.clear();
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
  }
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { res, json, text };
  } finally {
    clearTimeout(t);
  }
}

async function signInWithGoogle(fromOnboardingPage = false, forceAccountPicker = false) {
  return new Promise((resolve, reject) => {
    const finish = async (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError?.message || "auth failed");
        return;
      }
      try {
        const { res, json } = await fetchJsonWithTimeout(`${BACKEND_URL}/api/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: token })
        }, 15000);
        if (!res.ok) throw new Error(json?.error || "auth failed");
        const user = json;

        await chrome.storage.local.set({
          userId: user.userId,
          userName: user.name,
          userEmail: user.email,
          userPicture: user.picture,
          accessToken: token,
          isLoggedIn: true,
          // Backend already has demographics — don’t block the popup until they re-click “Done” in onboarding.
          ...(user.hasDemographics ? { onboardingComplete: true } : {})
        });

        // Fire-and-forget — do NOT await, so sendResponse fires immediately
        refreshLocationSilently();

        // Popup sign-in: open onboarding in a new tab (after resolve so sendResponse wins the race).
        // Onboarding page sign-in: do not create a tab — user is already in the flow (was spawning duplicates).
        if (!fromOnboardingPage) {
          setTimeout(() => {
            const onboardingBase = chrome.runtime.getURL("onboarding/onboarding.html");
            if (user.isNewUser || !user.hasDemographics) {
              chrome.tabs.create({ url: onboardingBase });
            } else {
              chrome.tabs.create({ url: onboardingBase + "?returning=true" });
            }
          }, 0);
        }

        resolve(user);
      } catch (err) {
        if (err?.name === "AbortError") {
          reject("Sign-in timed out (backend not responding). Is the server running on localhost:3000?");
          return;
        }
        reject(err.message || "auth failed");
      }
    };

    // Fast path (default): don't revoke token; just do interactive sign-in.
    if (!forceAccountPicker) {
      chrome.identity.getAuthToken({ interactive: true }, finish);
      return;
    }

    // Slow path (explicit switch account): clear + revoke so Chrome shows picker reliably.
    chrome.identity.getAuthToken({ interactive: false }, async (existingToken) => {
      const doInteractive = () => chrome.identity.getAuthToken({ interactive: true }, finish);
      if (!existingToken) {
        doInteractive();
        return;
      }
      chrome.identity.removeCachedAuthToken({ token: existingToken }, () => {
        fetch(`https://accounts.google.com/o/oauth2/revoke?token=${existingToken}`)
          .catch(() => { /* ignore */ })
          .finally(doInteractive);
      });
    });
  });
}

async function signOutGoogle() {
  try {
    const result = await chrome.storage.local.get("accessToken");
    if (result.accessToken) {
      await new Promise(resolve => {
        chrome.identity.removeCachedAuthToken({ token: result.accessToken }, resolve);
      });
    }
  } catch { }

  await chrome.storage.local.remove([
    "userId", "userName", "userEmail", "userPicture",
    "accessToken", "isLoggedIn",
    "cachedInsight", "insightTimestamp"
  ]);
  // Keep onboardingComplete so logged-out users can sign in from the popup without redoing full setup.
}

async function refreshLocationSilently() {
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (!res.ok) return;
    const data = await res.json();
    await chrome.storage.local.set({
      userLocation: {
        city: data.city || "Unknown",
        region: data.region || "",
        country: data.country_name || "",
        source: "ip"
      }
    });
  } catch { }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function getUserId() {
  const result = await chrome.storage.local.get("userId");
  if (result.userId) return result.userId;
  const id = "anon_" + Math.random().toString(36).slice(2, 10);
  await chrome.storage.local.set({ userId: id });
  return id;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return null; }
}

function getTodayKey() { return new Date().toISOString().split("T")[0]; }

function calculateEarnings(durationSeconds, extracted, session) {
  const baseRate = extracted.earnings_rate || FALLBACK_EARNINGS_RATE[extracted.category || "other"] || 0.005;
  let rate = baseRate;
  const intentScore = extracted.intent_score || 3;
  if (intentScore >= 7) rate += intentScore * 0.001;
  if (extracted.brand) {
    rate += 0.002;
    if (PREMIUM_BRANDS.includes((extracted.brand || "").toLowerCase())) rate += 0.003;
  }
  if (extracted.product_type) rate += 0.001;
  const pageType = session.pageType || "other";
  if (pageType === "checkout") rate += 0.01;
  else if (pageType === "product") rate += 0.005;
  else if (pageType === "search") rate += 0.002;
  return (rate / 3600) * durationSeconds;
}

// ─── EXTRACT ──────────────────────────────────────────────────────────────────

async function extractData(domain, title) {
  const cacheKey = `ext_${domain}_${(title || "").slice(0, 50)}`;
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey] && cached[cacheKey].expiresAt > Date.now()) return cached[cacheKey].data;
  try {
    const res = await fetch(`${BACKEND_URL}/api/extract`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, title })
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    await chrome.storage.local.set({ [cacheKey]: { data, expiresAt: Date.now() + EXTRACT_CACHE_TTL } });
    return data;
  } catch {
    return { category: "other", intent_score: 3, earnings_rate: FALLBACK_EARNINGS_RATE["other"] };
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
  if (!sessions[todayKey][domain]) {
    sessions[todayKey][domain] = {
      domain, category, totalSeconds: 0, visits: 0, earned: 0,
      brand: extracted.brand || null, product: extracted.product || null,
      product_type: extracted.product_type || null, price_range: extracted.price_range || null,
      intent_score: extracted.intent_score || 3, keywords: [],
      search_type: extracted.search_type || null, location: extracted.location || null,
      job_title: extracted.job_title || null, travel_route: extracted.travel_route || null,
      property_type: extracted.property_type || null,
      searchQueries: [], maxScrollDepth: 0, pricesFound: [],
      breadcrumbs: [], pageTypes: [], deviceType: null, timeOfDay: null, visitHours: [],
    };
  }

  const session = sessions[todayKey][domain];
  session.keywords = Array.isArray(session.keywords) ? session.keywords : [];
  session.searchQueries = Array.isArray(session.searchQueries) ? session.searchQueries : [];
  session.pricesFound = Array.isArray(session.pricesFound) ? session.pricesFound : [];
  session.breadcrumbs = Array.isArray(session.breadcrumbs) ? session.breadcrumbs : [];
  session.pageTypes = Array.isArray(session.pageTypes) ? session.pageTypes : [];
  session.visitHours = Array.isArray(session.visitHours) ? session.visitHours : [];
  session.maxScrollDepth = typeof session.maxScrollDepth === "number" ? session.maxScrollDepth : 0;
  session.intent_score = typeof session.intent_score === "number" ? session.intent_score : 3;

  session.totalSeconds += durationSeconds;
  session.visits += 1;
  if (extracted.brand) session.brand = extracted.brand;
  if (extracted.product) session.product = extracted.product;
  if (extracted.product_type) session.product_type = extracted.product_type;
  if (extracted.price_range) session.price_range = extracted.price_range;
  if (typeof extracted.intent_score === "number") session.intent_score = Math.max(session.intent_score, extracted.intent_score);
  if (Array.isArray(extracted.keywords) && extracted.keywords.length) {
    session.keywords = [...new Set([...session.keywords, ...extracted.keywords])].slice(0, 20);
  }
  if (contentData.searchQuery && !session.searchQueries.includes(contentData.searchQuery)) session.searchQueries.push(contentData.searchQuery);
  if (typeof contentData.scrollDepth === "number") session.maxScrollDepth = Math.max(session.maxScrollDepth, contentData.scrollDepth);
  if (Array.isArray(contentData.prices) && contentData.prices.length) session.pricesFound = [...session.pricesFound, ...contentData.prices].slice(0, 10);
  if (Array.isArray(contentData.breadcrumbs) && contentData.breadcrumbs.length) {
    if (contentData.breadcrumbs.length > session.breadcrumbs.length) session.breadcrumbs = contentData.breadcrumbs;
  }
  if (contentData.pageType && !session.pageTypes.includes(contentData.pageType)) {
    session.pageTypes.push(contentData.pageType);
    if (contentData.pageType === "checkout") session.intent_score = Math.max(session.intent_score, 9);
    else if (contentData.pageType === "product") session.intent_score = Math.max(session.intent_score, 6);
  }
  if (contentData.deviceType) session.deviceType = contentData.deviceType;
  if (contentData.timeOfDay) session.timeOfDay = contentData.timeOfDay;
  if (typeof contentData.visitHour === "number" && !session.visitHours.includes(contentData.visitHour)) session.visitHours.push(contentData.visitHour);

  let crossSiteBonus = 0;
  if (session.brand) {
    const sameBrandDomains = Object.values(sessions[todayKey]).filter(s => s.brand && s.brand.toLowerCase() === session.brand.toLowerCase() && s.domain !== domain);
    if (sameBrandDomains.length >= 2) crossSiteBonus = 0.005;
  }

  const earned = calculateEarnings(durationSeconds, extracted, session) + (crossSiteBonus / 3600) * durationSeconds;
  session.earned += earned;
  await chrome.storage.local.set({ sessions, totalEarnings: totalEarnings + earned, lastUpdated: Date.now() });
}

// ─── SYNC ─────────────────────────────────────────────────────────────────────

async function syncToBackend() {
  try {
    const userId = await getUserId();
    const result = await chrome.storage.local.get(["sessions", "totalEarnings", "userLocation", "userProfile"]);
    await fetch(`${BACKEND_URL}/api/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId, sessions: result.sessions || {}, totalEarnings: result.totalEarnings || 0,
        profile: { ...(result.userProfile || {}), location: result.userLocation || {} }
      })
    });
  } catch (err) { console.error("Reclaim: sync failed", err.message); }
}

// ─── TAB TRACKING ─────────────────────────────────────────────────────────────

let activeTabId = null, activeTabUrl = null, activeTabTitle = null, activeTabStart = null;
let pendingContentData = {};

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (activeTabUrl && activeTabStart) {
    const domain = getDomain(activeTabUrl);
    await saveSession(activeTabUrl, activeTabTitle, (Date.now() - activeTabStart) / 1000, pendingContentData[domain] || {});
    if (domain) delete pendingContentData[domain];
  }
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    activeTabId = activeInfo.tabId; activeTabUrl = tab.url; activeTabTitle = tab.title; activeTabStart = Date.now();
  } catch { activeTabId = null; activeTabUrl = null; activeTabTitle = null; activeTabStart = null; }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== activeTabId || changeInfo.status !== "complete") return;
  if (activeTabUrl && activeTabStart) {
    const domain = getDomain(activeTabUrl);
    await saveSession(activeTabUrl, activeTabTitle, (Date.now() - activeTabStart) / 1000, pendingContentData[domain] || {});
    if (domain) delete pendingContentData[domain];
  }
  activeTabUrl = tab.url; activeTabTitle = tab.title; activeTabStart = Date.now();
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE && activeTabUrl && activeTabStart) {
    const domain = getDomain(activeTabUrl);
    await saveSession(activeTabUrl, activeTabTitle, (Date.now() - activeTabStart) / 1000, pendingContentData[domain] || {});
    activeTabStart = Date.now();
  }
});

// ─── ALARMS ───────────────────────────────────────────────────────────────────

chrome.alarms.create("periodicSave", { periodInMinutes: 0.5 });
chrome.alarms.create("syncToBackend", { periodInMinutes: 5 });
chrome.alarms.create("refreshLocation", { periodInMinutes: 1440 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodicSave" && activeTabUrl && activeTabStart) {
    const domain = getDomain(activeTabUrl);
    await saveSession(activeTabUrl, activeTabTitle, (Date.now() - activeTabStart) / 1000, pendingContentData[domain] || {});
    activeTabStart = Date.now();
  }
  if (alarm.name === "syncToBackend") await syncToBackend();
  if (alarm.name === "refreshLocation") await refreshLocationSilently();
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SIGN_IN") {
    signInWithGoogle(message.fromOnboarding === true, message.forceAccountPicker === true)
      .then(user => sendResponse({ success: true, user }))
      .catch(err => sendResponse({ success: false, error: err }));
    return true;
  }
  if (message.type === "SIGN_OUT") {
    signOutGoogle().then(() => sendResponse({ success: true })).catch(err => sendResponse({ success: false, error: err }));
    return true;
  }
  if (message.type === "GET_AUTH_STATE") {
    (async () => {
      try {
        const keys = ["isLoggedIn", "userId", "userName", "userEmail", "userPicture", "onboardingComplete", "userProfile"];
        const result = await chrome.storage.local.get(keys);
        if (result.isLoggedIn === true && result.userId && result.onboardingComplete !== true) {
          try {
            const { res, json } = await fetchJsonWithTimeout(
              `${BACKEND_URL}/api/auth/user/${encodeURIComponent(result.userId)}`,
              {},
              8000
            );
            if (res.ok && json?.profile) {
              const p = json.profile;
              if (p.age_range && p.gender && p.occupation) {
                const prevProfile = result.userProfile || {};
                await chrome.storage.local.set({
                  onboardingComplete: true,
                  userProfile: {
                    ...prevProfile,
                    age_range: p.age_range,
                    gender: p.gender,
                    occupation: p.occupation,
                    ...(p.location ? { location: p.location } : {})
                  }
                });
                result.onboardingComplete = true;
              }
            }
          } catch {
            /* backend unreachable */
          }
        }
        delete result.userProfile;
        sendResponse(result);
      } catch {
        sendResponse({});
      }
    })();
    return true;
  }
  if (message.type === "OPEN_USER_DASHBOARD") {
    openUserDashboardInBrowser()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));
    return true;
  }
  if (message.type !== "CONTENT_DATA") return;
  const domain = getDomain(sender.tab?.url || "");
  if (!domain) return;
  if (!pendingContentData[domain]) pendingContentData[domain] = {};
  const pending = pendingContentData[domain];
  if (message.searchQuery) pending.searchQuery = message.searchQuery;
  if (typeof message.scrollDepth === "number") pending.scrollDepth = Math.max(pending.scrollDepth || 0, message.scrollDepth);
  if (Array.isArray(message.prices) && message.prices.length) pending.prices = [...new Set([...(pending.prices || []), ...message.prices])];
  if (Array.isArray(message.breadcrumbs) && message.breadcrumbs.length) {
    if (!pending.breadcrumbs || message.breadcrumbs.length > pending.breadcrumbs.length) pending.breadcrumbs = message.breadcrumbs;
  }
  if (message.pageType) pending.pageType = message.pageType;
  if (message.deviceType) pending.deviceType = message.deviceType;
  if (message.timeOfDay) pending.timeOfDay = message.timeOfDay;
  if (typeof message.visitHour === "number") pending.visitHour = message.visitHour;
});

console.log("Reclaim background worker v4.2 started");
