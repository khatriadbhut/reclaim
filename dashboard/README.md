# Reclaim dashboard

React + Vite app: **/** landing, **/user** consumer dashboard, **/company** Reclaim Business.

## Run

```bash
npm install
npm run dev
```

Default dev server: **http://localhost:5173**. API base URL is `http://localhost:3000` in `src/ui/constants.js` — change there for production.

The **`/user`** dashboard merges **`POST /api/registry-domain-categories`** (pinned domains from the backend) into category breakdowns and top sites so labels match `domain-categories.json` even when extension storage still has older values; the backend must be running and reachable at `BACKEND`.

Full project setup (extension, backend, OAuth, env vars, production security) is in the **repository root [README.md](../README.md)** and **[RECLAIM_STATUS.md](../RECLAIM_STATUS.md)**.
