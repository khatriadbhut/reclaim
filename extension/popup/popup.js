// Reclaim Popup Script v2 — with auth state

const CATEGORY_COLORS = {
  shopping: "cat-shopping", social: "cat-social", news: "cat-news",
  finance: "cat-finance", entertainment: "cat-entertainment", education: "cat-education",
  health: "cat-health", travel: "cat-travel", technology: "cat-technology", other: "cat-other"
};

function getTodayKey() { return new Date().toISOString().split("T")[0]; }

function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatMoney(amount) { return amount.toFixed(4); }

async function openUserDashboardTab() {
  await chrome.runtime.sendMessage({ type: "OPEN_USER_DASHBOARD" });
}

// ─── AUTH STATE ───────────────────────────────────────────────────────────────

async function checkAuthAndRender() {
  const state = await chrome.runtime.sendMessage({ type: "GET_AUTH_STATE" });
  const onboardingDone = state?.onboardingComplete === true;

  if (!onboardingDone) {
    showSetupRequired(state);
    return;
  }

  if (state && state.isLoggedIn) {
    showLoggedIn(state);
  } else {
    showLoggedOut();
  }
}

function hideAllMainViews() {
  document.getElementById("setupRequiredView").classList.add("hidden");
  document.getElementById("loggedOutView").classList.add("hidden");
  document.getElementById("loggedInView").classList.add("hidden");
}

function showSetupRequired(state) {
  hideAllMainViews();
  document.getElementById("setupRequiredView").classList.remove("hidden");
  document.getElementById("userAvatarContainer").innerHTML = "";

  const loggedIn = !!(state && state.isLoggedIn);
  document.getElementById("setupTitle").textContent = loggedIn ? "Finish setup" : "Set up Reclaim";
  document.getElementById("setupSub").textContent = loggedIn
    ? "You’re signed in — finish onboarding (profile & location) in the setup tab."
    : "Review consent and create your account in a full tab first. Then this popup unlocks.";

  const btn = document.getElementById("openOnboardingBtn");
  btn.textContent = loggedIn ? "Continue setup" : "Open setup";
  btn.onclick = () => {
    const base = chrome.runtime.getURL("onboarding/onboarding.html");
    const url = loggedIn ? `${base}?returning=true` : base;
    chrome.tabs.create({ url, active: true });
    window.close();
  };
}

function showLoggedOut() {
  hideAllMainViews();
  document.getElementById("loggedOutView").classList.remove("hidden");
  document.getElementById("userAvatarContainer").innerHTML = "";
}

function showLoggedIn(state) {
  hideAllMainViews();
  document.getElementById("loggedInView").classList.remove("hidden");

  // Avatar in header
  const avatarContainer = document.getElementById("userAvatarContainer");
  if (state.userPicture) {
    avatarContainer.innerHTML = `<img class="user-avatar-sm" src="${state.userPicture}" alt="" id="avatarBtn" title="${state.userName || ''}">`;
  } else if (state.userName) {
    avatarContainer.innerHTML = `<div class="user-avatar-sm-placeholder" id="avatarBtn">${state.userName[0].toUpperCase()}</div>`;
  }

  // Avatar click → settings
  document.getElementById("avatarBtn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("settings/settings.html") });
  });

  loadData();

  const dashboardBtn = document.getElementById("dashboardBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  if (dashboardBtn && !dashboardBtn.dataset.reclaimBound) {
    dashboardBtn.dataset.reclaimBound = "1";
    dashboardBtn.addEventListener("click", (e) => {
      e.preventDefault();
      void openUserDashboardTab().catch((err) => console.error("Reclaim: open dashboard", err));
    });
  }
  if (settingsBtn && !settingsBtn.dataset.reclaimBound) {
    settingsBtn.dataset.reclaimBound = "1";
    settingsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL("settings/settings.html"), active: true });
    });
  }
}

// ─── SIGN IN FROM POPUP ───────────────────────────────────────────────────────

document.getElementById("popupSignInBtn").addEventListener("click", async () => {
  const btn = document.getElementById("popupSignInBtn");
  btn.textContent = "signing in...";
  btn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ type: "SIGN_IN" });
    if (response.success) {
      // Background.js handles routing to onboarding — just close popup
      window.close();
    } else {
      btn.textContent = "Sign in failed — try again";
      btn.disabled = false;
    }
  } catch {
    btn.textContent = "Sign in failed — try again";
    btn.disabled = false;
  }
});

// ─── DATA LOADING ─────────────────────────────────────────────────────────────

async function loadData() {
  const result = await chrome.storage.local.get(["sessions", "totalEarnings"]);
  const sessions = result.sessions || {};
  const totalEarnings = result.totalEarnings || 0;
  const todayKey = getTodayKey();
  const todaySessions = sessions[todayKey] || {};

  // Total earnings
  const totalEl = document.getElementById("totalEarnings");
  const dollars = Math.floor(totalEarnings);
  const cents = ((totalEarnings - dollars) * 100).toFixed(0).padStart(2, "0");
  totalEl.innerHTML = `$${dollars}<span class="cents">.${cents}</span>`;

  // Today earnings
  const todayEarned = Object.values(todaySessions).reduce((sum, s) => sum + (s.earned || 0), 0);
  document.getElementById("todayEarnings").textContent = `today: $${formatMoney(todayEarned)}`;

  // Category aggregation
  const categories = {};
  for (const session of Object.values(todaySessions)) {
    const cat = session.category || "other";
    if (!categories[cat]) categories[cat] = { seconds: 0, earned: 0 };
    categories[cat].seconds += session.totalSeconds || 0;
    categories[cat].earned += session.earned || 0;
  }

  const listEl = document.getElementById("categoryList");
  if (Object.keys(categories).length === 0) {
    listEl.innerHTML = `<div class="empty-state">start browsing to see your data</div>`;
    renderInsight(null);
    return;
  }

  const maxSeconds = Math.max(...Object.values(categories).map(c => c.seconds));
  const sorted = Object.entries(categories).sort((a, b) => b[1].seconds - a[1].seconds);

  listEl.innerHTML = sorted.map(([cat, data]) => {
    const pct = maxSeconds > 0 ? (data.seconds / maxSeconds) * 100 : 0;
    const colorClass = CATEGORY_COLORS[cat] || "cat-other";
    return `
      <div class="category-row">
        <div class="category-name">${cat}</div>
        <div class="bar-track"><div class="bar-fill ${colorClass}" style="width:${pct}%"></div></div>
        <div class="category-time">${formatTime(data.seconds)}</div>
      </div>`;
  }).join("");

  renderInsight(categories);
}

async function renderInsight(categories) {
  const insightEl = document.getElementById("insightBox");
  if (!categories || Object.keys(categories).length === 0) {
    insightEl.textContent = "browse a few sites and your AI insight will appear here.";
    insightEl.classList.add("loading");
    return;
  }

  const cached = await chrome.storage.local.get(["cachedInsight", "insightTimestamp"]);
  const now = Date.now();
  if (cached.cachedInsight && cached.insightTimestamp && (now - cached.insightTimestamp) < 600000) {
    insightEl.textContent = cached.cachedInsight;
    insightEl.classList.remove("loading");
    return;
  }

  insightEl.textContent = "analysing your browsing patterns...";
  insightEl.classList.add("loading");

  const summary = Object.entries(categories).map(([cat, data]) => `${cat}: ${Math.round(data.seconds / 60)} minutes`).join(", ");

  try {
    const response = await fetch("http://localhost:3000/api/insight", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary })
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    const insight = data.insight || "Keep browsing — your insight is being generated.";
    await chrome.storage.local.set({ cachedInsight: insight, insightTimestamp: now });
    insightEl.textContent = insight;
    insightEl.classList.remove("loading");
  } catch {
    const topCat = Object.entries(categories).sort((a, b) => b[1].seconds - a[1].seconds)[0];
    insightEl.textContent = `You spend most time on ${topCat[0]} sites. Start the backend server for AI insights.`;
    insightEl.classList.remove("loading");
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

checkAuthAndRender();
