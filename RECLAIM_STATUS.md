# Reclaim — Project Status Document
> Last updated: 2026-05-02
> Version: 0.7.0
> Repo: https://github.com/khatriadbhut/reclaim

---

## Project Summary

Reclaim is a self-data-selling platform where users monetize their browsing data through a Chrome browser extension. The extension tracks anonymized browsing metrics (domains visited, page titles, time spent, categories, extracted product/brand/intent signals) and aggregates them into valuable audience segments sold to companies for market research, ad targeting, and intent-based marketing. Users receive payments for contributing their data. An AI-powered suggestion engine provides personalized cross-site recommendations as an added value layer. Payments are handled via blockchain smart contracts.

**Core positioning:** Meta, Google, and Instagram already collect this data and sell it for billions — without paying users a cent. Reclaim collects the same data, with full user consent, and gives users a cut of every sale.

**Competitors:** Caden (down since late 2025), Datacy, SavvyConnect, Honeygain. None have successfully combined cross-site monetization with AI recommendations. Reclaim's browser extension gives richer, more real-time data than any mobile-app competitor.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Browser Extension | Vanilla JS, WebExtension API (Manifest v3) |
| Extension UI | HTML, CSS (inline), DM Mono + Syne fonts |
| Dashboard Frontend | React + Vite (localhost:5173) |
| Backend | Node.js + Express (localhost:3000) |
| AI | Google Gemini API (gemini-2.5-flash) |
| Database | PostgreSQL (planned — not needed for demo, add post-funding) |
| Blockchain | Ethereum/Solana + MetaMask (planned — Sepolia testnet for demo) |
| Hosting | AWS / Google Cloud (planned) |

---

## Repository Structure

```
reclaim/
├── backend/
│   ├── server.js          # Express server, Gemini API, all /api/* endpoints
│   ├── package.json
│   └── .env               # GEMINI_API_KEY, PORT
├── extension/
│   ├── icons/
│   │   ├── icon16.png     # Coin+lock logo, #00ffaa on dark background
│   │   ├── icon48.png
│   │   └── icon128.png
│   ├── popup/
│   │   ├── popup.html     # Extension popup UI
│   │   └── popup.js       # Popup logic, reads chrome.storage, calls /api/insight
│   ├── onboarding/
│   │   ├── onboarding.html  # First-run onboarding page (planned)
│   │   └── onboarding.js    # Demographic capture + geolocation + ipapi fallback (planned)
│   ├── background.js      # Service worker v3 — tab tracking, /api/extract, value-based earnings, /api/sync
│   ├── content.js         # Content script — price extraction, breadcrumbs, scroll depth, search queries, page type
│   └── manifest.json      # Manifest v3, permissions: tabs, storage, alarms, activeTab, scripting
└── dashboard/
    ├── index.html          # Loads Syne + DM Mono fonts, Vite entry
    ├── src/
    │   ├── App.jsx         # Full dashboard UI (overview, browsing, insights, wallet tabs)
    │   └── main.jsx        # React entry point
    └── package.json
```

---

## Data Architecture

### What the Extension Captures Per Page Visit

```json
{
  "user_id": "usr_a7f2k9",
  "timestamp": "2026-05-02T01:45:00Z",
  "domain": "amazon.in",
  "page_title": "Apple iPhone 15 Pro 256GB Natural Titanium - Amazon.in",
  "time_spent_seconds": 340,
  "category": "shopping",
  "extracted": {
    "brand": "Apple",
    "product": "iPhone 15 Pro",
    "product_type": "smartphone",
    "price_range": "premium",
    "intent_score": 8,
    "keywords": ["iPhone 15 Pro", "256GB", "Natural Titanium"],
    "search_type": "product_search"
  },
  "content_signals": {
    "pageType": "product",
    "deviceType": "desktop",
    "timeOfDay": "evening",
    "visitHour": 21,
    "searchQuery": "iphone 15 pro price india",
    "maxScrollDepth": 74,
    "pricesFound": [{ "price": "₹134900", "currency": "INR", "brand": "Apple" }],
    "breadcrumbs": ["Electronics", "Mobiles", "Apple"],
    "pageTypes": ["product"]
  }
}
```

### Aggregated User Profile (what gets packaged and sold)

```json
{
  "user_id": "usr_a7f2k9",
  "age_range": "18-24",
  "gender": "M",
  "location": { "city": "Roorkee", "state": "Uttarakhand", "country": "India" },
  "device": "desktop",
  "week_summary": {
    "total_browsing_hours": 12.4,
    "top_categories": ["technology", "shopping", "entertainment"],
    "top_brands_researched": ["Apple", "Samsung", "Netflix"],
    "purchase_intent": {
      "electronics": "high",
      "fashion": "low",
      "finance": "medium"
    },
    "active_hours": "9pm-2am",
    "active_days": ["Friday", "Saturday"]
  },
  "segments": [
    "high_intent_shopper",
    "night_owl_shopper",
    "tech_early_adopter",
    "finance_decision_maker"
  ],
  "estimated_value_usd": 0.34
}
```

### Export Formats

| Format | Use Case | Buyer Type |
|---|---|---|
| CSV | Audience activation on ad platforms (Google DV360, Meta Ads) | Ad agencies, performance marketers |
| JSON | Developer/API integrations, custom data pipelines | Data engineering teams |
| PDF Report | Market research insights, trend reports | Brand managers, CMOs |

**Internal storage:** Always JSON. CSV and PDF are generated at export time.

### AdTech Flow

Companies don't need users' IP addresses or names. The flow works via:
- **Cookie/Device ID matching** — browser already stores advertiser cookies (Google, Meta). Identity resolution services (LiveRamp, The Trade Desk) bridge Reclaim's user IDs to ad platform IDs without exposing raw personal data.
- **Audience onboarding** — company uploads Reclaim's segment CSV to their ad platform → ads served to matched users across the web
- **Market research** — aggregated behavioral data sold as reports to brand teams

---

## What Has Been Done

### 1. Browser Extension — Content Script (`content.js`) ✅ NEW
A production-grade content script injected into every page via Manifest v3 `content_scripts`. Runs at `document_idle`.

- **Device type detection** — UA-based: mobile / tablet / desktop
- **Time of day detection** — morning / afternoon / evening / night + raw `visitHour` (0–23)
- **Page type detection** — regex on URL/path: checkout, product, search, category, article, job_listing, property_listing, travel_booking, homepage, other
- **Search query capture** — 30+ domain-specific URL param mappings (Google `q`, Amazon `k`, Flipkart `q`, Zomato `q`, Naukri `k`, MagicBricks `q`, etc.)
- **Price extraction (5-layer cascade):**
  1. JSON-LD schema.org Product (Google Shopping standard)
  2. Open Graph / meta tags (`product:price:amount`, `og:price:amount`)
  3. Microdata (`itemtype*="schema.org/Product"`)
  4. Site-specific CSS selectors (Amazon, Flipkart, Myntra, Nykaa, Meesho, Ajio, Snapdeal)
  5. Regex fallback (`₹`, `$`, `€` patterns in body text)
- **Breadcrumb extraction** — JSON-LD BreadcrumbList first, then `nav[aria-label*="breadcrumb"]` fallback
- **Scroll depth tracking** — live tracking with 2-second debounce, sends on scroll / page unload / every 30 seconds
- **Messaging** — sends all signals to `background.js` via `chrome.runtime.sendMessage({ type: "CONTENT_DATA", ... })`

### 2. Browser Extension — Background Service Worker (`background.js` v3) ✅ UPGRADED
- **Tab tracking** — `chrome.tabs.onActivated`, `onUpdated`, `windows.onFocusChanged` save session on tab switch
- **Periodic saves** — alarm every 30 seconds
- **Structured extraction** — calls `POST /api/extract` (not `/api/categorize`) for domain + title; 24hr cache in `chrome.storage.local` keyed by `ext_{domain}_{title_prefix}` — persists across Chrome restarts to prevent Gemini quota burn
- **Content script integration** — listens for `CONTENT_DATA` messages, accumulates into `pendingContentData[domain]`, merges on next `saveSession`
- **Value-based earnings model** (see Earnings Rate Card below)
- **Backend sync** — `POST /api/sync` called every 5 minutes via alarm with full sessions + totalEarnings + profile
- **Session data stored per domain per day:**
  - `domain`, `category`, `totalSeconds`, `visits`, `earned`
  - `brand`, `product`, `product_type`, `price_range`, `intent_score`, `keywords`, `search_type`
  - `location`, `job_title`, `travel_route`, `property_type`
  - `searchQueries[]`, `maxScrollDepth`, `pricesFound[]`, `breadcrumbs[]`, `pageTypes[]`
  - `deviceType`, `timeOfDay`, `visitHours[]`
- **Legacy data normalization** — handles old session objects missing new fields (arrays coerced, numbers defaulted)
- **Premium brands list** — 18 brands (Apple, BMW, Sony, Samsung, Nike, etc.) flagged for bonus earnings

### 3. Extension Manifest (`manifest.json`) ✅ UPDATED
- Added `scripting` permission
- Added `content_scripts` block: `content.js` injected at `document_idle` on `<all_urls>`

### 4. Extension Popup UI
- Shows **total earnings** (all time) and **today's earnings**
- **Category bars** — sorted by time, color-coded per category
- **AI Insight box** — calls `/api/insight` with today's category summary; 10-minute client-side cache
- **Dashboard button** — opens `localhost:5173`
- Fonts: Syne + DM Mono | Accent: `#00e5a0`

### 5. Extension Icons
- Logo: coin with dollar sign + padlock, outline style, `#00ffaa` on dark background
- Sizes: 16×16, 48×48, 128×128 PNG

### 6. Backend (`server.js`) ✅ UPGRADED

All endpoints:

| Method | Endpoint | Status | Description |
|---|---|---|---|
| POST | `/api/categorize` | ✅ | Legacy — domain + title → category only. Kept for backward compat. |
| POST | `/api/extract` | ✅ NEW | Full structured extraction via Gemini: category, brand, product, intent_score, keywords, price_range, search_type, location, job_title, travel_route, property_type. MD5-keyed in-memory cache. |
| POST | `/api/sync` | ✅ NEW | Receives full sessions + totalEarnings + profile from extension. Stored in-memory. |
| GET | `/api/profile/:userId` | ✅ NEW | Returns aggregated behavioral profile: topCategories, topBrands, segments, peakHour, isNightOwl, totalBrowsingHours, searchQueries, deviceType |
| GET | `/api/packages` | ✅ NEW | Returns 6 advertiser data packages with signals, dataFields, sampleData (3 rows each), pricing, formats |
| POST | `/api/insight` | ✅ | Gemini-generated 2-sentence insight from browsing summary. Category fallbacks on rate limit. |
| GET | `/api/health` | ✅ | Cache sizes + user count |

**Auto-assigned audience segments** (in `/api/profile`):
- `high_intent_shopper` — shopping > 30 min
- `finance_decision_maker` — finance > 15 min
- `tech_early_adopter` — technology > 30 min
- `property_seeker` — realestate > 10 min
- `job_seeker` — jobs > 10 min
- `travel_planner` — travel > 10 min
- `night_owl_shopper` — isNightOwl + shopping > 10 min

**6 Advertiser Data Packages** (from `/api/packages`):

| Package | Price | strongerAfterOnboarding |
|---|---|---|
| High Intent Shoppers | $299 | No |
| Cross-Platform Behavioral Profile | $399 | No |
| Finance Decision Makers | $499 | Yes — occupation 3x value lift |
| Tech Early Adopters | $199 | No |
| Real Estate Prospects | $449 | Yes — city makes it geo-targeted |
| Night Owl Impulse Buyers | $179 | No |

### 7. Dashboard (React + Vite)
- **Overview tab** — total earnings, top category, sites visited, AI insight, today's category breakdown
- **Browsing tab** — domain table with category pill, time, visits, earned
- **Insights tab** — AI insight card, data value breakdown by category
- **Wallet tab** — balance display, MetaMask connect button, withdraw placeholder
- Sidebar navigation with status dot
- Styling: `#0d0d0d` background, `#00e5a0` accent, Syne + DM Mono fonts
- **⚠️ Currently using demo/hardcoded data** — not yet connected to backend or extension storage

---

## What Has To Be Done (Priority Order)

### Priority 1 — Onboarding Flow ⭐ BLOCKS PACKAGE VALUE
**Status:** Not started
**Why first:** Every package has null demographic fields until onboarding runs. Finance Decision Makers and Real Estate Prospects are worth 3–10x more with occupation + city. This is the single highest-leverage task before the company dashboard launch.

**Flow:**
1. `chrome.runtime.onInstalled` fires → background.js opens `onboarding.html` in a new tab
2. **Step 1 — T&C / Consent** → user must click "I Agree" to proceed — no passive acceptance
3. **Step 2 — Demographics** → age range, gender, occupation
4. **Step 3 — Location** → geolocation request with ipapi fallback
5. On complete → data saved to `chrome.storage.local` → synced to backend via `/api/sync`

**T&C / Consent screen must disclose:**
- What is collected: browsing behavior (domains, time spent, categories, brands, search queries), demographics you provide, and approximate location
- How it's used: anonymized, aggregated into audience segments, sold to advertisers and market researchers
- Location disclosure: "We use your city-level location — from GPS if granted, or estimated from your IP address if not — to increase your data's value and your earnings"
- What you get: a share of every data sale, paid to your Reclaim wallet
- Link to full Terms of Service (placeholder page is fine for demo)

**Why this matters:** This consent screen is Reclaim's core legal and ethical differentiator. Meta, Google, and Instagram do all of the above silently. Reclaim shows users exactly what's being collected and pays them for it. This screen is a feature — use it in the YC demo narrative.

**Fields collected:**

| Field | Input Type | Values |
|---|---|---|
| `age_range` | Radio | Under 18 / 18–24 / 25–34 / 35–44 / 45+ |
| `gender` | Radio | Male / Female / Other / Prefer not to say |
| `occupation` | Dropdown | Student / Salaried / Business Owner / Freelancer / Other |

**Location strategy:**
1. Request `navigator.geolocation` with a clear "this helps us pay you more" explanation
2. If granted → use coords → call `https://ipapi.co/json/` with coords to reverse geocode → extract `city`, `region`, `country`
3. If denied → silently call `https://ipapi.co/json/` (IP-based) → extract same fields, no second prompt to user
4. Store as `userLocation: { city, region, country, source: "gps" | "ip" }`

**Storage schema (chrome.storage.local):**
```json
{
  "userProfile": {
    "age_range": "18-24",
    "gender": "M",
    "occupation": "Student",
    "onboardingComplete": true,
    "onboardingDate": "2026-05-02"
  },
  "userLocation": {
    "city": "Roorkee",
    "region": "Uttarakhand",
    "country": "India",
    "source": "ip"
  }
}
```

**What changes after onboarding:**
- `/api/sync` already sends `profile` + `location` to backend — no backend changes needed
- `/api/profile/:userId` already returns this data — no backend changes needed
- Package exports will now include real city + occupation instead of null

**Files to add/change:**
- `extension/onboarding/onboarding.html` — styled form matching extension aesthetic (`#0d0d0d`, `#00e5a0`, Syne + DM Mono)
- `extension/onboarding/onboarding.js` — form logic, geolocation, ipapi call, storage write
- `extension/background.js` — add `chrome.runtime.onInstalled` listener, check `onboardingComplete` flag before opening

---

### Priority 2 — Company Dashboard + Data Selling ⭐ CORE REVENUE FEATURE
**Status:** Backend `/api/packages` done ✅ — everything else not started

**What needs to be built:**

#### 2a. Company Dashboard Frontend (`Company.jsx`)
A separate route (`/company`) — the storefront where companies browse and buy packages.

**UI sections:**
- Header: "Buy Audience Data" with tagline
- Package cards grid — each card shows: name, tagline, userCount, price, signals list, formats, `strongerAfterOnboarding` badge if applicable
- Each card has a "Preview Data" button → opens modal with the 3 sampleData rows as a table
- "Purchase" button → triggers purchase flow
- Post-purchase: download button for CSV or JSON

**Files to add:**
- `dashboard/src/Company.jsx`
- `dashboard/src/App.jsx` — add `/company` route

#### 2b. Real Package Data Export (`/api/purchase`)
When a company purchases a package, they should download **real aggregated user data** from the system, not hardcoded samples.

**New backend endpoint: `POST /api/purchase`**
```json
Request:  { "packageId": "finance_decision_makers", "format": "csv" }
Response: file download (CSV or JSON)
```

**How each package maps to real data (what fields to pull from stored sessions):**

**High Intent Shoppers** — filter users where `shopping` sessions exist with `intent_score >= 7`. Export: `user_id`, `intent_score` (max), `top_brands` (from session.brand), `search_queries` (from session.searchQueries), `prices_viewed` (from session.pricesFound), `breadcrumbs`, `page_types` (from session.pageTypes), `scroll_depth` (session.maxScrollDepth), `visit_frequency` (session.visits), `age_range`, `gender`, `city`, `device`

**Cross-Platform Behavioral Profile** — all users with 3+ categories browsed. Export: `user_id`, `category_distribution` (% breakdown from sessions), `top_brands`, `all_search_queries`, `active_hours` (from visitHours), `peak_hour`, `device`, `avg_scroll_depth`, `total_browsing_hours`, `age_range`, `gender`, `occupation`, `city`

**Finance Decision Makers** — filter users where `finance` sessions exist with totalSeconds > 900. Export: `user_id`, `finance_platforms_visited` (domains in finance category), `search_queries`, `intent_score`, `finance_products_researched` (keywords from finance sessions), `visit_frequency`, `age_range`, `gender`, `occupation`, `city`, `device`

**Tech Early Adopters** — filter users where `technology` sessions > 1800 seconds. Export: `user_id`, `tech_tools_used` (domains in tech category), `ai_tools_used` (claude.ai, openai.com etc from sessions), `search_queries`, `dev_platforms_visited` (github, stackoverflow etc), `tech_browsing_hours`, `device`, `age_range`, `gender`, `occupation`, `city`

**Real Estate Prospects** — filter users with `realestate` sessions. Export: `user_id`, `property_platforms_visited`, `search_queries`, `property_types` (from session.property_type), `locations_searched` (from session.location), `intent_score`, `visit_frequency`, `age_range`, `gender`, `occupation`, `city`, `device`

**Night Owl Impulse Buyers** — filter users where `visitHours` contains hours 22–2 AND shopping/entertainment sessions exist. Export: `user_id`, `peak_shopping_hours` (late-night visitHours), `device`, `late_night_categories`, `late_night_brands`, `late_night_search_queries`, `avg_session_duration_night`, `age_range`, `gender`, `city`

**Files to change:**
- `backend/server.js` — add `POST /api/purchase` with per-package filter + export logic. CSV generation using manual string building (no new dependencies). JSON just `res.json()`.

#### 2c. Live userCount per package
Currently `userCount` is hardcoded. After `/api/sync` starts receiving real users, the packages endpoint should compute real counts.
- `backend/server.js` — in `GET /api/packages`, compute `userCount` per package by running the same filters against `userSessions` in memory

---

### Priority 3 — Connect Dashboard to Real Data
**Status:** Not started
**What:** Dashboard reads live data from backend instead of hardcoded demo values.
**Files to change:**
- `dashboard/src/App.jsx` — replace demo data with `fetch` calls to `GET /api/profile/:userId`
- `extension/popup/popup.js` — expose `userId` via `chrome.storage.local` so dashboard can read same ID
**Note:** `/api/sync` and `/api/profile` are already built. This is a frontend-only task.

---

### Priority 4 — Historical Data & Charts
**Status:** Not started
**Files to change:**
- `backend/server.js` — `/api/data/:userId` returns all sessions by date
- `dashboard/src/App.jsx` — add recharts line/bar chart to overview/insights tab

---

### Priority 5 — AI Suggestions Feature
**Status:** Not started
**Files to add:**
- `backend/server.js` — `POST /api/suggestions` using Gemini with full browsing profile as context
- `extension/popup/popup.js` — suggestions section in popup
- `dashboard/src/App.jsx` — suggestions feed on insights tab

---

### Priority 6 — User Authentication
**Status:** Not started. Not needed for single-user demo.

---

### Priority 7 — PostgreSQL Database
**Status:** Not started — intentionally deferred until post-funding.

---

### Priority 8 — Blockchain / Wallet Integration
**Status:** UI placeholder only (Connect Wallet button exists, non-functional).

---

### Priority 9 — Admin Panel
**Status:** Not started. Needs more research before implementation.

---

## Known Issues / Technical Debt

| Issue | Location | Priority | Status |
|---|---|---|---|
| Dashboard uses demo data, not real extension data | `dashboard/src/App.jsx` | High | Open |
| Settings page (`/settings`) not built | dashboard | Low | Open |
| No error boundary in React dashboard | `dashboard/src/App.jsx` | Low | Open |
| No rate limiting on API endpoints — can burn Gemini quota | `backend/server.js` | Medium | Open |
| `generate_icons.py` in extension root — should move to `/scripts` | repo structure | Low | Open |
| Extension doesn't handle offline backend gracefully | `extension/background.js` | Low | Open |
| `/api/categorize` returns only category (no structured data) | `backend/server.js` | High | ✅ Resolved — `/api/extract` added |
| Gemini quota burst on Chrome restart (no persistent cache) | `extension/background.js` | Medium | ✅ Resolved — 24hr cache in chrome.storage.local |
| Legacy session data missing new fields | `extension/background.js` | Medium | ✅ Resolved — normalization added |

---

## Earnings Rate Card

### Current Model — Value-Based (live in background.js v3)

**Base Rate (by category, per hour):**

| Category | Base Rate ($/hr) |
|---|---|
| Real Estate | $0.08 |
| Finance | $0.06 |
| Shopping | $0.05 |
| Health | $0.05 |
| Travel | $0.04 |
| Social | $0.02 |
| News | $0.02 |
| Entertainment | $0.02 |
| Technology | $0.02 |
| Food | $0.02 |
| Jobs | $0.03 |
| Education | $0.01 |
| Other | $0.005 |

**Bonus Multipliers (added on top of base):**

| Signal | Bonus | Source |
|---|---|---|
| Intent score 7–10 | +$0.001 × intent_score/hr | `/api/extract` |
| Any brand extracted | +$0.002/hr | `/api/extract` |
| Premium brand (Apple, BMW, Sony, etc.) | +$0.003/hr | `PREMIUM_BRANDS` list in background.js |
| Product type extracted | +$0.001/hr | `/api/extract` |
| Page type = checkout | +$0.010/hr | content.js |
| Page type = product | +$0.005/hr | content.js |
| Page type = search | +$0.002/hr | content.js |
| Same brand on 3+ domains today | +$0.005/hr | cross-site bonus in background.js |

---

## Environment Variables

```
# backend/.env
GEMINI_API_KEY=your_key_here
PORT=3000
```

---

## How to Run Locally

```bash
# Terminal 1 — Backend
cd reclaim/backend
node server.js

# Terminal 2 — Dashboard
cd reclaim/dashboard
npm run dev

# Extension
# Load reclaim/extension as unpacked extension in chrome://extensions
# After any background.js or content.js change: chrome://extensions → Reclaim → refresh icon
# To clear extension storage: Service Worker console → chrome.storage.local.clear()
```

---

## Notes for AI Agents

- Always read this document before making changes to understand current state
- Update the relevant section after completing any task
- The extension uses Manifest v3 — no background pages, only service workers
- All dashboard styling uses inline JS style objects (no CSS files) — keep consistent
- Extension accent color: `#00e5a0`, background: `#0d0d0d`, fonts: Syne + DM Mono
- Gemini model: `gemini-2.5-flash` (fallback to `gemini-2.0-flash` on quota issues)
- Backend: port 3000 | Dashboard: port 5173
- Do not add new npm dependencies without checking necessity first
- Known domains list in `server.js` avoids Gemini calls for top 80+ sites — always check/update this list before adding Gemini calls
- PostgreSQL is intentionally deferred — do not add it until explicitly instructed
- In-memory storage is intentional for current phase
- When Gemini hits rate limits (429/503), always fall back gracefully — never crash
- User IDs are generated as `usr_` + random string — no real PII stored
- `content.js` runs at `document_idle` on all URLs — keep it lightweight, no heavy DOM operations
- Extract cache is persisted in `chrome.storage.local` (not just memory) — survives Chrome restarts
- `pendingContentData` in background.js is in-memory only — clears on service worker restart (acceptable)
