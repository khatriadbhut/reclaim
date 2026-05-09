# Reclaim — Project Status Document
> Last updated: 2026-05-09
> Version: 0.11.0
> Repo: https://github.com/khatriadbhut/reclaim

---

## Project Summary

Reclaim is a consent-based browsing intelligence platform. A **Chrome extension (Manifest v3)** captures structured session signals (domains, time, categories, Gemini-backed extraction, content signals). A **Node backend** aggregates profiles and **audience packages** that **companies** can discover, purchase, and export (**Reclaim Business** — primary revenue path). A **React + Vite dashboard** serves marketing (`/`), the signed-in user view (`/user`), and the company storefront (`/company`).

End users get transparency, category insights, and modeled earnings in the extension popup and user dashboard; **payouts / on-chain settlement** remain roadmap (UI may reference “coming soon”). An **AI insight** line (Gemini) summarizes browsing patterns in popup and dashboard when the backend is available.

**Core positioning:** Incumbents monetize behavioral data without paying signal owners. Reclaim aligns incentives: consent-first collection, user-facing dashboard, and **B2B packages** (CSV/JSON exports) for buyers who need segments without raw surveillance optics.

**Competitors / analogs:** Caden, Datacy, panel apps, bandwidth-sharing apps. Differentiation in-repo today: **extension depth** (extraction + content signals + session economics) plus a **live company purchase path** on the dashboard.

### Vs. traditional data brokers

Large brokers often combine many feeds (panels, partnerships, resale markets). Strengths are frequently **historical scale** and **existing buyer relationships**. Reclaim is not claiming better-on-every-axis; the wedge is different:

- **Provenance:** Data flows from users who **opt in** to structured collection via the extension—easier to explain internally (legal, procurement, brand safety) than opaque resale graphs.
- **Signal shape:** When liquidity exists, exports can include **interpretable behavioral features** (domains, dwell time, categories, extraction-backed fields)—not only cohort membership or probabilistic IDs.
- **Tradeoffs:** Paying users raises **supply-side cost** versus models that monetize data without sharing economics downstream. The upside is **alignment** and **defensibility** of what gets sold.
- **Win condition:** Strongest where buyers prioritize **consent clarity + explainability + freshness** for specific segments—subject to reaching enough opted-in users in those segments.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Browser Extension | Vanilla JS, WebExtension API (Manifest v3) |
| Extension UI | HTML, CSS (inline), DM Mono + Syne fonts |
| Dashboard Frontend | React + Vite (localhost:5173) |
| Backend | Node.js + Express 5 (localhost:3000) |
| AI | Google Gemini API (gemini-2.5-flash) |
| Database | PostgreSQL (**next milestone** — backend still in-memory for dev/demo) |
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
    ├── background.js            # Service worker: OAuth, extract, classify, sync, tab/session; ALLOWED_DASHBOARD_ORIGINS for external API
    ├── content.js               # Page signals → background (all URLs, document_idle)
    ├── dashboard-bridge.js      # Vite dashboard only: extension id meta + postMessage storage bridge
    ├── generate_icons.py        # Optional asset helper
    ├── manifest.json            # MV3: externally_connectable, dual content_scripts (bridge + content)
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
- **Vite dashboard ↔ extension (externally_connectable)** — `onMessageExternal` / `onConnectExternal` answer `RECLAIM_GET_STORAGE` with `chrome.storage.local` keys needed by `/user` (no redundant URL block on sender; manifest `matches` already scopes origins)
- **`OPEN_USER_DASHBOARD`** — internal message from popup/onboarding: resolves dashboard URL (`reclaimDashboardUserUrl` in storage, else any open `localhost`/`127.0.0.1` :5173 tab origin, else `http://localhost:5173/user`), focuses existing `/user` tab or creates one

### 3. Onboarding + settings ✅
- **`onboarding/`** — multi-step: T&C, Google sign-in (via background message), demographics, location (geolocation + fallback), success; persists profile and calls `/api/auth/user` + `/api/sync` as appropriate
- **Final step (“Start earning”)** — saves `onboardingComplete`, posts `/api/sync` with **15s abort timeout** (so a hung backend cannot block completion), sends **`OPEN_USER_DASHBOARD`** to background, then closes the **onboarding tab** via `chrome.tabs.getCurrent()` (avoids removing the newly focused `/user` tab, which previously left the UI stuck on “saving…”)
- **`settings/`** — profile and account-related UI tied to same backend URLs
- **Install hook** — `onInstalled` opens onboarding tab (see `background.js`)

### 4. Extension — Dashboard bridge (`dashboard-bridge.js`) ✅
- Injected only on `http://localhost:5173/*` at **`document_start`**
- Injects `<meta name="reclaim-extension-id" content="…">` so the page can call `chrome.runtime.connect` / `sendMessage` to the extension id
- Listens for `postMessage` `GET_EXTENSION_STATE` from the dashboard and replies with `EXTENSION_STATE` + payload from `chrome.storage.local` (fallback when external messaging is flaky)

### 5. Extension Manifest (`manifest.json`) ✅
- MV3 service worker, **dual** `content_scripts` (dashboard bridge on dev dashboard origins + `content.js` on `<all_urls>`), `identity`, `scripting`, `host_permissions`, **`externally_connectable`** for dev dashboard origins

### 6. Extension Popup UI ✅
- Logged-out / logged-in views, Google sign-in via background `SIGN_IN`
- Earnings, category bars, AI insight (`POST /api/insight` — currently hardcoded `http://localhost:3000` in one call site)
- **Dashboard** button → `chrome.runtime.sendMessage({ type: "OPEN_USER_DASHBOARD" })` (tab open/focus handled in background; optional `chrome.storage.local.reclaimDashboardUserUrl` override)

### 7. Extension Icons ✅
- 16 / 48 / 128 PNG under `extension/icons/`

### 8. Backend (`server.js`) ✅

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
| POST | `/api/classify-visit` | Merge domain rollup + visit signals; attach vendor IAB + IAB Content Taxonomy mappings |
| GET | `/api/domain-lookup/quota` | WhoisXML free-tier usage status (per API key) |
| POST | `/api/sync` | Ingest sessions + earnings + profile from extension |
| GET | `/api/profile/:userId` | Aggregated profile + segments |
| GET | `/api/packages` | Public package catalog (metadata + samples; **no live user counts**) |
| POST | `/api/registry-domain-categories` | Batch read of pinned domains from `domain-categories.json` (rate-limited; for dashboard label refresh) |
| GET | `/api/company/packages` | Authenticated package list for company UI (**includes live segment counts**) |
| GET | `/api/company/purchases` | Company purchase history |
| POST | `/api/company/purchase` | Company purchase (curated package) |
| POST | `/api/company/purchase/custom` | Custom module purchase (server-computed price) |
| GET | `/api/company/custom-pricing` | Base + per-module USD + export column names |
| GET | `/api/company/download/:purchaseId` | Download export |
| POST | `/api/insight` | Short Gemini insight from summary |
| GET | `/api/health` | Liveness (`{ "status": "ok" }` only) |

**Storage:** in-memory maps for users, sessions, companies, purchases (resets on server restart).

**Security / deployment (summary):**

- **`NODE_ENV=production`** enables strict CORS (no wildcard): allowed origins are localhost dashboard, optional **`ALLOWED_PUBLIC_ORIGINS`** (comma-separated), and `chrome-extension://…` extension IDs.
- **`POST /api/auth/google`** requires **`RECLAIM_EXT_OAUTH_CLIENT_ID`** and always validates the Chrome access token via Google **tokeninfo** (`aud` must match).
- **`USER_API_SECRET`**: required when **`SECURITY_STRICT=1`**; signs user API bearer tokens. In non-strict dev without an explicit secret, the server may generate one at startup (set explicitly for stable sessions).
- **`TRUST_PROXY=1`**: set when the API sits behind AWS ALB / another reverse proxy so rate limits see the real client IP.
- **`GET /api/packages`** no longer exposes aggregate user counts; **`GET /api/company/packages`** still does (authenticated).
- Insight **`summary`** is normalized, length-capped, and embedded in prompts in a safer shape to reduce prompt-injection surface (model risk remains non-zero by nature).

**Domain category consistency:**

- **`lookupDomainRollup`** hits **`domain-categories.json`** first; when `domain_source` is **`registry`**, **`/api/classify-visit`** **pins** the final category (visit/page merge cannot override). The classify cache key includes the current registry category so JSON fixes invalidate stale cached responses.
- **Extension** `saveSession`: after classify, the latest **`category`** (and related IAB fields) are **copied to every stored day** for that domain so one revisit corrects historical rows in `chrome.storage`.
- **User dashboard** (`/user`): loads registry overlays via **`POST /api/registry-domain-categories`** so UI matches pinned JSON even before a revisit (requires backend reachable from the dashboard).

**Robust domain categorization (WhoisXML + persistent cache + conservative heuristic fallback)**

Goal: reduce the number of visits stuck in `other` while staying quota-aware and avoiding “category flapping” (the same domain bouncing between buckets).

#### 1) Categorization pipeline (in order)

For a given `domain` (and optional `title`, `url`), `server.js` computes a **domain rollup** using this order:

1. **Registry mapping** (`backend/domain-categories.json`)
   - Fast, deterministic internal mapping.
   - `domain_source: "registry"`
2. **Persistent enrichment cache** (`backend/domain-enrichment.json`)
   - Stores vendor output so we don’t re-call WhoisXML for the same domain across devices.
   - `domain_source: "enrichment_store"`
   - If cached vendor categories exist, we also attach `iab_provider` + `iab_categories` (for export enrichment).
3. **In-memory cache (TTL)** (`categoryCache`)
   - Prevents repeated work within the same server process.
   - `domain_source` reflects the cached prior source (e.g. `whoisxml_unmapped`, `heuristic`, etc.)
4. **Title/URL heuristic (conservative scored fallback)**
   - Uses *domain tokens + title tokens + URL path tokens*.
   - Filters gibberish/tracking tokens (hash-like ids, long numeric strings, query params).
   - Only returns a category when there is a **clear winner** above a threshold (avoids random URL words causing misclassification).
   - `domain_source: "heuristic"`
5. **WhoisXML Website Categorization API (optional, quota-limited)**
   - Called only if `WHOISXML_API_KEY` is set and usage quota allows.
   - Stores top vendor categories (confidence-sorted) and a strict mapped rollup when mapping is confident.
   - `domain_source: "whoisxml"` if a strict rollup mapping succeeded.
   - `domain_source: "whoisxml_unmapped"` if vendor categories exist but mapping didn’t land into our 13 buckets.
   - `domain_source: "whoisxml_no_categories"` if vendor returns no usable categories (including `Uncategorized` with 0 confidence).
6. **Gemini domain lookup (optional tie-breaker)**
   - Only if `ALLOW_GEMINI_DOMAIN_LOOKUP=1`
   - Used for unknown domains that still can’t be categorized by the steps above.
   - `domain_source: "gemini" | "gemini_low_confidence" | "gemini_error" | "gemini_reject"`

This domain rollup then flows into `POST /api/classify-visit`, where it is merged with **page evidence** (pageTypes / checkout/product/prices, etc.) to produce the final `category`.

#### 2) Why popular sites can still show as `other`

Even famous domains can fail vendor categorization because the vendor has to fetch/interpret the site at that moment:

- Bot protection / WAF blocks
- Heavy JS rendering or aggressive redirects
- Region variants behaving differently (`.co.in` vs `.com`)
- Vendor simply returning `Uncategorized` with confidence 0

This is exactly why we added a strong **title + URL path heuristic**: if the vendor returns empty/uncategorized, we can still classify many visits correctly based on page context (e.g. “Job Search / Salaries” → `jobs`, “Cheap Flights & Hotels” → `travel`).

#### 3) Caching behavior (and why “other” won’t get stuck)

We cache vendor outputs for quota efficiency, but we avoid freezing bad results:

- **Persistent vendor cache** (`domain-enrichment.json`) prevents repeated WhoisXML calls.
- **Local remap upgrade**: if we previously saved vendor categories but mapped them to `other`, we can re-run the mapping locally after rule improvements and “upgrade” `other → <bucket>` without burning additional quota.
- **Uncategorized/empty vendor handling**: if the vendor output is effectively empty (only `Uncategorized` or confidence 0), we treat it as `whoisxml_no_categories` and allow heuristic fallback rather than persisting “fake” categories.

#### 4) Clash prevention (important)

The heuristic is intentionally conservative and **only used as an override when the result would otherwise be `other`**. If a domain is already confidently categorized (e.g. `travel`, `jobs`, `finance`), the heuristic does not override it—preventing category clashes.

#### 5) Env knobs (tunable)

- `WHOISXML_API_KEY`: enables vendor categorization (quota-limited)
- `WHOISXML_FREE_LIMIT`: used for quota tracking/status endpoint (default 100)
- `WHOISXML_MIN_CONFIDENCE`: strict mapping threshold (default tuned to be practical; raise to be more conservative)
- `ALLOW_GEMINI_DOMAIN_LOOKUP`: if `1`, allows Gemini as a final tie-breaker for unknown domains

#### 6) How to verify quickly (dev)

Run `/api/classify-visit` with a realistic `title` + `url` and inspect `.category` and `.domain_source`:

```bash
curl -s -X POST http://localhost:3000/api/classify-visit \
  -H 'Content-Type: application/json' \
  -d '{"domain":"glassdoor.co.in","title":"Job Search | Salaries | Company Reviews","url":"https://www.glassdoor.co.in/Job/index.htm","pageType":"homepage","pageTypes":["homepage"]}' \
  | jq '.category,.domain_source'
```

Expected behavior:
- Vendor failures should show `domain_source: "heuristic_override"` when the title/url signals are strong.
- Vendor successes should show `domain_source: "whoisxml"` or `domain_source: "enrichment_store"` and should **not** be overridden unless they were `other`.

**Auto-assigned audience segments** (in `/api/profile` and on exports):

- **Rollup segments** (internal 13-category buckets):
  - `high_intent_shopper` — shopping > 30 min
  - `finance_decision_maker` — finance > 15 min
  - `tech_early_adopter` — technology > 30 min
  - `property_seeker` — realestate > 10 min
  - `job_seeker` — jobs > 10 min
  - `travel_planner` — travel > 10 min
  - `night_owl_shopper` — isNightOwl + shopping > 10 min

- **IAB Content Taxonomy v3 (tier-1) time segments** (parallel enrichment layer):
  - Computed from mapped IAB Content Taxonomy nodes attached per visit (via `/api/classify-visit`)
  - Examples: `iab_shopping_core`, `iab_travel_core`, `iab_technology_core`, plus “dominant audience” flags based on share-of-time

Exports include:
- `audience_segments` (merged rollup + IAB)
- `audience_segments_rollup` (rollup-only)
- `audience_segments_iab` (IAB-only)

### 9. Dashboard (React + Vite) ✅
- **`Landing.jsx`** — marketing landing at `/` (consumer + **Reclaim Business** paths; positioning line: consent-aware / anonymized packages / businesses)
- **`UserDashboard.jsx`** at `/user` — **Not** raw `chrome.storage` in the page on localhost (DevTools “fake” storage). On **`127.0.0.1` / `localhost`**: (1) wait for extension id (`?ext=` if valid 32-char id, else meta from bridge), (2) **`chrome.runtime.connect` / `sendMessage`** to read storage via **`externally_connectable`**, (3) **`postMessage`** bridge to `dashboard-bridge.js` as fallback; wall-clock polling (not `requestAnimationFrame`-only) so background tabs still authenticate before timeout. Elsewhere / future hosted origin: direct `chrome.storage.local` when the API exists. Merges **`POST /api/registry-domain-categories`** into today’s breakdown and top-sites rows so pinned **`domain-categories.json`** labels show even when stored sessions are stale. **AI insight** uses the extension to call **`/api/insight`**. Sign-in gate when no extension session is readable.
- **`CompanyDashboard.jsx`** at `/company` — Google OAuth (web), cookie session, **curated packages** (columns, good-for, signals from API) vs **custom export** (per-module builder with export-column chips, order summary, server-priced totals). Purchase history table with download links. **Pricing:** server is source of truth for custom (`CUSTOM_PACKAGE_BASE_USD`, per-module map); client displays USD consistently. Exports are pseudonymous (**no legal names** in audience files by design).
- Shared styling via `ui/constants.js` (`BACKEND`, `#0d0d0d`, `#00e5a0`, Syne + DM Mono, category colors, etc.)

### 10. Company / B2B backend flows ✅ (still in-memory storage)
- **`POST /api/company/purchase/custom`** — validates category ids, **computes price server-side**, builds rows via `buildCustomPackageRows`.
- **`GET /api/company/custom-pricing`** — base USD + per-category prices + export column names (for API consumers).
- **`/api/sync`** can persist **`visitLog`** segments → **`visit_segments_30d`** on company exports when the extension sends them.
- Shared **`buildPackageRows`** / **`buildCustomPackageRows`** for CSV/JSON downloads with pseudonymous `user_id` scoping per company.

### 11. Query-derived export helpers ✅
Some packages and custom modules export raw `*_search_queries`. In addition, exports include keyword-derived helper fields so buyers can filter/aggregate without parsing the raw strings:

- **Intent level**: `<prefix>_query_intent_level` (`none|low|medium|high`)
- **Reasons** (keyword buckets): `<prefix>_query_intent_reasons` (e.g. `price`, `deal`, `coupon`, `compare`, `review`, `checkout`, `delivery`)
- **Topics** (coarse): `<prefix>_query_topics` (e.g. `electronics`, `fashion`, `food_delivery`, `finance`, `real_estate`)
- **Counts**: `<prefix>_query_keyword_hits`

### 12. Curated package quality guardrails ✅
- **Night Owl Impulse Buyers** now requires **late-night commerce intent** (shopping/product/checkout/prices/high intent) and only exports late-night commerce queries (not unrelated late-night browsing queries).

---

## What Has To Be Done (Priority Order)

### Priority 1 — Ship-ready infra (in progress / next)
- **PostgreSQL** — replace in-memory `users` / `userSessions` / `userVisitLogs` / companies / purchases; migrations; seed data for demos.
- **Chrome Web Store** — packaged MV3 extension, listing copy, privacy policy, permissions justification; move teams off “Load unpacked” for judges/users.
- **Rate limiting** — protect Gemini and auth endpoints
- **Deploy** — align `BACKEND_URL` / `BACKEND` / `manifest.json` host permissions / `COMPANY_OAUTH_REDIRECT_URL` / `COMPANY_DASHBOARD_ORIGIN` with real hosts (see root `README.md`)

### Priority 2 — User dashboard without extension context
- Optional: server session or `userId` query + **`GET /api/profile/:userId`** + synced session view so `/user` works in a normal browser tab for investor demos (bridge + external messaging already cover extension-installed Chrome)

### Priority 3 — Historical data and charts
- **`GET /api/data/:userId`** (or similar) for sessions by day; charts in dashboard (e.g. recharts)

### Priority 4 — AI suggestions (product roadmap)
- **`POST /api/suggestions`** + surfaces in popup and dashboard insights

### Future — Prompt-driven custom packages (not started)
- Persist a canonical event log (JSONL/S3 or Postgres) and add a controlled “package spec” format.
- Add an AI agent later to translate buyer prompts → package spec → exports, with strict allowlists and auditability.

### Priority 5 — Withdrawals / on-chain payouts
- UI currently labels blockchain / withdraw as **coming soon**; implement when product/legal ready

### Priority 6 — Admin panel
- Not started; needs product spec

---

## Known Issues / Technical Debt

| Issue | Location | Priority | Status |
|---|---|---|---|
| `/user` still requires extension + bridge (or external messaging) in dev; no server-backed “demo user” session yet | `dashboard/src/pages/UserDashboard.jsx` | Medium | Open |
| No error boundary in React dashboard | `dashboard/src/App.jsx` | Low | Open |
| API rate limits + AI-specific limiter; registry batch limiter | `backend/server.js` | Medium | Mitigated (tune for prod) |
| `popup.js` hardcodes `http://localhost:3000` for `/api/insight` | `extension/popup/popup.js` | Low | Open |
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
# Chrome extension OAuth client ID (same as manifest oauth2.client_id) — required for /api/auth/google
RECLAIM_EXT_OAUTH_CLIENT_ID=
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

## Notes for maintainers

- Read this document before large refactors; update the relevant section when behavior changes.
- Manifest v3 — service worker only for background.
- Dashboard styling: inline / `constants.js` objects — keep visual consistency.
- Extension accent: `#00e5a0`, background: `#0d0d0d`, fonts: Syne + DM Mono.
- Gemini model in code: **`gemini-2.5-flash`** — handle 429/503 gracefully in all call sites.
- Backend: port **3000** | Dashboard dev: **5173**.
- Avoid new npm dependencies unless necessary.
- `KNOWN_DOMAINS` in `server.js` reduces Gemini calls — update with care.
- **PostgreSQL + Web Store** are the next major milestones; in-memory storage remains until then.
- User IDs: `usr_` prefix + random string; company exports use scoped pseudonymous ids.
- `content.js` must stay lightweight (`document_idle`, all URLs).
- Extract cache persists in `chrome.storage.local`.
- `pendingContentData` in background is in-memory only (clears on worker restart).
- **Popup / onboarding** must not duplicate tab-open logic: use **`OPEN_USER_DASHBOARD`** in `background.js` so `reclaimDashboardUserUrl` and focus/reuse behavior stay consistent.
- **`dashboard-bridge.js`** + **`externally_connectable`** are both required for reliable `/user` auth on the Vite dev server; changing one without the other often breaks the gate.
- **Company pricing:** keep `CUSTOM_CATEGORY_PRICE_USD` / `CUSTOM_PACKAGE_BASE_USD` in `server.js` aligned with `DATA_CATEGORIES` prices in `dashboard/src/pages/CompanyDashboard.jsx`.
