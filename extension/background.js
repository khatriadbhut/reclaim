// Reclaim - Background Service Worker v4.2
// Fix 1: refreshLocationSilently is fire-and-forget (no await) — unblocks sendResponse
// Fix 2: tab close/reopen block removed — onboarding page handles its own navigation
// Auth: chrome.identity.getAuthToken + /api/auth/google
// Full structured extraction via /api/extract
// Final packaged category via /api/classify-visit (strict merge: domain rollup + page signals)
// Syncs to backend every 5 minutes

const BACKEND_URL = "http://localhost:3000";
/**
 * Origins allowed for `externally_connectable` / port bridges. Keep in sync with manifest.json
 * `externally_connectable.matches` before publishing (add your production dashboard HTTPS origin).
 */
const ALLOWED_DASHBOARD_ORIGINS = new Set(["http://localhost:5173"]);
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
  "lastSyncAt",
  "lastSyncOk",
  "lastSyncError",
];

function isAllowedDashboardOrigin(origin) {
  return Boolean(origin && ALLOWED_DASHBOARD_ORIGINS.has(origin));
}

function senderOrigin(sender) {
  try {
    const u = sender?.url ? new URL(sender.url) : null;
    return u ? u.origin : null;
  } catch {
    return null;
  }
}

function allowExternalSenderOrReject(sender, sendResponse) {
  const origin = senderOrigin(sender);
  // In MV3 service worker wakeup scenarios, Chrome may omit sender.url/port.sender.
  // We rely on manifest.json externally_connectable in dev to restrict origins.
  if (!origin) return true;
  if (!isAllowedDashboardOrigin(origin)) {
    try {
      sendResponse({ ok: false, error: "forbidden origin" });
    } catch {
      /* ignore */
    }
    return false;
  }
  return true;
}

async function getUserApiToken() {
  const { userApiToken } = await chrome.storage.local.get(["userApiToken"]);
  return typeof userApiToken === "string" && userApiToken.trim() ? userApiToken.trim() : null;
}

async function authHeaders() {
  const token = await getUserApiToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Chrome's `externally_connectable` in manifest.json already enforces which origins
// can send external messages, so a secondary URL check here is redundant.
// Worse, in MV3 service worker wakeup scenarios sender.url can be unpopulated,
// causing the old check to silently reject valid messages from signed-in users.

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;
  if (!allowExternalSenderOrReject(sender, sendResponse)) return false;
  if (message.type === "RECLAIM_GET_STORAGE") {
    chrome.storage.local
      .get(DASHBOARD_STORAGE_KEYS)
      .then((result) => sendResponse(result || {}))
      .catch(() => sendResponse({}));
    return true;
  }
  if (message.type === "RECLAIM_INSIGHT") {
    (async () => {
      const summary = typeof message.summary === "string" ? message.summary : "";
      sendResponse(await postInsightSummary(summary));
    })();
    return true;
  }
  if (message.type === "RECLAIM_SYNC_NOW") {
    (async () => {
      try {
        await syncToBackend();
        const now = Date.now();
        await chrome.storage.local.set({ lastSyncAt: now, lastSyncOk: true, lastSyncError: null });
        sendResponse({ ok: true, at: now });
      } catch (err) {
        const now = Date.now();
        const msg = err?.message ? String(err.message) : "sync failed";
        await chrome.storage.local.set({ lastSyncAt: now, lastSyncOk: false, lastSyncError: msg });
        sendResponse({ ok: false, at: now, error: msg });
      }
    })();
    return true;
  }
  return false;
});

chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name !== "reclaim-dashboard") {
    port.disconnect();
    return;
  }
  const origin = senderOrigin(port.sender);
  // See allowExternalSenderOrReject: port.sender may be missing in MV3 wakeups.
  if (origin && !isAllowedDashboardOrigin(origin)) {
    port.disconnect();
    return;
  }
  port.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === "RECLAIM_GET_STORAGE") {
      chrome.storage.local.get(DASHBOARD_STORAGE_KEYS).then((result) => {
        try {
          port.postMessage({ type: "RECLAIM_STORAGE", payload: result || {} });
        } catch {
          /* port may be gone */
        }
      });
      return;
    }
    if (msg.type === "RECLAIM_INSIGHT") {
      (async () => {
        try {
          const summary = typeof msg.summary === "string" ? msg.summary : "";
          const payload = await postInsightSummary(summary);
          port.postMessage({ type: "RECLAIM_INSIGHT_RESULT", payload });
        } catch (err) {
          try {
            port.postMessage({
              type: "RECLAIM_INSIGHT_RESULT",
              payload: { ok: false, error: err?.message ? String(err.message) : "insight failed" },
            });
          } catch {
            /* ignore */
          }
        }
      })();
      return;
    }
    if (msg.type === "RECLAIM_SYNC_NOW") {
      (async () => {
        try {
          await syncToBackend();
          const now = Date.now();
          await chrome.storage.local.set({ lastSyncAt: now, lastSyncOk: true, lastSyncError: null });
          try {
            port.postMessage({ type: "RECLAIM_SYNC_RESULT", payload: { ok: true, at: now } });
          } catch {
            /* port may be gone */
          }
        } catch (err) {
          const now = Date.now();
          const msgText = err?.message ? String(err.message) : "sync failed";
          await chrome.storage.local.set({ lastSyncAt: now, lastSyncOk: false, lastSyncError: msgText });
          try {
            port.postMessage({ type: "RECLAIM_SYNC_RESULT", payload: { ok: false, at: now, error: msgText } });
          } catch {
            /* port may be gone */
          }
        }
      })();
    }
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
      url: ["http://localhost:5173/*"],
    });
    for (const t of tabs) {
      const u = new URL(t.url || "");
      if (u.port === "5173" && u.hostname === "localhost") {
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
        u.hostname === "localhost" &&
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

async function postInsightSummary(summary) {
  const s = typeof summary === "string" ? summary : "";
  if (!s.trim()) return { ok: false, error: "missing summary" };
  try {
    const ah = await authHeaders();
    const { res, json, text } = await fetchJsonWithTimeout(
      `${BACKEND_URL}/api/insight`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ah },
        body: JSON.stringify({ summary }),
      },
      15000
    );
    if (!res.ok) return { ok: false, error: (json && json.error) || text || `insight failed (${res.status})` };
    return { ok: true, insight: json?.insight || "", source: json?.source || null };
  } catch (err) {
    return { ok: false, error: err?.message ? String(err.message) : "insight failed" };
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
          userApiToken: user.apiToken || null,
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

function dominantPageType(session) {
  const pts = Array.isArray(session?.pageTypes) ? session.pageTypes : [];
  const rank = ["checkout", "travel_booking", "property_listing", "job_listing", "product", "category", "search", "article", "homepage", "other"];
  for (const t of rank) {
    if (pts.includes(t)) return t;
  }
  return pts.length ? pts[pts.length - 1] : "other";
}

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
  const pageType = dominantPageType(session);
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
    const ah = await authHeaders();
    const res = await fetch(`${BACKEND_URL}/api/extract`, {
      method: "POST", headers: { "Content-Type": "application/json", ...ah },
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

async function classifyVisitOnBackend({ url, title, domain, pageType, pageTypes, extracted, session }) {
  try {
    const ah = await authHeaders();
    const res = await fetch(`${BACKEND_URL}/api/classify-visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ah },
      body: JSON.stringify({
        url,
        title,
        domain,
        seoText: typeof session?.seoText === "string" ? session.seoText.slice(0, 400) : null,
        metaKeywords: typeof session?.metaKeywords === "string" ? session.metaKeywords.slice(0, 250) : null,
        ogType: typeof session?.ogType === "string" ? session.ogType.slice(0, 60) : null,
        schemaTypes: Array.isArray(session?.schemaTypes) ? session.schemaTypes.slice(0, 6) : null,
        pageType: pageType || null,
        pageTypes: Array.isArray(pageTypes) ? pageTypes : [],
        hasPrices: Array.isArray(session?.pricesFound) && session.pricesFound.length > 0,
        pricesCount: Array.isArray(session?.pricesFound) ? session.pricesFound.length : 0,
        modelCategory: extracted?.category || null,
      }),
    });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return { category: extracted?.category || "other", earnings_rate: FALLBACK_EARNINGS_RATE[extracted?.category || "other"] || 0.005 };
  }
}

async function refreshVisitClassification(url, title, domain, session, extracted, latestPageType) {
  const classified = await classifyVisitOnBackend({
    url,
    title,
    domain,
    pageType: latestPageType || null,
    pageTypes: session.pageTypes,
    extracted,
    session,
  });

  session.packaged_category = classified.category;
  session.category = classified.category;
  session.category_merge = classified.merge || null;
  session.domain_rollup = classified.domain_rollup ?? classified.domainRollup ?? null;
  session.iab_provider = classified.iab_provider || null;
  session.iab_taxonomy = classified.iab_taxonomy || null;
  session.iab_categories = Array.isArray(classified.iab_categories) ? classified.iab_categories.slice(0, 8) : null;
  session.iab_primary_id = classified.iab_primary_id ?? null;
  session.iab_primary_name = classified.iab_primary_name ?? null;
  session.iab_primary_confidence = classified.iab_primary_confidence ?? null;
  session.iab_mapped = classified.iab_mapped || null;
  session.iab_content = classified.iab_content || null;
  session.iab_content_primary_id = classified.iab_content_primary_id ?? null;
  session.iab_content_primary_name = classified.iab_content_primary_name ?? null;
  session.iab_content_primary_confidence = classified.iab_content_primary_confidence ?? null;
  session.iab_content_match_method = classified.iab_content_match_method ?? null;

  return classified;
}

/** After a fresh classify, align every stored day for this domain so old wrong labels disappear on next browse. */
function propagateClassificationToAllDaysForDomain(sessions, domain, sourceSession) {
  if (!sessions || !domain || !sourceSession) return;
  for (const dk of Object.keys(sessions)) {
    const day = sessions[dk];
    if (!day || typeof day !== "object") continue;
    const row = day[domain];
    if (!row || row === sourceSession) continue;
    row.packaged_category = sourceSession.packaged_category;
    row.category = sourceSession.category;
    row.category_merge = sourceSession.category_merge;
    row.domain_rollup = sourceSession.domain_rollup;
    row.iab_provider = sourceSession.iab_provider;
    row.iab_taxonomy = sourceSession.iab_taxonomy;
    row.iab_categories = sourceSession.iab_categories;
    row.iab_primary_id = sourceSession.iab_primary_id;
    row.iab_primary_name = sourceSession.iab_primary_name;
    row.iab_primary_confidence = sourceSession.iab_primary_confidence;
    row.iab_mapped = sourceSession.iab_mapped;
    row.iab_content = sourceSession.iab_content;
    row.iab_content_primary_id = sourceSession.iab_content_primary_id;
    row.iab_content_primary_name = sourceSession.iab_content_primary_name;
    row.iab_content_primary_confidence = sourceSession.iab_content_primary_confidence;
    row.iab_content_match_method = sourceSession.iab_content_match_method;
  }
}

async function saveSession(url, title, durationSeconds, contentData = {}) {
  if (!url || durationSeconds < 2) return;
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return;
  const domain = getDomain(url);
  if (!domain) return;

  // Never pay/track local development hosts.
  // Otherwise users can keep localhost open and farm earnings.
  const d = String(domain).toLowerCase();
  if (
    d === "localhost" ||
    d === "127.0.0.1" ||
    d === "0.0.0.0" ||
    d.endsWith(".local") ||
    /^10\.\d+\.\d+\.\d+$/.test(d) ||
    /^192\.168\.\d+\.\d+$/.test(d) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(d)
  ) {
    return;
  }

  const extracted = await extractData(domain, title);
  const todayKey = getTodayKey();
  const result = await chrome.storage.local.get(["sessions", "totalEarnings"]);
  const sessions = result.sessions || {};
  const totalEarnings = result.totalEarnings || 0;

  if (!sessions[todayKey]) sessions[todayKey] = {};
  if (!sessions[todayKey][domain]) {
    sessions[todayKey][domain] = {
      domain, category: "other", packaged_category: "other", totalSeconds: 0, visits: 0, earned: 0,
      brand: extracted.brand || null, product: extracted.product || null,
      product_type: extracted.product_type || null, price_range: extracted.price_range || null,
      intent_score: extracted.intent_score || 3, keywords: [],
      search_type: extracted.search_type || null, location: extracted.location || null,
      job_title: extracted.job_title || null, travel_route: extracted.travel_route || null,
      property_type: extracted.property_type || null,
      searchQueries: [], maxScrollDepth: 0, pricesFound: [],
      breadcrumbs: [], pageTypes: [], deviceType: null, timeOfDay: null, visitHours: [],
      iab_provider: null, iab_taxonomy: null, iab_categories: null,
      iab_primary_id: null, iab_primary_name: null, iab_primary_confidence: null,
      iab_mapped: null,
      iab_content: null,
      iab_content_primary_id: null, iab_content_primary_name: null,
      iab_content_primary_confidence: null, iab_content_match_method: null,
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
  if (contentData.seoText && typeof contentData.seoText === "string") session.seoText = contentData.seoText.slice(0, 400);
  if (contentData.metaKeywords && typeof contentData.metaKeywords === "string") session.metaKeywords = contentData.metaKeywords.slice(0, 250);
  if (contentData.ogType && typeof contentData.ogType === "string") session.ogType = contentData.ogType.slice(0, 60);
  if (Array.isArray(contentData.schemaTypes) && contentData.schemaTypes.length) {
    session.schemaTypes = contentData.schemaTypes.map((x) => String(x || "").slice(0, 60)).filter(Boolean).slice(0, 6);
  }

  const classified = await refreshVisitClassification(url, title, domain, session, extracted, contentData.pageType);
  propagateClassificationToAllDaysForDomain(sessions, domain, session);

  let crossSiteBonus = 0;
  if (session.brand) {
    const sameBrandDomains = Object.values(sessions[todayKey]).filter(s => s.brand && s.brand.toLowerCase() === session.brand.toLowerCase() && s.domain !== domain);
    if (sameBrandDomains.length >= 2) crossSiteBonus = 0.005;
  }

  const extractedForEarnings = {
    ...extracted,
    category: classified.category,
    earnings_rate: classified.earnings_rate || FALLBACK_EARNINGS_RATE[classified.category] || extracted.earnings_rate,
  };

  const earned = calculateEarnings(durationSeconds, extractedForEarnings, session) + (crossSiteBonus / 3600) * durationSeconds;
  session.earned += earned;
  await chrome.storage.local.set({ sessions, totalEarnings: totalEarnings + earned, lastUpdated: Date.now() });
}

// ─── SYNC ─────────────────────────────────────────────────────────────────────

const SYNC_QUEUE_KEY = "syncQueue";
const SYNC_QUEUE_CAP = 25;
const SYNC_MAX_ATTEMPTS = 10;

async function postSyncPayload(payload) {
  const ah = await authHeaders();
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${BACKEND_URL}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ah },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let text = "";
      try { text = await res.text(); } catch { /* ignore */ }
      throw new Error(text || `sync failed (${res.status})`);
    }
    const json = await res.json().catch(() => ({}));
    const ev = json?.enrichment_version;
    if (ev != null) {
      await chrome.storage.local.set({ lastServerEnrichmentVersion: ev, lastSyncResponseAt: Date.now() });
    }
    return json;
  } finally {
    clearTimeout(tid);
  }
}

async function enqueueSyncPayload(payload) {
  const prev = await chrome.storage.local.get(SYNC_QUEUE_KEY);
  const q = Array.isArray(prev[SYNC_QUEUE_KEY]) ? prev[SYNC_QUEUE_KEY] : [];
  q.push({ payload, attempts: 0, queuedAt: Date.now() });
  await chrome.storage.local.set({ [SYNC_QUEUE_KEY]: q.slice(-SYNC_QUEUE_CAP) });
}

async function flushSyncQueue() {
  const prev = await chrome.storage.local.get(SYNC_QUEUE_KEY);
  let q = Array.isArray(prev[SYNC_QUEUE_KEY]) ? prev[SYNC_QUEUE_KEY] : [];
  if (!q.length) return;
  const next = [];
  for (const item of q) {
    const payload = item?.payload;
    if (!payload) continue;
    try {
      await postSyncPayload(payload);
    } catch {
      const attempts = (item.attempts || 0) + 1;
      if (attempts < SYNC_MAX_ATTEMPTS) next.push({ ...item, attempts });
    }
  }
  await chrome.storage.local.set({ [SYNC_QUEUE_KEY]: next });
}

async function syncToBackend() {
  await flushSyncQueue();
  const userId = await getUserId();
  const result = await chrome.storage.local.get([
    "sessions", "totalEarnings", "userLocation", "userProfile", "lastServerEnrichmentVersion",
  ]);
  const payload = {
    userId,
    sessions: result.sessions || {},
    totalEarnings: result.totalEarnings || 0,
    profile: { ...(result.userProfile || {}), location: result.userLocation || {} },
    clientEnrichmentVersion: result.lastServerEnrichmentVersion ?? null,
  };
  try {
    await postSyncPayload(payload);
  } catch (e) {
    await enqueueSyncPayload(payload);
    throw e;
  }
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
  if (alarm.name === "syncToBackend") {
    try {
      await syncToBackend();
      await chrome.storage.local.set({ lastSyncAt: Date.now(), lastSyncOk: true, lastSyncError: null });
    } catch (err) {
      await chrome.storage.local.set({ lastSyncAt: Date.now(), lastSyncOk: false, lastSyncError: err?.message ? String(err.message) : "sync failed" });
      console.error("Reclaim: sync failed", err?.message || err);
    }
  }
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
  if (message.type === "POPUP_INSIGHT") {
    postInsightSummary(typeof message.summary === "string" ? message.summary : "").then(sendResponse);
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
  if (message.seoText && typeof message.seoText === "string") pending.seoText = message.seoText.slice(0, 400);
  if (message.metaKeywords && typeof message.metaKeywords === "string") pending.metaKeywords = message.metaKeywords.slice(0, 250);
  if (message.ogType && typeof message.ogType === "string") pending.ogType = message.ogType.slice(0, 60);
  if (Array.isArray(message.schemaTypes) && message.schemaTypes.length) {
    pending.schemaTypes = message.schemaTypes.map((x) => String(x || "").slice(0, 60)).filter(Boolean).slice(0, 6);
  }
});

console.log("Reclaim background worker v4.2 started");
