# Reclaim — Project Status Document
> Last updated: 2025-05-02
> Version: 0.2.0
> Repo: https://github.com/khatriadbhut/reclaim

---

## Project Summary

Reclaim is a self-data-selling platform where users monetize their browsing data through a Chrome browser extension. The extension tracks anonymized browsing metrics (domains visited, time spent, categories), aggregates them into insights, and sells them to companies. Users receive payments for contributing their data. An AI-powered suggestion engine provides personalized cross-site recommendations as an added value layer. Payments are handled via blockchain smart contracts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Browser Extension | Vanilla JS, WebExtension API (Manifest v3) |
| Extension UI | HTML, CSS (inline), DM Mono + Syne fonts |
| Dashboard Frontend | React + Vite (localhost:5173) |
| Backend | Node.js + Express (localhost:3000) |
| AI | Google Gemini API (gemini-2.5-flash) |
| Database | PostgreSQL (planned, not yet set up) |
| Blockchain | Ethereum/Solana + MetaMask (planned) |
| Hosting | AWS / Google Cloud (planned) |

---

## Repository Structure

```
reclaim/
├── backend/
│   ├── server.js          # Express server, Gemini API, /api/categorize, /api/insight
│   ├── package.json
│   └── .env               # GEMINI_API_KEY
├── extension/
│   ├── icons/
│   │   ├── icon16.png     # Coin+lock logo
│   │   ├── icon48.png
│   │   └── icon128.png
│   ├── popup/
│   │   ├── popup.html     # Extension popup UI
│   │   └── popup.js       # Popup logic, reads chrome.storage, calls /api/insight
│   ├── background.js      # Service worker, tab tracking, data collection, /api/categorize
│   └── manifest.json      # Manifest v3, permissions: tabs, storage, alarms, activeTab
└── dashboard/
    ├── index.html          # Loads Syne + DM Mono fonts, Vite entry
    ├── src/
    │   ├── App.jsx         # Full dashboard UI (overview, browsing, insights, wallet tabs)
    │   └── main.jsx        # React entry point
    └── package.json
```

---

## What Has Been Done

### 1. Browser Extension
- **Tab tracking** — `chrome.tabs.onActivated`, `onUpdated`, `windows.onFocusChanged` listeners track active tab and duration
- **Periodic saves** — Chrome alarm fires every 30 seconds, saves session data to `chrome.storage.local`
- **Domain categorization** — `background.js` calls `/api/categorize` for each new domain; result cached in `chrome.storage.local` for 24 hours
- **Earnings calculation** — per-category earnings rates applied to time spent (e.g., finance: $0.10/hr, shopping: $0.08/hr)
- **Data structure** — sessions stored by date key (`YYYY-MM-DD`) → domain → `{ domain, category, totalSeconds, visits, earned }`
- **Manifest v3** — service worker background, host permissions for localhost:3000

### 2. Extension Popup UI
- Shows **total earnings** (all time) and **today's earnings**
- **Category bars** — sorted by time, color-coded per category (social=purple, tech=yellow-green, etc.)
- **AI Insight box** — calls `/api/insight` with today's category summary; 10-minute client-side cache; fallback message if backend down
- **Dashboard button** — opens `localhost:5173`
- **Settings button** — opens `localhost:5173/settings` (page not built yet)
- Fonts: Syne (headings/logo) + DM Mono (monospace data)
- Accent color: `#00e5a0`

### 3. Backend (Node.js/Express)
- **`POST /api/categorize`** — takes `{ domain, title }`, checks known domains list first, then calls Gemini API, caches result in memory for 24hrs
- **`POST /api/insight`** — takes `{ summary }` (category:minutes string), calls Gemini for a 2-sentence personalized insight; falls back to hardcoded category-specific messages
- **`GET /api/health`** — returns status and cache size
- **Known domains list** — 60+ hardcoded popular domains (Amazon, Instagram, YouTube, etc.) to avoid unnecessary API calls
- **CORS** — enabled for all origins
- **Gemini model** — currently using `gemini-2.5-flash`
- **Error logging** — catch blocks log `err.message` to console

### 4. Extension Icons
- New logo: coin with dollar sign + padlock, outline style, `#00ffaa` on dark background
- Generated at 16×16, 48×48, 128×128 PNG using `sharp`
- Manifest updated to reference `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`

### 5. Dashboard (React + Vite)
- **Overview tab** — total earnings card, top category card, sites visited count, AI insight card, today's category breakdown with bars and earned amounts
- **Browsing tab** — table of top domains with category pill, time, visits, earned
- **Insights tab** — AI insight card with refresh button, data value breakdown by category
- **Wallet tab** — balance display, MetaMask connect button, withdraw placeholder (coming soon)
- Sidebar navigation with status dot
- Matches extension aesthetic: `#0d0d0d` background, `#00e5a0` accent, Syne + DM Mono fonts
- **Currently using demo/hardcoded data** — not yet reading from extension storage or backend

---

## What Has To Be Done (Priority Order)

### Priority 1 — Connect Dashboard to Real Data
**Status:** Not started
**What:** Extension should sync session data to backend on every periodic save. Backend stores it in memory (later DB). Dashboard fetches from backend API instead of using demo data.
**Files to change:**
- `extension/background.js` — add POST to `/api/sync` after every `saveSession`
- `backend/server.js` — add `POST /api/sync` endpoint to store data, `GET /api/data` to return it
- `dashboard/src/App.jsx` — replace demo data with `fetch` calls to `/api/data`

---

### Priority 2 — Historical Data & Charts
**Status:** Not started
**What:** Show weekly/monthly earnings trends as a line or bar chart on the dashboard. Show per-day breakdown.
**Files to change:**
- `backend/server.js` — `/api/data` should return all sessions by date, not just today
- `dashboard/src/App.jsx` — add a chart component (recharts or chart.js) to overview/insights tab

---

### Priority 3 — User Authentication
**Status:** Not started
**What:** Login/signup flow so data is tied to a specific user. JWT-based auth. Required before any backend data persistence makes sense.
**Files to add:**
- `backend/server.js` — `POST /api/auth/register`, `POST /api/auth/login`, JWT middleware
- `dashboard/src/` — Login.jsx, Register.jsx pages
- `extension/background.js` — store and send auth token with API requests

---

### Priority 4 — PostgreSQL Database
**Status:** Not started
**What:** Persist user profiles, session data, and transaction logs in PostgreSQL instead of in-memory storage.
**Files to add:**
- `backend/db.js` — PostgreSQL connection (pg library)
- Schema: `users`, `sessions`, `transactions` tables
- `backend/server.js` — replace in-memory storage with DB queries

---

### Priority 5 — Onboarding Flow
**Status:** Not started
**What:** First-run experience for new extension users. Consent form, data collection opt-in, AI suggestion opt-in. Opens a dedicated onboarding page.
**Files to add:**
- `extension/onboarding/onboarding.html` + `onboarding.js`
- `extension/background.js` — detect first install via `chrome.runtime.onInstalled`, open onboarding page

---

### Priority 6 — AI Suggestions Feature
**Status:** Not started
**What:** Cross-site personalized recommendations delivered via extension popup or dashboard. The core product differentiator — uses data from multiple sites to give better suggestions than single-site providers.
**Details:**
- Product recommendations across retailers
- Personalized news/article feeds
- Lifestyle/financial tips
**Files to add:**
- `backend/server.js` — `POST /api/suggestions` endpoint using Gemini with full browsing profile as context
- `extension/popup/popup.js` — add suggestions section to popup
- `dashboard/src/App.jsx` — dedicated suggestions feed on insights tab

---

### Priority 7 — Company Dashboard
**Status:** Not started
**What:** Separate web app (or route) for companies to browse and purchase anonymized data packages.
**Files to add:**
- `company-dashboard/` — new React app or route within dashboard
- `backend/server.js` — `/api/packages` endpoints (list, purchase)
- Data packaging logic — aggregate anonymized user data into sellable packages

---

### Priority 8 — Blockchain / Wallet Integration
**Status:** UI placeholder only (Connect Wallet button exists, non-functional)
**What:** Smart contracts for automated payouts. 80% to users, 20% platform fee. MetaMask integration for wallet connection and withdrawals.
**Files to add:**
- `contracts/` — Solidity smart contracts (escrow, distribution)
- `backend/server.js` — payment flow endpoints
- `dashboard/src/App.jsx` — complete wallet tab with real MetaMask integration and withdrawal flow

---

### Priority 9 — Admin Panel
**Status:** Not started
**What:** Internal tools for data moderation, compliance checks, user management, AI model monitoring.
**Needs more research before implementation.**

---

## Known Issues / Technical Debt

| Issue | Location | Priority |
|---|---|---|
| Dashboard uses demo data, not real extension data | `dashboard/src/App.jsx` | High |
| Gemini free tier quota exhausted quickly during testing | `backend/server.js` | Medium |
| No rate limiting on `/api/categorize` — can burn API quota fast | `backend/server.js` | Medium |
| Settings page (`/settings`) not built | dashboard | Low |
| No error boundary in React dashboard | `dashboard/src/App.jsx` | Low |
| Extension doesn't handle offline backend gracefully | `extension/background.js` | Low |

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
```

---

## Notes for AI Agents

- Always check this document before making changes to understand current state
- Update the relevant section of this document after completing any task
- The extension uses Manifest v3 — no background pages, only service workers
- All styling in the dashboard is inline JS objects (no CSS files) — keep it that way for consistency
- Extension accent color is `#00e5a0`, background is `#0d0d0d`, fonts are Syne + DM Mono
- Gemini model to use: `gemini-2.5-flash`
- Backend runs on port 3000, dashboard on port 5173
- Do not add new dependencies without checking if they're necessary
