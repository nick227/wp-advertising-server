# wp-ad-community-service

Backend microservice for the [WP Advertising](https://github.com) WordPress plugin's community ad network. Sites opt in, contribute one ad, and receive ads from other opted-in sites in return — simple round-robin, no targeting, no bidding.

**Stack:** Node.js 20 · TypeScript · Express · Prisma · MySQL

---

## Overview

- **Serve path is synchronous and cache-only.** `GET /v1/community/serve` reads from an in-memory rotation cache and never writes to MySQL during a serve request. Cache TTL is 5 minutes with stale-while-refresh. Successful serves may enqueue an in-memory impression event (no browser→server tracking URLs).
- **Event writes are async.** Impression and click events are pushed to an in-memory queue and batch-flushed to MySQL on a configurable interval. Raw event rows are off by default; rollups and counters remain.
- **Single-replica only.** The rate limiter and rotation cache are in-process. Do not run multiple replicas without replacing them with a shared store (Redis).
- **Auth model:** Sites authenticate with an `apiKey` returned at registration. Admin endpoints require a `Bearer` token in the `Authorization` header.
- **No ghost tracking URLs.** Serve responses never include `impressionUrl` / `clickUrl` pointing at this service. Community clicks use the advertiser `targetUrl`.
- **Public product site** is served from the same process (`/`, `/plugin`, `/pricing`, …) with static assets in `public-site/assets`. API remains under `/v1`.

---

## Local development

**Prerequisites:** Node.js ≥ 20, a running MySQL 8 instance (or use the included Docker Compose).

```bash
# 1. Start MySQL (skip if you have your own)
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL to your MySQL connection string

# 4. Generate Prisma client and run migrations
npm run prisma:generate
npm run prisma:migrate

# 5. Start dev server (hot reload)
npm run dev
```

The API is available at `http://localhost:4100/v1`.

---

Billing configuration and rollout: [Billing operations](docs/billing.md).

## Testing

```bash
# Type-check + lint + all 53 API tests (no database required)
npm run check

# Individual gates
npm run typecheck
npm run lint
npm run test

# With coverage
npm run test:coverage

# Smoke test against a live server
npm run smoke
```

Tests use Vitest + supertest with mocked Prisma — no database connection needed. The smoke test requires a running server and real database.

---

## Railway deployment

### Prerequisites

- A [Railway](https://railway.app) account and project
- A MySQL database provisioned in the same Railway project

### Step 1 — Provision MySQL

In the Railway dashboard: **New** → **Database** → **MySQL**. Railway injects `DATABASE_URL` into your service environment automatically.

### Step 2 — Connect the repo

**New** → **GitHub Repo** → select this repository. Railway reads `railway.json` and will:

1. Build: `npm ci && npx prisma generate && npm run build`
2. Start: `npx prisma migrate deploy && node dist/server.js`
3. Health check: `GET /v1/health` (timeout 300 s)

### Step 3 — Set environment variables

In **Settings → Variables**, add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PUBLIC_BASE_URL` | `https://<your-railway-domain>/v1` |
| `ADMIN_TOKEN` | strong random string ≥ 32 chars |
| `EVENT_TOKEN_SECRET` | strong random string ≥ 32 chars |

`DATABASE_URL` and `PORT` are injected by Railway automatically.

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4 — Deploy

Push to your connected branch. Railway deploys automatically. Check **Deployments** → logs for:

```
database connection verified
wp-ad-community-service v4.0.0 listening on :<PORT>
```

### Configure the WordPress plugin

In the WP Advertising plugin settings, set **Community API URL** to:

```
https://<your-railway-domain>/v1
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | MySQL connection string |
| `PORT` | No | `4100` | Listen port (Railway sets this automatically) |
| `NODE_ENV` | Yes (prod) | `development` | Set to `production` to enforce secret requirements |
| `PUBLIC_BASE_URL` | Yes | — | Public base URL including `/v1` |
| `ADMIN_TOKEN` | Yes (prod) | — | Bearer token for `/admin/*` and `/metrics` endpoints |
| `EVENT_TOKEN_SECRET` | Yes (prod) | — | HMAC secret for signed event tokens (≥ 32 chars in production) |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins |
| `EVENT_TRACKING_ENABLED` | No | `true` | Enqueue impression on successful `/community/serve` |
| `RAW_EVENTS_ENABLED` | No | `false` | Write individual event rows in addition to rollups |
| `ROTATION_CACHE_TTL_MS` | No | `300000` | Rotation cache TTL (5 minutes); writes invalidate immediately |
| `ROTATION_CACHE_WARM_ON_START` | No | `true` | Pre-fill cache before accepting traffic |
| `EVENT_FLUSH_INTERVAL_MS` | No | `2000` | Event queue flush interval |
| `EVENT_FLUSH_MAX_BATCH` | No | `500` | Max events per flush |
| `EVENT_MAX_QUEUE` | No | `5000` | Max queued events before drops |
| `SHUTDOWN_TIMEOUT_MS` | No | `10000` | Graceful shutdown timeout (min 1000) |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in milliseconds |
| `RATE_LIMIT_SERVE_MAX` | No | `600` | Max serve requests per window per client |
| `RATE_LIMIT_EVENTS_MAX` | No | `2000` | Max event requests per window per client |
| `RATE_LIMIT_WRITE_MAX` | No | `120` | Max write requests per window per client |
| `RATE_LIMIT_REGISTER_MAX` | No | `10` | Max register requests per window per client |
| `RATE_LIMIT_ADMIN_MAX` | No | `120` | Max admin requests per window per client |
| `RATE_LIMIT_MAX_BUCKETS` | No | `10000` | Max tracked clients before new IPs are denied |

The service refuses to start in production if `ADMIN_TOKEN` or `EVENT_TOKEN_SECRET` are missing, set to the development default, or shorter than 32 characters.

---

## API reference

### Site endpoints (WordPress plugin)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/sites/register` | — | Register or re-register a site; returns `siteId` and `apiKey` |
| `POST` | `/v1/sites/heartbeat` | `apiKey` | Update `lastSeenAt`; returns site status |
| `POST` | `/v1/sites/opt-in` | `apiKey` | Join the community network |
| `POST` | `/v1/sites/opt-out` | `apiKey` | Leave the community network |
| `POST` | `/v1/sites/ad` | `apiKey` | Upsert the site's community ad |

### Community endpoints (WordPress plugin)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/community/serve` | — | Serve an ad (200 with body, or 204 No Content) |
| `POST` | `/v1/community/events` | signed token | Record impression or click |
| `GET` | `/v1/community/events/impression` | signed token | 1×1 GIF pixel tracker |
| `GET` | `/v1/community/events/click` | signed token | Redirect to ad target URL (302) or 404 |

### Operations

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/health` | — | DB connectivity check |
| `GET` | `/v1/metrics` | Admin token | Cache, queue, and rate limit stats |
| `GET` | `/v1/community/status` | Admin token | Cache and queue status |
| `POST` | `/v1/admin/cache/rebuild` | Admin token | Force rotation cache rebuild |
| `POST` | `/v1/admin/events/flush` | Admin token | Force event queue flush |
| `GET` | `/v1/admin/metrics` | Admin token | Full metrics |
| `GET` | `/v1/admin/sites` | Admin token | Last 100 registered sites |
| `GET` | `/v1/admin/ads` | Admin token | Last 100 community ads |

`apiKey` is passed in the JSON request body as `{ "siteId": "...", "apiKey": "..." }`.  
Admin token is passed as `Authorization: Bearer <ADMIN_TOKEN>`.

### Serve response shape

```json
{
  "adId": "clxyz...",
  "siteId": "clxyz...",
  "title": "Example Ad",
  "imageUrl": "https://example.com/banner.jpg",
  "targetUrl": "https://example.com/",
  "network": {
    "servedBy": "community",
    "algorithm": "cached-round-robin",
    "requestId": "req_...",
    "cacheVersion": 4
  }
}
```

Clicks use `targetUrl` (advertiser destination). Impressions are counted when `/community/serve` succeeds (unless `?tracking=0`). Serve responses never include browser→server `impressionUrl` / `clickUrl` fields.

### Cost / capacity baselines to watch

After deploy, sample periodically:

- process RSS memory
- DB writes/minute
- DB size growth/day
- `/community/serve` p95 latency

Request count alone is a weak scaling signal for this architecture.

## Soft-launch seed

```bash
ALLOW_SOFT_LAUNCH_SEED=1 DATABASE_URL="mysql://..." npm run seed:soft-launch
```

Creates/updates eight `*.wp-advertising.test` Trial/Pro sites with house ads (idempotent). Safe for local and Railway staging when the flag is set. Then rebuild rotation cache via admin System or `POST /v1/admin/cache/rebuild`.

Public soft-launch aggregates (no publisher domains): `GET /status`. Operator checklist: admin Overview → Soft-launch readiness.

---

## Architecture

```
WordPress plugin
      │  POST /sites/register → returns apiKey
      │  POST /sites/ad       → upsert ad
      │  GET  /community/serve → returns ad JSON (targetUrl only)
      ▼
wp-ad-community-service (Express, single replica)
      │
      ├── Rotation cache (in-memory, 5 min TTL)
      │   Populated from MySQL on first request and after writes.
      │   nextAd() is round-robin with self-serve exclusion.
      │
      ├── Event queue (in-memory, flushed every 2 s)
      │   Serve-path impressions (and legacy token events) are enqueued
      │   and batch-written to MySQL. Raw rows off by default.
      │
      └── MySQL (Prisma)
          CommunitySite · CommunityAd · CommunityEvent
          CommunityEventRollup · BlockedDomain
```

**Scaling note:** The rate limiter and rotation cache are per-process. `railway.json` pins `numReplicas: 1`. If you need to scale horizontally, replace the in-memory rate limiter with Redis and remove the replica pin.

---

## OpenAPI spec

```bash
npm run openapi:validate
```

Spec: `openapi/community-api.yaml`

---

## Operations

```bash
# Health
curl https://<host>/v1/health

# Force cache rebuild
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<host>/v1/admin/cache/rebuild

# View metrics
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<host>/v1/admin/metrics

# Flush event queue
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<host>/v1/admin/events/flush

# Run Prisma migration manually (Railway CLI)
railway run npx prisma migrate deploy
```
