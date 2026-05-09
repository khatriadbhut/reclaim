// Reclaim — Settings Script v2
// Fix 1: Demographics fetched from DB (source of truth), local storage as fallback
// Fix 2: Demographics are now editable and saveable

const BACKEND_URL = "http://localhost:3000";

// ─── Edit state ──────────────────────────────────────────────────────────────

let editProfile = { age_range: null, gender: null, occupation: null };
let savedUserId = null;

// ─── Labels ──────────────────────────────────────────────────────────────────

function genderLabel(v) {
  return { M: "Male", F: "Female", other: "Other", "prefer-not": "Prefer not to say" }[v] || "—";
}
function occupationLabel(v) {
  return { student: "Student", salaried: "Salaried", "business-owner": "Business Owner", freelancer: "Freelancer", other: "Other" }[v] || "—";
}

// ─── Load settings ────────────────────────────────────────────────────────────

async function loadSettings() {
  const result = await chrome.storage.local.get([
    "isLoggedIn", "userName", "userEmail", "userPicture", "userId",
    "userProfile", "userLocation", "totalEarnings", "sessions", "lastUpdated"
  ]);

  if (!result.isLoggedIn) {
    window.location.href = chrome.runtime.getURL("onboarding/onboarding.html");
    return;
  }

  savedUserId = result.userId || null;

  // Avatar + name
  const avatarWrap = document.getElementById("profileAvatarWrap");
  avatarWrap.replaceChildren();
  if (result.userPicture) {
    const img = document.createElement("img");
    img.className = "profile-avatar";
    img.src = String(result.userPicture);
    img.alt = "";
    avatarWrap.appendChild(img);
  } else if (result.userName) {
    const div = document.createElement("div");
    div.className = "profile-avatar-placeholder";
    div.textContent = String(result.userName).slice(0, 1).toUpperCase();
    avatarWrap.appendChild(div);
  }
  document.getElementById("profileName").textContent = result.userName || "Unknown";
  document.getElementById("profileEmail").textContent = result.userEmail || "";

  // Demographics — try DB first, fall back to local storage
  let profile = null;
  if (result.userId) {
    try {
      const { userApiToken } = await chrome.storage.local.get(["userApiToken"]);
      const res = await fetch(`${BACKEND_URL}/api/auth/user/${encodeURIComponent(result.userId)}`, {
        headers: {
          ...(userApiToken ? { Authorization: `Bearer ${userApiToken}` } : {}),
        }
      });
      if (res.ok) {
        const data = await res.json();
        const p = data.profile || data;
        if (p.age_range || p.gender || p.occupation) {
          profile = p;
          // Cache fresh data locally
          await chrome.storage.local.set({ userProfile: profile });
        }
      }
    } catch { /* backend unreachable — fall through */ }
  }
  if (!profile) {
    profile = result.userProfile || {};
  }

  // Populate read-only view
  document.getElementById("settingAge").textContent = profile.age_range || "—";
  document.getElementById("settingGender").textContent = genderLabel(profile.gender);
  document.getElementById("settingOccupation").textContent = occupationLabel(profile.occupation);

  // Seed edit state
  editProfile.age_range = profile.age_range || null;
  editProfile.gender = profile.gender || null;
  editProfile.occupation = profile.occupation || null;

  // Location
  const loc = result.userLocation || {};
  const cityText = [loc.city, loc.country].filter(Boolean).join(", ");
  document.getElementById("settingLocation").textContent = cityText || "—";
  document.getElementById("settingLocationSource").textContent =
    loc.source === "gps" ? "GPS (high accuracy)" : loc.source === "ip" ? "IP address (city-level)" : "—";

  if (loc.source === "ip" || !loc.source) {
    document.getElementById("locationNudge").style.display = "block";
  }

  // Stats
  const totalEarnings = result.totalEarnings || 0;
  document.getElementById("statEarnings").textContent = `$${totalEarnings.toFixed(4)}`;

  const sessions = result.sessions || {};
  let totalSeconds = 0;
  for (const day of Object.values(sessions)) {
    for (const s of Object.values(day)) {
      totalSeconds += s.totalSeconds || 0;
    }
  }
  document.getElementById("statBrowsing").textContent = `${(totalSeconds / 3600).toFixed(1)}h`;

  if (result.lastUpdated) {
    const d = new Date(result.lastUpdated);
    document.getElementById("statSync").textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

async function fetchIpLocation() {
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { city: data.city || "Unknown", region: data.region || "", country: data.country_name || "", source: "ip" };
  } catch {
    return { city: "Unknown", region: "", country: "", source: "ip" };
  }
}

async function fetchGpsLocation(lat, lng) {
  try {
    // Same endpoint used in onboarding to map GPS → city
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return {
      city: data.city || data.locality || data.principalSubdivision || "Unknown",
      region: data.principalSubdivision || "",
      country: data.countryName || "",
      source: "gps",
    };
  } catch {
    return await fetchIpLocation();
  }
}

async function requestGpsAgain() {
  const btn = document.getElementById("requestLocationBtn");
  const statusEl = document.getElementById("locationEnableStatus");
  if (!btn || !statusEl) return;

  btn.disabled = true;
  statusEl.className = "save-status";
  statusEl.textContent = "requesting location...";

  try {
    if (!navigator.geolocation) throw new Error("geolocation unavailable");

    const loc = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => reject(err),
        { timeout: 8000, maximumAge: 300000 }
      );
    });

    const gpsLoc = await fetchGpsLocation(loc.coords.latitude, loc.coords.longitude);
    await chrome.storage.local.set({ userLocation: gpsLoc });

    document.getElementById("settingLocation").textContent = [gpsLoc.city, gpsLoc.country].filter(Boolean).join(", ") || "—";
    document.getElementById("settingLocationSource").textContent = gpsLoc.source === "gps" ? "GPS (high accuracy)" : "IP address (city-level)";

    document.getElementById("locationNudge").style.display = gpsLoc.source === "gps" ? "none" : "block";

    statusEl.className = "save-status success";
    statusEl.textContent = "✓ Location enabled";

    // Best-effort sync so location improves future exports.
    // UX-safe: if backend is down, we still keep the local location.
    try {
      const stored = await chrome.storage.local.get(["sessions", "totalEarnings", "userProfile", "userId", "userApiToken"]);
      const userId = stored.userId;
      if (userId && stored.sessions) {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 15000);
        try {
          await fetch(`${BACKEND_URL}/api/sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(stored.userApiToken ? { Authorization: `Bearer ${stored.userApiToken}` } : {}),
            },
            signal: controller.signal,
            body: JSON.stringify({
              userId,
              sessions: stored.sessions || {},
              totalEarnings: stored.totalEarnings || 0,
              profile: { ...(stored.userProfile || {}), location: gpsLoc },
            }),
          });
        } finally {
          clearTimeout(tid);
        }
      }
    } catch {
      /* backend optional */
    }
  } catch (err) {
    const code = err && typeof err.code === "number" ? err.code : null;
    if (code === 1 || code === 2) {
      // PERMISSION_DENIED / POSITION_UNAVAILABLE
      statusEl.className = "save-status error";
      statusEl.textContent = "Location blocked. Enable it in Chrome site settings and try again.";
    } else {
      statusEl.className = "save-status error";
      statusEl.textContent = "Could not request location.";
    }
    document.getElementById("locationNudge").style.display = "block";
  } finally {
    btn.disabled = false;
  }
}

// ─── Edit / Cancel toggle ─────────────────────────────────────────────────────

document.getElementById("editToggle").addEventListener("click", () => {
  openEditMode();
});

document.getElementById("cancelEdit").addEventListener("click", () => {
  closeEditMode();
});

function openEditMode() {
  document.getElementById("demoReadonly").classList.add("hidden");
  document.getElementById("demoEdit").classList.add("visible");
  document.getElementById("editToggle").style.display = "none";
  document.getElementById("saveStatus").textContent = "";

  // Pre-select pills from current editProfile state
  document.querySelectorAll("#demoEdit .pill[data-group='age']").forEach(p => {
    p.classList.toggle("selected", p.dataset.value === editProfile.age_range);
  });
  document.querySelectorAll("#demoEdit .pill[data-group='gender']").forEach(p => {
    p.classList.toggle("selected", p.dataset.value === editProfile.gender);
  });
  const occ = document.getElementById("edit-occupation");
  occ.value = editProfile.occupation || "";

  updateSaveBtn();
}

function closeEditMode() {
  document.getElementById("demoReadonly").classList.remove("hidden");
  document.getElementById("demoEdit").classList.remove("visible");
  document.getElementById("editToggle").style.display = "";
}

// ─── Pill clicks in edit view ─────────────────────────────────────────────────

document.querySelectorAll("#demoEdit .pill").forEach(pill => {
  pill.addEventListener("click", () => {
    const group = pill.dataset.group;
    document.querySelectorAll(`#demoEdit .pill[data-group="${group}"]`).forEach(p => p.classList.remove("selected"));
    pill.classList.add("selected");
    if (group === "age") editProfile.age_range = pill.dataset.value;
    if (group === "gender") editProfile.gender = pill.dataset.value;
    updateSaveBtn();
  });
});

document.getElementById("edit-occupation").addEventListener("change", (e) => {
  editProfile.occupation = e.target.value;
  updateSaveBtn();
});

function updateSaveBtn() {
  const ready = !!(editProfile.age_range && editProfile.gender && editProfile.occupation);
  document.getElementById("saveDemo").disabled = !ready;
}

// ─── Save demographics ────────────────────────────────────────────────────────

document.getElementById("saveDemo").addEventListener("click", async () => {
  const btn = document.getElementById("saveDemo");
  const status = document.getElementById("saveStatus");
  btn.disabled = true;
  btn.textContent = "Saving...";
  status.textContent = "";
  status.className = "save-status";

  const profile = {
    age_range: editProfile.age_range,
    gender: editProfile.gender,
    occupation: editProfile.occupation
  };

  // Save to local storage immediately
  await chrome.storage.local.set({ userProfile: profile });

  // Try to push to backend
  let backendOk = false;
  if (savedUserId) {
    try {
      const { userApiToken } = await chrome.storage.local.get(["userApiToken"]);
      const res = await fetch(`${BACKEND_URL}/api/auth/user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userApiToken ? { Authorization: `Bearer ${userApiToken}` } : {}),
        },
        body: JSON.stringify({ userId: savedUserId, profile })
      });
      backendOk = res.ok;
    } catch { /* offline — local save is enough */ }
  }

  // Update read-only display
  document.getElementById("settingAge").textContent = profile.age_range || "—";
  document.getElementById("settingGender").textContent = genderLabel(profile.gender);
  document.getElementById("settingOccupation").textContent = occupationLabel(profile.occupation);

  status.textContent = backendOk ? "✓ Saved to your account" : "✓ Saved locally (backend unreachable)";
  status.className = "save-status success";
  btn.textContent = "Save Changes";

  setTimeout(() => {
    closeEditMode();
  }, 1200);
});

// ─── Logout ───────────────────────────────────────────────────────────────────

document.getElementById("logoutBtn").addEventListener("click", async () => {
  const btn = document.getElementById("logoutBtn");
  btn.textContent = "signing out...";
  btn.disabled = true;

  try {
    await chrome.runtime.sendMessage({ type: "SIGN_OUT" });
  } catch { /* ignore */ }

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) chrome.tabs.remove(tabs[0].id);
  } catch { window.close(); }
});

document.getElementById("backBtn").addEventListener("click", () => window.close());

loadSettings();

// Allow users to request GPS later in Settings when they previously denied it.
document.getElementById("requestLocationBtn")?.addEventListener("click", () => {
  void requestGpsAgain();
});
