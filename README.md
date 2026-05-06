# Reclaim

> Your data. Your money.

Reclaim is a Chrome extension (Manifest V3) plus a small API server. Users opt in, browsing signals sync to the backend, and earnings plus AI insights show up in a web dashboard. A separate **Reclaim Business** area on the same site lets companies sign in with Google (web OAuth), buy **curated or custom** data packages (**pricing set on the server**), and download CSV/JSON.

**Compared with traditional data brokers:** many incumbents monetize aggregated or opaque audience graphs with limited visibility for end users. Reclaim starts from **explicit opt-in** and builds **structured, session-level signals** (categories, time-on-site, extraction-backed fields) that buyers can often reason about more clearly—especially where **provenance, explainability, and compliance posture** matter. Scale still depends on growing opt-in users in the segments buyers need; see **[RECLAIM_STATUS.md](./RECLAIM_STATUS.md)** for the fuller positioning.

## Repository layout

```
reclaim/
├── extension/           # Chrome extension (load unpacked)
│   ├── manifest.json
│   ├── background.js    # Service worker — auth, sync, alarms
│   ├── content.js
│   ├── popup/
│   ├── onboarding/    # First-run wizard (opens in a tab)
│   └── settings/
├── backend/             # Node.js + Express API
│   ├── server.js
│   ├── package.json
│   └── .env             # you create this (see Setup)
├── dashboard/           # React + Vite (landing, /user, /company)
│   └── src/
└── .env.example         # template — copy to backend/.env
```

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **Chrome** (Chromium) for the extension
- **Google Cloud** project if you want real sign-in:
  - One **Chrome extension** OAuth client (for `manifest.json` → `oauth2.client_id`)
  - Optionally a second **Web application** OAuth client for company login (see `.env.example`)

## Quick start (local development)

### 1. Backend API

```bash
cd backend
cp ../.env.example .env
# Edit .env: set GEMINI_API_KEY at minimum (get a key from Google AI Studio / Gemini API).
npm install
npm start
```

Server listens on **http://localhost:3000** by default. The extension and dashboard are hard-coded to that URL in dev (see “Changing URLs” below).

### 2. Dashboard (optional but recommended)

```bash
cd dashboard
npm install
npm run dev
```

Opens **http://localhost:5173** — landing at `/`, user dashboard at `/user`, company dashboard at `/company`.

### 3. Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → choose the `extension/` folder
4. Replace `oauth2.client_id` in `extension/manifest.json` with your **Chrome extension** OAuth client ID from Google Cloud (or keep the bundled ID only if you are explicitly using that project).

**Extension OAuth client (Google Cloud Console)**

- Application type: **Chrome extension**
- Paste the extension ID from `chrome://extensions` (Developer mode → ID under the extension name)
- Authorized JavaScript origins / redirect URIs follow Google’s Chrome extension OAuth docs

**First run:** the service worker opens `extension/onboarding/onboarding.html` in a tab. Sign-in talks to `POST /api/auth/google` on your backend; keep the backend running or sign-in will time out.

### 4. Company dashboard (optional)

If you use **Reclaim Business** (`/company`), set the `COMPANY_*` variables in `backend/.env` (see `.env.example`) and use a **Web application** OAuth client whose redirect URI is exactly:

`http://localhost:3000/api/company/auth/google/callback`

`COMPANY_DASHBOARD_ORIGIN` must match the dashboard origin (e.g. `http://localhost:5173`).

## Environment variables

| Variable | Required for | Purpose |
|----------|----------------|---------|
| `GEMINI_API_KEY` | AI insights | Gemini model calls |
| `PORT` | API | Listen port (default 3000) |
| `COMPANY_GOOGLE_CLIENT_ID` | `/company` login | Web OAuth client ID |
| `COMPANY_GOOGLE_CLIENT_SECRET` | `/company` login | Web OAuth secret |
| `COMPANY_OAUTH_REDIRECT_URL` | `/company` login | Callback URL registered in Google Cloud |
| `COMPANY_COOKIE_SECRET` | `/company` sessions | Signs HTTP-only session cookie |
| `COMPANY_DASHBOARD_ORIGIN` | `/company` CORS | Dashboard origin (credentials) |
| `WHOISXML_API_KEY` | Domain categorization (optional) | Enable WhoisXML website category lookup + quota tracking |
| `WHOISXML_FREE_LIMIT` | Domain categorization (optional) | Free-tier limit used for quota reporting (default 100) |
| `WHOISXML_MIN_CONFIDENCE` | Domain categorization (optional) | Minimum confidence to persist strict domain mappings |
| `ALLOW_GEMINI_DOMAIN_LOOKUP` | Domain categorization (optional) | If `1`, allow Gemini tie-breaker lookups for unknown domains |

Template: **`.env.example`** at repo root — copy to **`backend/.env`** (`cp .env.example backend/.env` from the root, or `cp ../.env.example .env` after `cd backend`).

## Changing API / dashboard URLs (production)

For anything other than localhost, update:

- `extension/background.js` — `BACKEND_URL`
- `extension/onboarding/onboarding.js` — `BACKEND_URL`
- `extension/settings/settings.js` — `BACKEND_URL`
- `extension/popup/popup.js` — `fetch` URLs and dashboard link if needed
- `extension/manifest.json` — `host_permissions` for your API origin (and remove `localhost` if unused)
- `dashboard/src/ui/constants.js` — `BACKEND`
- `backend/.env` — `COMPANY_OAUTH_REDIRECT_URL`, `COMPANY_DASHBOARD_ORIGIN` to match deployed hosts

## Security notes

- Never commit **`backend/.env`** or API keys.
- Extension user auth uses **Chrome Identity** + your extension OAuth client; company auth uses **cookies** and a separate web OAuth client.
- This repo uses **in-memory** storage on the server; restarting the backend clears users/sessions/purchases until you add a database.

## Tech stack

- Extension: Manifest V3, vanilla JS, `chrome.identity`
- Backend: Node.js, Express 5, `@google/generative-ai`
- Dashboard: React, Vite

## Status

Active development: extension, API, landing, user dashboard, and **company marketplace** (curated + custom exports, server-side pricing) run locally — see **[RECLAIM_STATUS.md](./RECLAIM_STATUS.md)** for detail.

**Next milestones:** PostgreSQL for durable data, Chrome Web Store listing (installable extension + privacy copy), then production deploy.
