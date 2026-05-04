# Reclaim — Project Status Document
> Last updated: 2026-05-04
> Version: 0.8.0
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
| Backend | Node.js + Express 5 (localhost:3000) |
| AI | Google Gemini API (gemini-2.5-flash) |
| Database | PostgreSQL (planned — not needed for demo, add post-funding) |
| Blockchain | Ethereum/Solana + MetaMask (planned — Sepolia testnet for demo) |
| Hosting | AWS / Google Cloud (planned) |

---

## Repository Structure

```
reclaim/
├── .env.example                 # Env template — see “Environment variables” below
├── .gitignore
├── README.md                    # Quick start, production URL checklist
├── RECLAIM_STATUS.md            # This file
├── backend/
│   ├── package.json
│   └── server.js                # Express: user + company APIs, Gemini, in-memory store
├── dashboard/
│   ├── .gitignore
│   ├── README.md
│   ├── eslint.config.js
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   │   └── icons.svg
│   └── src/
│       ├── App.jsx              # Path-based routes: / → Landing, /user → UserDashboard, /company → CompanyDashboard
│       ├── main.jsx
│       ├── pages/
│       │   ├── Landing.jsx
│       │   ├── UserDashboard.jsx
│       │   └── CompanyDashboard.jsx
│       └── ui/
│           └── constants.js     # BACKEND origin, shared styles, landing CSS
└── extension/
    ├── background.js            # Service worker: OAuth, extract, sync alarms, tab/session logic
    ├── content.js               # Page signals → background
    ├── generate_icons.py        # Optional asset helper
    ├── manifest.json            # MV3: tabs, storage, alarms, identity, scripting, content_scripts
    ├── icons/
    │   ├── icon16.png
    │   ├── icon48.png
    │   └── icon128.png
    ├── onboarding/
    │   ├── onboarding.html
    │   └── onboarding.js        # T&C, Google sign-in, demographics, location, sync
    ├── popup/
    │   ├── popup.html
    │   └── popup.js
    └── settings/
        ├── settings.html
        └── settings.js
```

---

## Environment variables (.env) — what’s the “issue”?

There is **no broken behavior**: the API loads **`backend/.env`** only (see `server.js` `dotenv.config`).

Common ways to create it:

| Approach | Command |
|---|---|
| From repo root | `cp .env.example backend/.env` then edit `backend/.env` |
| From `backend/` | `cp ../.env.example .env` then edit `.env` |

**Company dashboard** additionally needs `COMPANY_*` variables in `backend/.env` (see `.env.example`). Without them, `/company` OAuth will not work.

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

### 1. Browser Extension — Content Script (`content.js`) ✅
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

### 2. Browser Extension — Background Service Worker (`background.js`) ✅
- **Tab tracking** — `chrome.tabs.onActivated`, `onUpdated`, `windows.onFocusChanged` save session on tab switch
- **Periodic saves** — alarm every 30 seconds
- **Structured extraction** — calls `POST /api/extract` for domain + title; 24hr cache in `chrome.storage.local` keyed by domain/title prefix — persists across Chrome restarts to reduce Gemini quota use
- **Content script integration** — listens for `CONTENT_DATA` messages, accumulates into `pendingContentData[domain]`, merges on next `saveSession`
- **Value-based earnings model** (see Earnings Rate Card below)
- **Backend sync** — `POST /api/sync` on a 5-minute alarm with sessions + totalEarnings + profile
- **Google sign-in** — `chrome.identity` + `POST /api/auth/google`
- **Session fields** per domain per day: domain, category, time, visits, earned, extract fields, content signals, device/time-of-day metadata
- **Premium brands list** — bonus earnings for listed luxury / high-signal brands

### 3. Onboarding + settings ✅
- **`onboarding/`** — multi-step: T&C, Google sign-in (via background message), demographics, location (geolocation + fallback), success; persists profile and calls `/api/auth/user` + `/api/sync` as appropriate
- **`settings/`** — profile and account-related UI tied to same backend URLs
- **Install hook** — `onInstalled` opens onboarding tab (see `background.js`)

### 4. Extension Manifest (`manifest.json`) ✅
- MV3 service worker, `content_scripts`, `identity`, `scripting`, `host_permissions` including API origin in dev

### 5. Extension Popup UI ✅
- Earnings, category bars, AI insight (`POST /api/insight`), link to dashboard (`localhost:5173`)

### 6. Extension Icons ✅
- 16 / 48 / 128 PNG under `extension/icons/`

### 7. Backend (`server.js`) ✅

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/google` | Chrome identity token → user record |
| POST | `/api/auth/user` | Upsert user demographics / profile fields |
| GET | `/api/auth/user/:userId` | Read user |
| GET | `/api/company/auth/google/start` | Start web OAuth for companies |
| GET | `/api/company/auth/google/callback` | OAuth callback, session cookie |
| GET | `/api/company/auth/me` | Current company |
| POST | `/api/company/auth/logout` | Clear company session |
| POST | `/api/categorize` | Legacy category-only |
| POST | `/api/extract` | Structured Gemini extraction + cache |
| POST | `/api/sync` | Ingest sessions + earnings + profile from extension |
| GET | `/api/profile/:userId` | Aggregated profile + segments |
| GET | `/api/packages` | Public package catalog |
| POST | `/api/purchase` | Purchase flow (see implementation) |
| GET | `/api/company/packages` | Authenticated package list for company UI |
| GET | `/api/company/purchases` | Company purchase history |
| POST | `/api/company/purchase` | Company purchase |
| GET | `/api/company/download/:purchaseId` | Download export |
| POST | `/api/insight` | Short Gemini insight from summary |
| GET | `/api/health` | Health / counts |

**Storage:** in-memory maps for users, sessions, companies, purchases (resets on server restart).

**Auto-assigned audience segments** (in `/api/profile`):
- `high_intent_shopper` — shopping > 30 min
- `finance_decision_maker` — finance > 15 min
- `tech_early_adopter` — technology > 30 min
- `property_seeker` — realestate > 10 min
- `job_seeker` — jobs > 10 min
- `travel_planner` — travel > 10 min
- `night_owl_shopper` — isNightOwl + shopping > 10 min

### 8. Dashboard (React + Vite) ✅
- **`Landing.jsx`** — marketing landing at `/`
- **`UserDashboard.jsx`** at `/user` — reads **`chrome.storage.local`** when opened with extension APIs (same browser as extension); otherwise **demo sessions** for dev; **AI insight** always calls `BACKEND + /api/insight` when categories exist
- **`CompanyDashboard.jsx`** at `/company` — Google OAuth redirect flow, cookie auth, packages, purchases, download links — all against `BACKEND`
- Shared styling via `ui/constants.js` (`#0d0d0d`, `#00e5a0`, Syne + DM Mono)

---

## What Has To Be Done (Priority Order)

### Priority 1 — Production readiness
- **PostgreSQL** (or other durable store) — replace in-memory `users` / `userSessions` / company data
- **Rate limiting** — protect Gemini and auth endpoints
- **Deploy** — align `BACKEND_URL` / `BACKEND` / `manifest.json` host permissions / `COMPANY_OAUTH_REDIRECT_URL` / `COMPANY_DASHBOARD_ORIGIN` with real hosts (see root `README.md`)

### Priority 2 — User dashboard without extension context
- Optional: pass `userId` via query string and load **`GET /api/profile/:userId`** + synced session view so `/user` works in a normal browser tab for demos

### Priority 3 — Historical data and charts
- **`GET /api/data/:userId`** (or similar) for sessions by day; charts in dashboard (e.g. recharts)

### Priority 4 — AI suggestions (product roadmap)
- **`POST /api/suggestions`** + surfaces in popup and dashboard insights

### Priority 5 — Withdrawals / on-chain payouts
- UI currently labels blockchain / withdraw as **coming soon**; implement when product/legal ready

### Priority 6 — Admin panel
- Not started; needs product spec

---

## Known Issues / Technical Debt

| Issue | Location | Priority | Status |
|---|---|---|---|
| User `/user` page uses demo data when `chrome.storage` unavailable | `dashboard/src/pages/UserDashboard.jsx` | Medium | Open |
| No error boundary in React dashboard | `dashboard/src/App.jsx` | Low | Open |
| No rate limiting on API — can burn Gemini quota | `backend/server.js` | Medium | Open |
| `popup.js` hardcodes API origin in one `fetch` | `extension/popup/popup.js` | Low | Open |
| Extension offline / backend down — partial error messaging only | `extension/*` | Low | Open |
| `/api/categorize` legacy | `backend/server.js` | Low | Superseded by `/api/extract` |
| Extract cache in `chrome.storage.local` | `extension/background.js` | — | ✅ Mitigates quota burst |

---

## Earnings Rate Card

### Current Model — Value-Based (live in background.js)

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

Create **`backend/.env`** (never commit secrets). Minimum for extension + user insight:

```env
GEMINI_API_KEY=your_key_here
PORT=3000
```

For **Reclaim Business** (`/company`):

```env
COMPANY_GOOGLE_CLIENT_ID=
COMPANY_GOOGLE_CLIENT_SECRET=
COMPANY_OAUTH_REDIRECT_URL=http://localhost:3000/api/company/auth/google/callback
COMPANY_COOKIE_SECRET=
COMPANY_DASHBOARD_ORIGIN=http://localhost:5173
```

Full variable list and comments: **`.env.example`** at repo root.

---

## How to Run Locally

```bash
# Terminal 1 — Backend
cd reclaim/backend
cp ../.env.example .env
# Edit .env — set GEMINI_API_KEY (and COMPANY_* if using /company)
npm install
npm start

# Terminal 2 — Dashboard
cd reclaim/dashboard
npm install
npm run dev

# Extension — chrome://extensions → Load unpacked → reclaim/extension
# After background.js or content.js changes: reload extension
# Clear storage: DevTools on service worker → chrome.storage.local.clear()
```

---

## Notes for AI Agents

- Read this document before large changes
- Update the relevant section after completing a task
- Manifest v3 — service worker only for background
- Dashboard styling: inline / `constants.js` objects — keep visual consistency
- Extension accent: `#00e5a0`, background: `#0d0d0d`, fonts: Syne + DM Mono
- Gemini model in code: **`gemini-2.5-flash`** — handle 429/503 gracefully in all call sites
- Backend: port **3000** | Dashboard dev: **5173**
- Avoid new npm dependencies unless necessary
- `KNOWN_DOMAINS` in `server.js` reduces Gemini calls — update with care
- PostgreSQL deferred until explicitly requested
- In-memory server storage is intentional for the current phase
- User IDs: `usr_` prefix + random string
- `content.js` must stay lightweight (`document_idle`, all URLs)
- Extract cache persists in `chrome.storage.local`
- `pendingContentData` in background is in-memory only (clears on worker restart)
