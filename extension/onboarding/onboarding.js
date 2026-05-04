// Reclaim — Onboarding Script v2.4
// Fix 1: sign-in no longer gets stuck (background.js tab race removed)
// Fix 2: back buttons on steps 2, 3, 4
// Fix 3: demographics always shown (pre-filled for returning users) and editable
// Fix 4: demographics fetched from DB first, local storage as fallback
// Fix 5: location permission check — shows re-enable modal if previously denied
// Step 1: T&C  |  Step 2: Google Sign In  |  Step 3: Demographics  |  Step 4: Location  |  Step 5: Success

const BACKEND_URL = "http://localhost:3000";

const formData = { age_range: null, gender: null, occupation: null, location: null };
const authData = { userId: null, name: null, email: null, picture: null };
let currentStep = 1;
const TOTAL_STEPS = 5;

// Moved to top so back-button handlers can reference it
let isReturning = new URLSearchParams(window.location.search).get("returning") === "true";

// ─── STEP NAVIGATION ─────────────────────────────────────────────────────────

function showStep(n) {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    document.getElementById(`step-${i}`).classList.toggle("visible", i === n);
    const pip = document.getElementById(`pip-${i}`);
    if (i < n) pip.className = "step-pip done";
    else if (i === n) pip.className = "step-pip active";
    else pip.className = "step-pip";
  }
  currentStep = n;
  updateBackButtons(n);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ─── BACK BUTTONS ─────────────────────────────────────────────────────────────

function updateBackButtons(n) {
  const back2 = document.getElementById("backBtn-2");
  if (back2) back2.classList.toggle("visible", n === 2);

  // Hide back on step 3 for returning users — they arrived here directly
  const back3 = document.getElementById("backBtn-3");
  if (back3) back3.classList.toggle("visible", n === 3 && !isReturning);

  const back4 = document.getElementById("backBtn-4");
  if (back4) back4.classList.toggle("visible", n === 4);
}

document.getElementById("backBtn-2").addEventListener("click", () => showStep(1));
document.getElementById("backBtn-3").addEventListener("click", () => showStep(2));
document.getElementById("backBtn-4").addEventListener("click", () => showStep(3));

// ─── STEP 1: T&C ─────────────────────────────────────────────────────────────

document.getElementById("agreeBtn").addEventListener("click", () => showStep(2));

// ─── STEP 2: GOOGLE SIGN IN ───────────────────────────────────────────────────

document.getElementById("googleSignInBtn").addEventListener("click", async () => {
  const btn = document.getElementById("googleSignInBtn");
  const errEl = document.getElementById("signinError");
  const nextBtn = document.getElementById("signInNextBtn");
  const switchBtn = document.getElementById("switchAccountBtn");

  btn.disabled = true;
  btn.innerHTML = `<span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--muted)">signing in...</span>`;
  errEl.style.display = "none";

  try {
    // If the background worker gets stuck, don't let UI spin forever.
    const response = await Promise.race([
      chrome.runtime.sendMessage({ type: "SIGN_IN", fromOnboarding: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Sign-in timed out. Is the backend running on localhost:3000?")), 20000))
    ]);
    if (!response.success) throw new Error(response.error || "Sign in failed");

    const user = response.user;
    authData.userId = user.userId;
    authData.name = user.name;
    authData.email = user.email;
    authData.picture = user.picture;

    // Show user card
    const card = document.getElementById("userCard");
    const avatarWrap = document.getElementById("userAvatarWrap");
    document.getElementById("userCardName").textContent = user.name;
    document.getElementById("userCardEmail").textContent = user.email;

    if (user.picture) {
      avatarWrap.innerHTML = `<img class="user-avatar" src="${user.picture}" alt="${user.name}">`;
    } else {
      avatarWrap.innerHTML = `<div class="user-avatar-placeholder">${user.name[0].toUpperCase()}</div>`;
    }

    card.classList.add("visible");
    btn.style.display = "none";
    if (switchBtn) switchBtn.style.display = "block";
    nextBtn.disabled = false;

    // Pre-fill demographics for existing users — DB first, local storage as fallback
    if (user.hasDemographics) {
      await loadDemographicsFromDB(user.userId);
    }

  } catch (err) {
    errEl.textContent = err.message || "Sign in failed. Please try again.";
    errEl.style.display = "block";
    btn.disabled = false;
    btn.innerHTML = `
      <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Continue with Google`;
    if (switchBtn) switchBtn.style.display = "none";
  }
});

document.getElementById("switchAccountBtn")?.addEventListener("click", async () => {
  const switchBtn = document.getElementById("switchAccountBtn");
  const errEl = document.getElementById("signinError");
  const nextBtn = document.getElementById("signInNextBtn");
  switchBtn.disabled = true;
  switchBtn.textContent = "switching...";
  errEl.style.display = "none";

  try {
    const response = await chrome.runtime.sendMessage({ type: "SIGN_IN", fromOnboarding: true, forceAccountPicker: true });
    if (!response.success) throw new Error(response.error || "Sign in failed");

    const user = response.user;
    authData.userId = user.userId;
    authData.name = user.name;
    authData.email = user.email;
    authData.picture = user.picture;

    const card = document.getElementById("userCard");
    const avatarWrap = document.getElementById("userAvatarWrap");
    document.getElementById("userCardName").textContent = user.name;
    document.getElementById("userCardEmail").textContent = user.email;
    if (user.picture) avatarWrap.innerHTML = `<img class="user-avatar" src="${user.picture}" alt="${user.name}">`;
    else avatarWrap.innerHTML = `<div class="user-avatar-placeholder">${user.name[0].toUpperCase()}</div>`;

    card.classList.add("visible");
    nextBtn.disabled = false;

    if (user.hasDemographics) await loadDemographicsFromDB(user.userId);
  } catch (err) {
    errEl.textContent = err.message || "Sign in failed. Please try again.";
    errEl.style.display = "block";
  } finally {
    switchBtn.disabled = false;
    switchBtn.textContent = "Use a different Google account";
  }
});

// Always go to step 3 — demographics are never skipped
document.getElementById("signInNextBtn").addEventListener("click", () => showStep(3));

// ─── DEMOGRAPHICS: FETCH FROM DB ─────────────────────────────────────────────
// Priority: DB (source of truth) → local storage → empty form
// Writes DB data back to local storage so future offline loads stay fresh.

async function loadDemographicsFromDB(userId) {
  let profile = null;

  // 1. Try the backend — catches edits made on other devices
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/user?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const data = await res.json();
      // Support both { profile: {...} } and flat { age_range, gender, occupation }
      profile = data.profile || data;
      if (!profile.age_range && !profile.gender && !profile.occupation) profile = null;
    }
  } catch { /* backend unreachable — fall through */ }

  // 2. Fall back to local storage
  if (!profile) {
    const stored = await chrome.storage.local.get("userProfile");
    profile = stored.userProfile || {};
  } else {
    // Cache fresh DB data locally
    await chrome.storage.local.set({ userProfile: profile });
  }

  formData.age_range = profile.age_range || null;
  formData.gender = profile.gender || null;
  formData.occupation = profile.occupation || null;

  applyDemographicsToUI(true);
}

// ─── STEP 3: DEMOGRAPHICS ────────────────────────────────────────────────────

function applyDemographicsToUI(showReturningHint = false) {
  if (formData.age_range) {
    document.querySelectorAll(`.pill[data-group="age"]`).forEach(p => {
      p.classList.toggle("selected", p.dataset.value === formData.age_range);
    });
  }
  if (formData.gender) {
    document.querySelectorAll(`.pill[data-group="gender"]`).forEach(p => {
      p.classList.toggle("selected", p.dataset.value === formData.gender);
    });
  }
  if (formData.occupation) {
    document.getElementById("occupation-select").value = formData.occupation;
  }

  const demoNote = document.getElementById("demoNote");
  if (demoNote) demoNote.classList.toggle("visible", showReturningHint);

  checkDemoForm();
}

document.querySelectorAll(".pill").forEach(pill => {
  pill.addEventListener("click", () => {
    const group = pill.dataset.group;
    document.querySelectorAll(`.pill[data-group="${group}"]`).forEach(p => p.classList.remove("selected"));
    pill.classList.add("selected");
    if (group === "age") formData.age_range = pill.dataset.value;
    if (group === "gender") formData.gender = pill.dataset.value;
    checkDemoForm();
  });
});

document.getElementById("occupation-select").addEventListener("change", (e) => {
  formData.occupation = e.target.value;
  checkDemoForm();
});

function checkDemoForm() {
  document.getElementById("demoNextBtn").disabled = !(formData.age_range && formData.gender && formData.occupation);
}

document.getElementById("demoNextBtn").addEventListener("click", async () => {
  try {
    await fetch(`${BACKEND_URL}/api/auth/user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: authData.userId,
        profile: { age_range: formData.age_range, gender: formData.gender, occupation: formData.occupation }
      })
    });
  } catch { }

  await chrome.storage.local.set({
    userProfile: { age_range: formData.age_range, gender: formData.gender, occupation: formData.occupation }
  });

  showStep(4);
});

// ─── STEP 4: LOCATION ────────────────────────────────────────────────────────

let locationFetched = false;

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
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return {
      city: data.city || data.locality || data.principalSubdivision || "Unknown",
      region: data.principalSubdivision || "",
      country: data.countryName || "",
      source: "gps"
    };
  } catch {
    return await fetchIpLocation();
  }
}

function showLocationResult(loc) {
  formData.location = loc;
  locationFetched = true;
  const cityText = [loc.city, loc.region, loc.country].filter(Boolean).join(", ");
  document.getElementById("locationCity").textContent = cityText || "Unknown";
  document.getElementById("locationSource").textContent =
    loc.source === "gps" ? "via GPS — high accuracy" : "via IP address — city-level";
  document.getElementById("locationResult").classList.add("visible");
  document.getElementById("locationNextBtn").disabled = false;
}

// ─── LOCATION DENIED MODAL ────────────────────────────────────────────────────
// Chrome remembers the denial and won't re-prompt. We show instructions instead.

function showLocationDeniedModal() {
  document.getElementById("locationDeniedModal").classList.add("visible");
}

document.getElementById("locationModalClose").addEventListener("click", () => {
  document.getElementById("locationDeniedModal").classList.remove("visible");
});

document.getElementById("locationModalIp").addEventListener("click", async () => {
  document.getElementById("locationDeniedModal").classList.remove("visible");
  const loc = await fetchIpLocation();
  showLocationResult(loc);
  const btn = document.getElementById("locationBtn");
  btn.classList.add("granted");
  btn.innerHTML = `<span>✓</span> Location detected`;
});

document.getElementById("locationBtn").addEventListener("click", async () => {
  const btn = document.getElementById("locationBtn");
  if (locationFetched) return;

  // Check permission state before trying — avoids silently eating a denied request
  try {
    const perm = await navigator.permissions.query({ name: "geolocation" });
    if (perm.state === "denied") {
      showLocationDeniedModal();
      return;
    }
  } catch { /* permissions API unavailable — continue to normal flow */ }

  btn.innerHTML = `<span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--muted)">detecting location...</span>`;
  btn.disabled = true;

  if (!navigator.geolocation) {
    const loc = await fetchIpLocation();
    showLocationResult(loc);
    btn.classList.add("granted");
    btn.innerHTML = `<span>✓</span> Location detected`;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const loc = await fetchGpsLocation(pos.coords.latitude, pos.coords.longitude);
      showLocationResult(loc);
      btn.classList.add("granted");
      btn.innerHTML = `<span>✓</span> Location detected`;
    },
    async (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        // User just denied the native prompt — show modal with re-enable instructions
        btn.disabled = false;
        btn.innerHTML = `<span>📍</span> Allow Location Access`;
        showLocationDeniedModal();
      } else {
        // Timeout / position unavailable — silently fall back to IP
        const loc = await fetchIpLocation();
        showLocationResult(loc);
        btn.classList.add("granted");
        btn.innerHTML = `<span>✓</span> Location detected`;
      }
    },
    { timeout: 8000, maximumAge: 300000 }
  );
});

document.getElementById("skipLocation").addEventListener("click", async () => {
  const skipEl = document.getElementById("skipLocation");
  skipEl.textContent = "fetching location...";
  skipEl.style.pointerEvents = "none";
  const loc = await fetchIpLocation();
  showLocationResult(loc);
  skipEl.textContent = "using IP-based location";
});

document.getElementById("locationNextBtn").addEventListener("click", () => {
  buildSuccessScreen();
  showStep(5);
});

// ─── STEP 5: SUCCESS ─────────────────────────────────────────────────────────

function genderLabel(v) {
  return { M: "Male", F: "Female", other: "Other", "prefer-not": "Prefer not to say" }[v] || v || "—";
}
function occupationLabel(v) {
  return { student: "Student", salaried: "Salaried", "business-owner": "Business Owner", freelancer: "Freelancer", other: "Other" }[v] || v || "—";
}

function buildSuccessScreen() {
  const loc = formData.location;
  const rows = [
    { key: "Account", val: authData.name || "—" },
    { key: "Email", val: authData.email || "—" },
    { key: "Age Range", val: formData.age_range || "—" },
    { key: "Gender", val: genderLabel(formData.gender) },
    { key: "Occupation", val: occupationLabel(formData.occupation) },
    { key: "Location", val: loc ? [loc.city, loc.country].filter(Boolean).join(", ") : "Not set" },
    { key: "Source", val: loc?.source === "gps" ? "GPS (high accuracy)" : "IP address" },
  ];
  document.getElementById("profileSummary").innerHTML = rows.map(r => `
    <div class="profile-row">
      <span class="profile-key">${r.key}</span>
      <span class="profile-val">${r.val}</span>
    </div>
  `).join("");
}

document.getElementById("doneBtn").addEventListener("click", async () => {
  const btn = document.getElementById("doneBtn");
  btn.textContent = "saving...";
  btn.disabled = true;

  const loc = formData.location || { city: "Unknown", region: "", country: "", source: "ip" };

  await chrome.storage.local.set({
    userLocation: loc,
    onboardingComplete: true,
    onboardingDate: new Date().toISOString().split("T")[0]
  });

  const stored = await chrome.storage.local.get(["sessions", "totalEarnings", "userProfile", "userId"]);
  const userId = authData.userId || stored.userId;

  try {
    const controller = new AbortController();
    const syncTimeout = setTimeout(() => controller.abort(), 15000);
    try {
      await fetch(`${BACKEND_URL}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          userId,
          sessions: stored.sessions || {},
          totalEarnings: stored.totalEarnings || 0,
          profile: { ...(stored.userProfile || {}), location: loc }
        })
      });
    } finally {
      clearTimeout(syncTimeout);
    }
  } catch { /* backend optional */ }

  try {
    await chrome.runtime.sendMessage({ type: "OPEN_USER_DASHBOARD" });
  } catch {
    /* ignore */
  }
  try {
    const thisTab = await new Promise((resolve) => {
      chrome.tabs.getCurrent((t) => resolve(t));
    });
    if (thisTab?.id) await chrome.tabs.remove(thisTab.id);
  } catch {
    window.close();
  }
});

// ─── INIT ─────────────────────────────────────────────────────────────────────

if (isReturning) {
  // Returning user (e.g. opened from popup/settings as ?returning=true)
  // Show step 3 pre-filled so they can review/edit demographics before updating location
  chrome.storage.local.get(["userName", "userEmail", "userPicture", "userId", "userProfile"], async (result) => {
    authData.name = result.userName || "";
    authData.email = result.userEmail || "";
    authData.picture = result.userPicture || "";
    authData.userId = result.userId || "";

    if (result.userId) {
      await loadDemographicsFromDB(result.userId);
    } else {
      const p = result.userProfile || {};
      formData.age_range = p.age_range || null;
      formData.gender = p.gender || null;
      formData.occupation = p.occupation || null;
      applyDemographicsToUI(true);
    }

    showStep(3);
  });
} else {
  showStep(1);
}
