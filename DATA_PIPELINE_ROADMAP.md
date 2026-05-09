# Final data pipeline roadmap (post-audit)

**Purpose:** Ship **few, high-trust columns** that buyers can operationalize—not wide sparse tables. **Monetary value should rise faster than user count** because larger panels unlock **stable segments, better calibration, and activation**; the pipeline must **enforce floors** so scale never ships noisy or non-compliant rows.

**Status:** Audit complete → implement phases below in order. **Do not add columns** without passing the [Column gate](#column-governance).

---

## 1. Principles (strict)

| Principle | What it means |
|-----------|----------------|
| **Value density** | Every exported field must have a **defined buyer use** (targeting, filtering, modeling, or compliance). If it is only “interesting,” it stays internal. |
| **One job per column** | No duplicate semantics (e.g. one merged IAB topic list, not two parallel lists). Names must match meaning (`engagement_score` ≠ purchase intent). |
| **Concise buyer views** | Separate **“segment SKU”** (small file: id + segment membership + recency) from **“analytic deep”** (wider, for data science). Same raw pipeline; different **export profiles**. |
| **Non-degrading scale** | As \(N\) grows, **minimum segment size**, **confidence intervals**, and **suppression rules** tighten—not loosen. Small-N segments are **suppressed or bucketed**, never sold as precise micro-targets. |
| **Superlinear value** | Revenue per user should improve with \(N\) because: **(a)** rare intents become viable, **(b)** overlap/lift studies work, **(c)** geo/demo cells stabilize, **(d)** activation match rates improve with consented identifiers. |

---

## 2. Alignment with adtech / privacy standards (web-audited)

Use these as **buyer and legal checklists**, not box-ticking.

| Standard / frame | Relevance to Reclaim | Practical action |
|------------------|----------------------|------------------|
| **[IAB Tech Lab Audience Taxonomy 1.1](https://iabtechlab.com/standards/audience-taxonomy/)** | Common **segment naming / IDs** for planning and many DSP workflows. | Map internal rollups + content signals to **stable external segment IDs**; version the mapping table. |
| **[IAB Data Transparency Standard](https://iabtechlab.com/standards/data-transparency/) + [Data Label](https://www.datalabel.org/)** | **Disclosure**: how segments are built, recency, provenance, precision. | Ship a **machine-readable label** per export batch (criteria, window, sources, refresh). |
| **Segment file hygiene (industry practice)** | CSV/JSON, headers row, stable IDs, multi-value fields delimited consistently; **provider identity** and **taxonomy_id_list** style metadata for marketplaces. | Document **one canonical export format**; automate validation. |
| **Identifier expectations** | Enterprise buyers expect declared **`id_types`** (e.g. hashed email, device) and **match keys** for activation. | Pseudonymous panel ID today; **optional** consented **hashed PII** later with explicit purpose. |
| **India DPDP 2023** | **Consent** (specific, informed, withdrawable); **purpose limitation**; fiduciary vs processor clarity; minimize personal data in **B2B exports**. | Raw queries / sensitive URL lists **off** commercial exports; **derived** labels only; retention caps; DPIA-style review for new fields. |

*Note: TCF / GVL are **EU web-consent** mechanics for ads; relevant if you integrate with EU inventory, not a substitute for DPDP.*

---

## 3. Why data must get **better** as users grow (design, not hope)

| Mechanism | Implementation |
|-----------|----------------|
| **k-anonymity / cell floors** | Suppress or merge cells below \(k\) users (start with \(k \ge 100\) for geo×segment exports; tune with counsel). |
| **Shrinkage estimators** | Category shares and intent tiers **pull toward prior** when sample is small; stabilizes week-to-week noise. |
| **Calibration** | As \(N\) increases, fit **bias correction** vs large reference (e.g. census demo where available, or declared onboarding). |
| **Rare segments** | Only expose “long-tail” intents when **national N** supports it; else roll up. |
| **Versioned schema** | Breaking changes bump **`schema_version`**; buyers opt in; no silent column drift. |

---

## 4. Architecture: scale to arbitrary users

**Today (prototype):** in-memory / JSON merges are fine for dev.

**Target (this roadmap):**

1. **Ingest** — `/api/sync` → **durable store** (e.g. Postgres: users, session_days, events; or object store for raw blobs + warehouse).
2. **Compute** — **batch jobs** (nightly or hourly): rollups, segments, IAB weights, quality flags. **Never** re-scan all history on CSV download.
3. **Serve** — Exports read **pre-aggregated tables** or **materialized views** keyed by `export_batch_id`.
4. **IDs** — Internal `user_id` stable; **export** uses **scoped hash** (already directionally aligned); document rotation policy.
5. **Cost control** — Cap expensive enrichment (Whois, LLM) with **budget per user/day** and **cache**; at scale, **sample + model** for tail domains.

This is what makes marginal cost per user **fall** and quality **rise** (more data per enrichment dollar).

---

## 5. Export products (concise, money-oriented)

Two SKUs from the same pipeline:

### A. **Activation / segment SKU** (small file)

- Columns (illustrative): `panel_user_id`, `segment_ids[]`, `segment_max_recency_days`, `geo_tier`, `confidence_band`, `schema_version`, `batch_id`  
- Goal: **easy** for ops; maps to IAB / internal IDs; **Data Label** sidecar JSON.

### B. **Analytics / modeling SKU** (wider)

- Time in taxonomy buckets, funnels, engagement scores, **no raw sensitive text**  
- Goal: data science and **overlap** studies; still **governed column list**—not everything internal.

**Rule:** Adding a column to either SKU requires the [Column gate](#column-governance).

---

## 6. Column governance

**Column gate (all must be true):**

1. **Buyer story** — One sentence: “Buyer uses this to ___.”  
2. **Definition** — Exact derivation, window (7d/30d/lifetime), and units.  
3. **Quality** — Expected fill rate at current \(N\); behavior when missing (0, `unknown`, suppress row).  
4. **Legal** — DPDP / contract check; no new sensitive export without review.  
5. **Red team** — Could this be **replaced** by combining two existing columns? If yes, don’t add.

**Periodic prune:** Every quarter, drop or merge columns in bottom quartile of **buyer usage + fill rate**.

---

## 7. Implementation phases (execute in order)

### Phase 0 — Lock the contract ✅ (audit)

- [x] Prefer **7d/30d** visit counts, merged IAB lists, engagement vs intent naming, derived finance fields.  
- [ ] **Inventory** current exports vs §5 SKUs; tag each column A (activation) / B (analytics) / internal-only.  
- [x] **`data-label-template.json`** + **`data_label`** object on JSON company downloads + `GET /api/company/data-label-template`.

### Phase 1 — Quality at scale (before chasing users)

- [x] **Minimum row floor** — default **100** in production when `RECLAIM_MIN_EXPORT_ROWS` unset; use `=0` locally.  
- [x] **Shrinkage** (optional) for `category_distribution_pct` via `RECLAIM_DISTRIBUTION_SHRINK`.  
- [x] **Contract test**: `npm run verify:exports` in `backend/`.  
- [x] **Postgres (optional)** — `DATABASE_URL` + `reclaim_sync` table; load on startup; persist after each `/api/sync`.  
- [x] **Batch re-enrich** — `ENABLE_BATCH_ENRICH=1` + interval env.  
- [x] **Extension sync queue** — failed POSTs queued and retried.  
- [x] **`enrichment_version`** on sync response + profile; JSON exports include `enrichment_version`.  
- [x] **Intent inference** — merge real queries with **on-session hints** (brand, product, breadcrumbs, domain, page types).  
- [x] **Two export profiles** — `exportProfile`: `analytics` | `activation` on purchase; activation strips raw search / many sensitive columns.  
- [x] **Data Label** — only when `RECLAIM_EXPORT_DATA_LABEL=1`.  
- [ ] **Precomputed export tables** — still TBD (exports still built from session maps).

### Phase 2 — Standards-facing packaging

- [ ] Stable **IAB Audience Taxonomy 1.1** mapping for top segments.  
- [ ] **Provider** name, domain, and **taxonomy_id_list** in marketplace metadata.  
- [ ] Optional **`visitLog`** for definitional clarity and future event exports.

### Phase 3 — Superlinear monetization

- [ ] **Consented activation keys** (hashed email/phone) under **narrow purpose** + counsel.  
- [ ] **Overlap / lift** playbook and holdout design.  
- [ ] **Calibration** report (panel vs reference) for enterprise sales.

### Phase 4 — International / platform depth (as needed)

- [ ] TCF-aware collection if EU inventory; **separate** consent records.  
- [ ] Clean-room or **partner-specific** buckets if a DSP requires.

---

## 10. Postgres-first migration track (deferred until “global Postgres switch”)

This section is adapted from Claude’s `RECLAIM_PIPELINE_ROADMAP.md`. It’s **not** required for the current “optional Postgres durability” setup (`reclaim_sync` JSONB). Once we decide to make Postgres the **source of truth**, we implement this track.

### 10.1 Postgres schema + migrations (normalized tables)

- [ ] **Migrations folder** `backend/migrations/` with SQL migrations (users, events, session_days, user_rollups, companies/purchases).
- [ ] **Migration runner** (`npm run migrate`) to apply SQL files in order.
- [ ] **DB wrapper** `backend/db.js` / `backend/db.ts` for pooling + query helper.

### 10.2 Rewrite ingest: `/api/sync` becomes “append-only events”

Goal: `/api/sync` should **not** merge big JSON blobs or run heavy enrichment inline.

- [ ] Upsert `users` row (demographics + version fields).
- [ ] Insert **events** rows (domain, page_type, visit_hour, scroll depth, extracted brand/product_type, internal-only search_query/prices_raw).
- [ ] Upsert `session_days` aggregates (total_seconds, active hours).
- [ ] Mark new events as `enrichment_version = 0`.
- [ ] Return quickly `{ ok: true, queued: N }`.

Note: we already have **extension retry queue** and server-side rate limiting; keep those.

### 10.3 Batch jobs: enrich + roll up into `user_rollups` (exports never scan raw events)

- [ ] **Enrich pending events** in batches:
  - [ ] IAB enrichment (domain/category fallback + confidence)
  - [ ] Intent query parsing (internal-only, never exported raw)
- [ ] **Rollups** computed for `window_days` = 7 and 30 into `user_rollups`.
- [ ] Store `batch_id` and `schema_version` per rollup; support backfill by bumping `enrichment_version`.
- [ ] Schedule rollup job (hourly or nightly) with env toggles.

### 10.4 Export layer reads rollups only

- [ ] Create a dedicated rollup-backed export builder (e.g. `buildExport({ companyId, sku, windowDays, segmentFilters, batchId })`).
- [ ] Use **scoped user id** per company (already directionally aligned in current exports).
- [ ] Enforce **activation vs analytics** SKU columns using the export profiles gate (we already have export profiles; keep).

### 10.5 Contract tests + governance (keep green)

- [x] Dashboard ↔ server export key contract (`npm run verify:exports`).
- [x] Activation governance contract (`npm run verify:governance`, strips banned keys).
- [ ] Add rollup-backed export contract checks once rollup tables land (schema_version, batch_id presence, banned columns absent).

### 10.6 Quality fixes checklist (should remain true after migration)

- [x] **Rate limiting**: `/api/sync` + `/api/extract` guarded.
- [x] **Popup backend URL**: popup routes insight through background worker (no hardcoded localhost fetch).
- [x] **Occupation options**: expanded onboarding values + labels.
- [x] **Price normalization**: reject contradictory currency cues + absurd INR values.
- [ ] **Precomputed export tables**: once Postgres-first track is complete, exports must be **rollup-only** (no full scans).

---

## 8. Explicit non-goals

- **Column sprawl** “because we can.”  
- **Raw** search queries, finance site URLs, or breadcrumbs in **commercial** files.  
- **Selling** sub-k cells or precise one-to-one sensitive inferences.  
- **Claiming** “exponential revenue” from features alone—**distribution, compliance, and activation** still dominate.

---

## 9. Success metrics (how we know the pipeline earns)

| Metric | Target direction |
|--------|------------------|
| **Non-null rate** (top 10 buyer columns) | ↑ and **stable** week-over-week |
| **Segment volatility** (WoW membership churn) | ↓ as \(N\) grows |
| **Buyer time-to-first-use** | ↓ (SKUs load in tools without cleanup) |
| **Renewal / upsell** | ↑ with Data Label + calibration docs |
| **Support burden** | ↓ (fewer “what does this column mean?” tickets) |

---

*Owner: product + data eng + counsel. Revisit after each phase exit; bump `schema_version` on any buyer-visible derivation change.*
