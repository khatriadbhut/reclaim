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
  if (result.userPicture) {
    avatarWrap.innerHTML = `<img class="profile-avatar" src="${result.userPicture}" alt="">`;
  } else if (result.userName) {
    avatarWrap.innerHTML = `<div class="profile-avatar-placeholder">${result.userName[0].toUpperCase()}</div>`;
  }
  document.getElementById("profileName").textContent = result.userName || "Unknown";
  document.getElementById("profileEmail").textContent = result.userEmail || "";

  // Demographics — try DB first, fall back to local storage
  let profile = null;
  if (result.userId) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/user?userId=${encodeURIComponent(result.userId)}`);
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
      const res = await fetch(`${BACKEND_URL}/api/auth/user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
