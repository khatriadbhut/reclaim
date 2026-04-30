// Reclaim Popup Script

const CATEGORY_COLORS = {
  shopping: "cat-shopping",
  social: "cat-social",
  news: "cat-news",
  finance: "cat-finance",
  entertainment: "cat-entertainment",
  education: "cat-education",
  health: "cat-health",
  travel: "cat-travel",
  technology: "cat-technology",
  other: "cat-other"
};

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatMoney(amount) {
  return amount.toFixed(4);
}

async function loadData() {
  const result = await chrome.storage.local.get(["sessions", "totalEarnings"]);
  const sessions = result.sessions || {};
  const totalEarnings = result.totalEarnings || 0;
  const todayKey = getTodayKey();
  const todaySessions = sessions[todayKey] || {};

  // Render total earnings
  const totalEl = document.getElementById("totalEarnings");
  const dollars = Math.floor(totalEarnings);
  const cents = ((totalEarnings - dollars) * 100).toFixed(0).padStart(2, "0");
  totalEl.innerHTML = `$${dollars}<span class="cents">.${cents}</span>`;

  // Today's earnings
  const todayEarned = Object.values(todaySessions).reduce((sum, s) => sum + (s.earned || 0), 0);
  document.getElementById("todayEarnings").textContent = `today: $${formatMoney(todayEarned)}`;

  // Aggregate by category
  const categories = {};
  for (const session of Object.values(todaySessions)) {
    const cat = session.category || "other";
    if (!categories[cat]) categories[cat] = { seconds: 0, earned: 0 };
    categories[cat].seconds += session.totalSeconds || 0;
    categories[cat].earned += session.earned || 0;
  }

  // Render category bars
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
        <div class="bar-track">
          <div class="bar-fill ${colorClass}" style="width: ${pct}%"></div>
        </div>
        <div class="category-time">${formatTime(data.seconds)}</div>
      </div>
    `;
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

  // Check cached insight first (refresh every 10 minutes)
  const cached = await chrome.storage.local.get(["cachedInsight", "insightTimestamp"]);
  const now = Date.now();
  if (cached.cachedInsight && cached.insightTimestamp && (now - cached.insightTimestamp) < 600000) {
    insightEl.textContent = cached.cachedInsight;
    insightEl.classList.remove("loading");
    return;
  }

  insightEl.textContent = "analysing your browsing patterns...";
  insightEl.classList.add("loading");

  // Build summary for Gemini
  const summary = Object.entries(categories)
    .map(([cat, data]) => `${cat}: ${Math.round(data.seconds / 60)} minutes`)
    .join(", ");

  try {
    // Call backend for Gemini insight
    const response = await fetch("http://localhost:3000/api/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary })
    });

    if (!response.ok) throw new Error("Backend not available");

    const data = await response.json();
    const insight = data.insight || "Keep browsing — your insight is being generated.";

    await chrome.storage.local.set({
      cachedInsight: insight,
      insightTimestamp: now
    });

    insightEl.textContent = insight;
    insightEl.classList.remove("loading");
  } catch {
    // Fallback: generate insight client-side without API
    const topCat = Object.entries(categories).sort((a, b) => b[1].seconds - a[1].seconds)[0];
    insightEl.textContent = `You spend most time on ${topCat[0]} sites. Backend not connected — start the server to get full AI insights.`;
    insightEl.classList.remove("loading");
  }
}

// Button handlers
document.getElementById("dashboardBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: "http://localhost:5173" });
});

document.getElementById("settingsBtn").addEventListener("click", () => {
  // Settings page coming soon
  chrome.tabs.create({ url: "http://localhost:5173/settings" });
});

// Load on open
loadData();
