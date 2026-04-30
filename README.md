# Reclaim

> Your data. Your money.

Reclaim is a browser extension that pays users for the browsing data they've been giving away for free. It collects anonymized browsing behavior, packages it into valuable market insights, and sells it to companies — returning the earnings directly to users.

## How It Works

1. User installs the Chrome extension
2. Extension passively tracks domains visited, time spent, and browsing categories
3. Data is anonymized and sent to the Reclaim backend
4. Gemini AI generates personalized insights from cross-site browsing patterns
5. Anonymized data packages are sold to companies for market research
6. Users receive payments proportional to their data contribution

## Project Structure

```
reclaim/
├── extension/          # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js   # Service worker — tracks browsing data
│   ├── popup/          # Extension popup UI
│   └── icons/
├── backend/            # Node.js API server
│   ├── server.js
│   └── routes/
├── dashboard/          # React user dashboard
│   └── src/
└── .env.example        # Environment variable template
```

## Tech Stack

- **Extension**: Chrome Manifest V3, Vanilla JS
- **Backend**: Node.js, Express
- **Dashboard**: React
- **AI**: Google Gemini 1.5 Flash API
- **Database**: PostgreSQL (planned)
- **Payments**: Blockchain / stablecoin (planned)

## Setup

### Extension
1. Open Chrome → `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select the `extension/` folder

### Backend
```bash
cd backend
cp ../.env.example .env
# Add your GEMINI_API_KEY to .env
npm install
npm start
```

### Dashboard
```bash
cd dashboard
npm install
npm run dev
```

## Security

- API keys stored in `.env` only — never committed
- All browsing data anonymized before leaving the device
- User consent required before any data collection begins
- See `.env.example` for required environment variables

## Status

Active development — building toward YC Summer 2026 demo.
