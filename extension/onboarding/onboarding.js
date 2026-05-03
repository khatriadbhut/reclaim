// Reclaim — Onboarding Script
// Step 1: T&C consent
// Step 2: Demographics (age_range, gender, occupation)
// Step 3: Location (geolocation → BigDataCloud reverse geocode OR ipapi.co fallback)
// Step 4: Success

const formData = {
  age_range: null,
  gender: null,
  occupation: null,
  location: null
};

let currentStep = 1;
const TOTAL_STEPS = 4;

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
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ─── STEP 1: T&C ─────────────────────────────────────────────────────────────

document.getElementById("agreeBtn").addEventListener("click", () => {
  showStep(2);
});

// ─── STEP 2: DEMOGRAPHICS ────────────────────────────────────────────────────

// Pill selection
document.querySelectorAll(".pill").forEach(pill => {
  pill.addEventListener("click", () => {
    const group = pill.dataset.group;
    // Deselect all in same group
    document.querySelectorAll(`.pill[data-group="${group}"]`).forEach(p => {
      p.classList.remove("selected");
    });
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
  const ready = formData.age_range && formData.gender && formData.occupation;
  document.getElementById("demoNextBtn").disabled = !ready;
}

document.getElementById("demoNextBtn").addEventListener("click", () => {
  showStep(3);
});

// ─── STEP 3: LOCATION ────────────────────────────────────────────────────────

let locationFetched = false;

async function fetchIpLocation() {
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (!res.ok) throw new Error("ipapi failed");
    const data = await res.json();
    return {
      city: data.city || "Unknown",
      region: data.region || "",
      country: data.country_name || "",
      source: "ip"
    };
  } catch {
    return { city: "Unknown", region: "", country: "", source: "ip" };
  }
}

async function fetchGpsLocation(lat, lng) {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    if (!res.ok) throw new Error("reverse geocode failed");
    const data = await res.json();
    return {
      city: data.city || data.locality || data.principalSubdivision || "Unknown",
      region: data.principalSubdivision || "",
      country: data.countryName || "",
      source: "gps"
    };
  } catch {
    // GPS reverse geocode failed — fall back to IP
    return await fetchIpLocation();
  }
}

function showLocationResult(loc) {
  formData.location = loc;
  locationFetched = true;

  const resultEl = document.getElementById("locationResult");
  const cityEl = document.getElementById("locationCity");
  const sourceEl = document.getElementById("locationSource");

  const cityText = [loc.city, loc.region, loc.country].filter(Boolean).join(", ");
  cityEl.textContent = cityText || "Unknown";
  sourceEl.textContent = loc.source === "gps" ? "via GPS — high accuracy" : "via IP address — city-level";

  resultEl.classList.add("visible");
  document.getElementById("locationNextBtn").disabled = false;
}

document.getElementById("locationBtn").addEventListener("click", async () => {
  const btn = document.getElementById("locationBtn");

  if (locationFetched) return;

  btn.innerHTML = `<span class="loading-text">detecting location...</span>`;
  btn.disabled = true;

  if (!navigator.geolocation) {
    // No geolocation support — use IP
    const loc = await fetchIpLocation();
    showLocationResult(loc);
    btn.classList.add("granted");
    btn.innerHTML = `<span class="location-icon">✓</span> Location detected`;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const loc = await fetchGpsLocation(pos.coords.latitude, pos.coords.longitude);
      showLocationResult(loc);
      btn.classList.add("granted");
      btn.innerHTML = `<span class="location-icon">✓</span> Location detected`;
    },
    async () => {
      // Permission denied — silently use IP
      const loc = await fetchIpLocation();
      showLocationResult(loc);
      btn.classList.add("granted");
      btn.innerHTML = `<span class="location-icon">✓</span> Location detected`;
    },
    { timeout: 8000, maximumAge: 300000 }
  );
});

// Skip — silently use IP
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
  showStep(4);
});

// ─── STEP 4: SUCCESS ─────────────────────────────────────────────────────────

function buildSuccessScreen() {
  const loc = formData.location;
  const cityText = loc ? [loc.city, loc.country].filter(Boolean).join(", ") : "Not set";
  const sourceText = loc?.source === "gps" ? "GPS" : "IP";

  const rows = [
    { key: "Age Range",   val: formData.age_range || "—" },
    { key: "Gender",      val: genderLabel(formData.gender) },
    { key: "Occupation",  val: occupationLabel(formData.occupation) },
    { key: "Location",    val: cityText },
    { key: "Source",      val: sourceText },
  ];

  document.getElementById("profileSummary").innerHTML = rows.map(r => `
    <div class="profile-row">
      <span class="profile-key">${r.key}</span>
      <span class="profile-val">${r.val}</span>
    </div>
  `).join("");
}

function genderLabel(v) {
  return { M: "Male", F: "Female", other: "Other", "prefer-not": "Prefer not to say" }[v] || v || "—";
}

function occupationLabel(v) {
  return {
    student: "Student",
    salaried: "Salaried",
    "business-owner": "Business Owner",
    freelancer: "Freelancer",
    other: "Other"
  }[v] || v || "—";
}

// ─── SAVE TO STORAGE & SYNC ──────────────────────────────────────────────────

async function saveAndSync() {
  const loc = formData.location || { city: "Unknown", region: "", country: "", source: "ip" };

  const userProfile = {
    age_range: formData.age_range,
    gender: formData.gender,
    occupation: formData.occupation,
    onboardingComplete: true,
    onboardingDate: new Date().toISOString().split("T")[0]
  };

  const userLocation = {
    city: loc.city,
    region: loc.region,
    country: loc.country,
    source: loc.source
  };

  await chrome.storage.local.set({ userProfile, userLocation });

  // Sync to backend
  try {
    const result = await chrome.storage.local.get(["userId", "sessions", "totalEarnings"]);
    const userId = result.userId || ("usr_" + Math.random().toString(36).slice(2, 10));
    await chrome.storage.local.set({ userId });

    await fetch("http://localhost:3000/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        sessions: result.sessions || {},
        totalEarnings: result.totalEarnings || 0,
        profile: { ...userProfile, location: userLocation }
      })
    });
  } catch {
    // Sync failed silently — data is saved locally, will sync next time background worker runs
  }
}

document.getElementById("doneBtn").addEventListener("click", async () => {
  const btn = document.getElementById("doneBtn");
  btn.textContent = "saving...";
  btn.disabled = true;

  await saveAndSync();

  // Close this tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) chrome.tabs.remove(tabs[0].id);
  } catch {
    window.close();
  }
});

// ─── INIT ─────────────────────────────────────────────────────────────────────

// Don't show onboarding if already complete
chrome.storage.local.get("onboardingComplete", (result) => {
  if (result.onboardingComplete) {
    // Already onboarded — close tab
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.remove(tabs[0].id);
      });
    } catch {
      window.close();
    }
    return;
  }
  showStep(1);
});
