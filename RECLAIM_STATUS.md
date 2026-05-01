# Reclaim — Project Status Document
> Last updated: 2026-05-02
> Version: 0.3.0
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
│   ├── background.js      # Service worker, tab tracking, data collection, /api/extract
│   └── manifest.json      # Manifest v3, permissions: tabs, storage, alarms, activeTab
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
    "product_type": "smartphone",
    "price_range": "premium",
    "intent_score": 8,
    "keywords": ["iPhone 15 Pro", "256GB", "Natural Titanium"]
  },
  "context": {
    "time_of_day": "evening",
    "day_of_week": "Saturday",
    "device": "Mac",
    "city": "Roorkee",
    "country": "India"
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
  "device": "Mac",
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
    "high_intent_electronics",
    "night_owl_browser",
    "premium_brand_researcher",
    "tech_early_adopter"
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

### Three Data Package Types (Company Dashboard)

1. **Audience Segment CSV** — anonymized user IDs + behavioral signals for ad platform upload
2. **Market Research Report** — aggregated trends, brand rankings, purchase journey insights
3. **Intent Signal API** — real-time feed of high-intent behavioral triggers

### How Companies Use the Data (AdTech Flow)

Companies don't need users' IP addresses or names. The flow works via:
- **Cookie/Device ID matching** — browser already stores advertiser cookies (Google, Meta). Identity resolution services (LiveRamp, The Trade Desk) bridge Reclaim's user IDs to ad platform IDs without exposing raw personal data.
- **Audience onboarding** — company uploads Reclaim's segment CSV to their ad platform → ads served to matched users across the web
- **Market research** — aggregated behavioral data sold as reports to brand teams

---

## What Has Been Done

### 1. Browser Extension
- **Tab tracking** — `chrome.tabs.onActivated`, `onUpdated`, `windows.onFocusChanged` listeners track active tab and duration
- **Periodic saves** — Chrome alarm fires every 30 seconds, saves session data to `chrome.storage.local`
- **Domain categorization** — `background.js` calls `/api/categorize` for each new domain; result cached in `chrome.storage.local` for 24 hours
- **Earnings calculation** — per-category earnings rates applied to time spent (finance: $0.10/hr, shopping: $0.08/hr, health: $0.07/hr, travel: $0.06/hr, social: $0.04/hr, news/entertainment: $0.03/hr, education/technology: $0.02-0.03/hr, other: $0.01/hr)
- **Data structure** — sessions stored by date key (`YYYY-MM-DD`) → domain → `{ domain, category, totalSeconds, visits, earned }`
- **Manifest v3** — service worker background, host permissions for `<all_urls>` and `http://localhost:3000/*`
- **Page title capture** — `background.js` captures `tab.title` alongside URL for richer categorization

### 2. Extension Popup UI
- Shows **total earnings** (all time) and **today's earnings**
- **Category bars** — sorted by time, color-coded per category (social=purple, tech=yellow-green, shopping=green, entertainment=red, etc.)
- **AI Insight box** — calls `/api/insight` with today's category summary; 10-minute client-side cache; falls back to category-specific hardcoded messages if backend down
- **Dashboard button** — opens `localhost:5173`
- **Settings button** — opens `localhost:5173/settings` (page not built yet)
- Fonts: Syne (headings/logo) + DM Mono (monospace data)
- Accent color: `#00e5a0`

### 3. Backend (Node.js/Express)
- **`POST /api/categorize`** — takes `{ domain, title }`, checks 60+ known domains list first (no API call), then calls Gemini for unknown domains, caches in memory for 24hrs
- **`POST /api/insight`** — takes `{ summary }` (category:minutes string), calls Gemini for a 2-sentence personalized insight; falls back to hardcoded category-specific messages on rate limit/error
- **`GET /api/health`** — returns status and cache size
- **Known domains list** — 80+ hardcoded popular domains (Amazon, Instagram, YouTube, Netflix, Zerodha, etc.) to avoid unnecessary Gemini API calls
- **CORS** — enabled for all origins (`*`)
- **Gemini model** — `gemini-2.5-flash` (fallback: `gemini-2.0-flash`)
- **Rate limit handling** — graceful fallback to hardcoded responses on 429/503 errors
- **In-memory storage** — currently stores data in process memory (intentional for demo; PostgreSQL planned post-funding)

### 4. Extension Icons
- Logo: coin with dollar sign + padlock, outline style, `#00ffaa` on dark background
- Sizes: 16×16, 48×48, 128×128 PNG

### 5. Dashboard (React + Vite)
- **Overview tab** — total earnings card, top category card, sites visited count, AI insight card, today's category breakdown with bars and earned amounts
- **Browsing tab** — table of top domains with category pill, time, visits, earned
- **Insights tab** — AI insight card with refresh button, data value breakdown by category
- **Wallet tab** — balance display, MetaMask connect button, withdraw placeholder
- Sidebar navigation with status dot
- Matches extension aesthetic: `#0d0d0d` background, `#00e5a0` accent, Syne + DM Mono fonts
- **Currently using demo/hardcoded data** — not yet reading from extension storage or backend

---

## What Has To Be Done (Priority Order)

### Priority 1 — Upgrade Data Extraction (domain + title → structured JSON)
**Status:** Not started
**What:** Replace `/api/categorize` with `/api/extract` that uses Gemini to pull structured data from page title. Returns category + brand + product type + intent score + keywords.
**Why:** Page title is the biggest quick win for data quality. "Apple iPhone 15 Pro 256GB - Amazon.in" tells brand, product, price range, intent. This makes the data 10x more valuable.
**Files to change:**
- `backend/server.js` — add `POST /api/extract` endpoint
- `extension/background.js` — call `/api/extract` instead of `/api/categorize`, store richer data object

---

### Priority 2 — Connect Dashboard to Real Data
**Status:** Not started
**What:** Extension pushes session data to backend on every periodic save. Backend stores in memory. Dashboard fetches from backend instead of demo data.
**Files to change:**
- `extension/background.js` — add POST to `/api/sync` after every `saveSession`
- `backend/server.js` — add `POST /api/sync` to store data, `GET /api/data` to return it, `GET /api/profile` to return aggregated user profile
- `dashboard/src/App.jsx` — replace demo data with `fetch` calls to `/api/profile`

---

### Priority 3 — Company Dashboard
**Status:** Not started
**What:** Separate page (route `/company`) showing 3 buyable data packages with preview, pricing, and simulated purchase + CSV/JSON/PDF download.
**Package types:**
1. High Intent Electronics Shoppers — CSV for ad activation — $299
2. Finance Decision Makers — Market Research Report PDF — $499
3. Entertainment Early Adopters — Intent Signal API — $199
**Files to add:**
- `dashboard/src/Company.jsx` — company-facing page
- `backend/server.js` — `GET /api/packages`, `POST /api/purchase` (simulated)
- CSV/JSON export generation logic in backend

---

### Priority 4 — Onboarding Flow
**Status:** Not started
**What:** First-run experience when extension is installed. Consent form, data collection opt-in, AI suggestion opt-in. Critical for legal defensibility and YC demo narrative.
**Files to add:**
- `extension/onboarding/onboarding.html` + `onboarding.js`
- `extension/background.js` — detect first install via `chrome.runtime.onInstalled`, open onboarding tab

---

### Priority 5 — Historical Data & Charts
**Status:** Not started
**What:** Weekly/monthly earnings trend chart on dashboard. Per-day breakdown.
**Files to change:**
- `backend/server.js` — `/api/data` returns all sessions by date
- `dashboard/src/App.jsx` — add recharts line/bar chart to overview/insights tab

---

### Priority 6 — AI Suggestions Feature
**Status:** Not started
**What:** Cross-site personalized recommendations — the core product differentiator. Uses cross-site browsing profile to give better suggestions than any single-site provider.
**Details:**
- Product recommendations across retailers (e.g. "You've been looking at AirPods on Amazon and Flipkart — here's the best deal right now")
- Personalized news/article feeds based on reading patterns
- Financial tips based on browsing patterns
**Files to add:**
- `backend/server.js` — `POST /api/suggestions` using Gemini with full browsing profile as context
- `extension/popup/popup.js` — suggestions section in popup
- `dashboard/src/App.jsx` — suggestions feed on insights tab

---

### Priority 7 — User Authentication
**Status:** Not started
**What:** Login/signup so data is tied to a specific user. JWT-based. Required before multi-user data persistence makes sense.
**Note:** Not needed for single-user demo. Build after first real users.
**Files to add:**
- `backend/server.js` — `POST /api/auth/register`, `POST /api/auth/login`, JWT middleware
- `dashboard/src/` — Login.jsx, Register.jsx
- `extension/background.js` — store and send auth token with API requests

---

### Priority 8 — PostgreSQL Database
**Status:** Not started — intentionally deferred
**Why deferred:** In-memory storage is sufficient for demo. PostgreSQL adds complexity without demo value. Add post-funding when real users need data persistence.
**What it will do:** Persist user profiles, session data, transaction logs across server restarts.
**Files to add when ready:**
- `backend/db.js` — PostgreSQL connection (pg library)
- Schema: `users`, `sessions`, `transactions`, `packages` tables
- `backend/server.js` — replace in-memory maps with DB queries

---

### Priority 9 — Blockchain / Wallet Integration
**Status:** UI placeholder only (Connect Wallet button exists, non-functional)
**What:** Smart contracts for automated payouts. 80% to users, 20% platform fee. MetaMask + Sepolia testnet for demo simulation.
**Files to add:**
- `contracts/` — Solidity smart contracts (escrow, distribution)
- `backend/server.js` — payment flow endpoints
- `dashboard/src/App.jsx` — complete wallet tab with MetaMask integration and withdrawal flow

---

### Priority 10 — Admin Panel
**Status:** Not started
**What:** Internal tools for data moderation, compliance checks, user management, AI model monitoring.
**Needs more research before implementation.**

---

## Known Issues / Technical Debt

| Issue | Location | Priority |
|---|---|---|
| Dashboard uses demo data, not real extension data | `dashboard/src/App.jsx` | High |
| `/api/categorize` returns only category — needs to return full structured extraction | `backend/server.js` | High |
| Gemini free tier quota exhausted quickly during testing | `backend/server.js` | Medium |
| No rate limiting on API endpoints — can burn Gemini quota fast | `backend/server.js` | Medium |
| Settings page (`/settings`) not built | dashboard | Low |
| No error boundary in React dashboard | `dashboard/src/App.jsx` | Low |
| Extension doesn't handle offline backend gracefully (shows fallback) | `extension/background.js` | Low |
| `generate_icons.py` in extension root — should move to `/scripts` | repo structure | Low |

---

## Earnings Rate Card

> ⚠️ **NEEDS UPDATE** — Current rates are flat per-category. Once `/api/extract` is built and returns `intent_score`, `brand`, `price_range`, the earnings model should be updated to value-based (base rate + intent bonus + brand bonus + cross-site bonus). See conversation history for the full revised model.


### Base Rate (by category, per hour)

| Category | Base Rate ($/hr) | Why |
|---|---|---|
| Finance | $0.06 | Investment/banking intent |
| Shopping | $0.05 | Purchase intent |
| Health | $0.05 | Pharma/wellness premium |
| Travel | $0.04 | Booking intent |
| Social | $0.02 | Behavioral signals |
| News | $0.02 | Content patterns |
| Entertainment | $0.02 | Subscription signals |
| Technology | $0.02 | B2B signals |
| Education | $0.01 | EdTech targeting |
| Other | $0.005 | Minimal value |

### Bonus Multipliers (added on top of base rate)

| Signal | Bonus | Why |
|---|---|---|
| Brand extracted from title | +$0.002/hr | Specific brand intent is more valuable |
| Premium brand (Apple, BMW, Sony etc.) | +$0.003/hr | Premium audience = higher CPM |
| Intent score 7-10 | +$0.001 × intent_score | High intent = near-purchase signal |
| Same product seen on 3+ sites in one day | +$0.005/hr | Cross-site comparison = highest intent |
| Product type extracted | +$0.001/hr | Structured data adds value |

### Example Earnings

| Behavior | Earnings |
|---|---|
| Scrolling Amazon homepage (30 min) | ~$0.025 |
| Viewing iPhone product page (10

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
# After any background.js change: chrome://extensions → Reclaim → refresh icon
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
