# Step 0B — Urgent security + data-safety fixes

**Why first:** the S149 spec work found these while reading the code. Each one is small, but it is either a **cross-tenant data leak**, a **secret with a public default**, or **silent data loss**. Fix them before any other step, even before the search backfill (Step 2). Once the index is filled, the search leak becomes real.

**Rule:** one module per session, 🔒 adversarial review before push, `make pre-push`. Most of these are **S** (1–2 files).

## 0. Live status from the VPS baseline (2026-09-25, `docs/VPS_BASELINE_2026-09-25.md`)

- **Secrets (U4 and others):** action needed. Details are kept off the public repo (owner's private baseline file). Do session 0B-0 first.
- **U6 Grafana:** dashboards need login (302). Only `/grafana/api/health` is anonymous (shows the version). **Downgraded to low.**
- **U7 Redis:** confirmed. `allkeys-lru`, 256 MB, **1,420 keys already evicted.**
- **U8 backups:** confirmed. **None** for Postgres, Neo4j, ES or MinIO.
- **U11 MISP/REST queue:** **live.** Global processing is on in production.
- **Step 2:** confirmed. 12,010 IOCs in Postgres, 0 in ES, 6,035 failed index jobs since at least 2026-07-11.
- **Step 4:** confirmed. Only `etip_user` (superuser + BYPASSRLS), used by all 17 app connections. 6 of 25 tenant tables have no RLS.
- **In memory (Step 3):** confirmed. There are no tables for alerts, integrations, reports, DRP or backups.

### 0B-0: VPS actions, done by the owner from VS Code (not a code session)
1. Take the first backup (`pg_dump` + Neo4j dump) and copy it off the box.
2. Fix the production secrets listed in the private baseline file (rotate / set). Expect users to have to log in again.
3. Redis: `CONFIG SET maxmemory-policy noeviction` and `maxmemory 1gb` at runtime. The compose change follows in 0B-1.

### Progress (S149, branch `claude/beautiful-allen-nd42lg`, not yet deployed)

| Item | Status | Commit |
|---|---|---|
| U1 es-indexing, U2 alerting, U3 reporting (tenant guard) | ✅ code + tests | 8802d20, 165ac99 |
| U4 integration key refuse-default + secret masking + compose var | ✅ code + tests | 08e5255 |
| U5 Razorpay routes closed in production | ✅ code + tests | bd3d544 |
| U6 Grafana health endpoint hidden | ✅ nginx | 2d3e6e0 |
| U7 Redis noeviction + 1gb (container 1280M) | ✅ compose | 2d3e6e0 |
| U8 backup script (`scripts/etip-backup.sh`, 100755) | ✅ script; cron install on VPS pending | c6c604e |
| U9 schema push before restart | ⏳ Step 1 (S149b) | — |
| U10 deploy concurrency + docs paths-ignore | ✅ workflow | 2d3e6e0 |
| U11 REST/MISP connector by feed type | ✅ code + tests | 841774e |
| U12 MFA demo secret removed | ✅ code + tests (feature-limits fallback left for Step 5) | aedb57a |
| Follow-up | alerting/reporting routes that fetch by `:id` don't check the tenant (IDs are random UUIDs; fix with Step 3 persistence) | — |

**Deploy order matters:** `TI_INTEGRATION_ENCRYPTION_KEY` must be in the VPS `.env` **before** this branch is merged, or `etip_integration` will refuse to start.

## 1. Findings (all checked in code, 2026-09-25)

| # | Problem | Where | Impact | Fix |
|---|---|---|---|---|
| U1 🔒 | `tenantId` taken from the **query string**, no JWT check. nginx `auth_request` checks only that the user is logged in, not which tenant | `apps/elasticsearch-indexing-service/src/routes/search.ts:19-31` (search + stats) | Any logged-in user can read another tenant's IOCs by changing `tenantId=` (empty index today, so no leak yet) | Read tenant from the verified JWT / `x-tenant-id` set by nginx after auth; reject a query `tenantId` that doesn't match (or drop it) |
| U2 🔒 | Same pattern | `apps/alerting-service/src/routes/alerts.ts:29,148` | Cross-tenant alert read | Same fix |
| U3 🔒 | Same pattern | `apps/reporting-service/src/routes/reports.ts:38` | Cross-tenant report read | Same fix |
| U4 🔒 | Integration credentials encryption key uses the dev default. `TI_INTEGRATION_ENCRYPTION_KEY` is **not** in `docker-compose.etip.yml` | `apps/integration-service/src/config.ts:31` | Stored SIEM/ticketing secrets protected by a key that is in the repo. Also creds are stored in plain text and `GET /integrations/:id` returns them | Add the env var (VPS `.env`), refuse to start in production with the default, mask secrets in GET responses. Encrypt-at-rest in Step 3 |
| U5 | Razorpay is **deferred by decision** (DECISION-031: sales-led; live keys deferred post-launch). But the webhook route `/api/v1/billing/webhooks/razorpay` is still reachable, and the key/secret defaults are placeholders | `apps/billing-service/src/config.ts:16-18`, compose ~998-1000 | Low today (nothing applies a plan from the webhook yet), but a forged event could write billing records | While deferred: return 404/503 from the webhook + checkout routes unless real keys are configured (`TI_RAZORPAY_ENABLED=false` default). Real fix comes with the self-serve checkout (PARALLEL_REVENUE_GROWTH) |
| U6 🔒 | Grafana is reachable from the internet and has a default admin password if `TI_GRAFANA_PASSWORD` is unset | `docker/nginx/conf.d/default.conf:642`, compose | Metrics + dashboards exposed | Put `/grafana/` behind the same auth (or Cloudflare Access), require the password env var |
| U7 | Redis runs `--maxmemory 256mb --maxmemory-policy allkeys-lru` | `docker-compose.etip.yml:45-48` | Under memory pressure Redis silently evicts BullMQ jobs and Redis-JSON config (DECISION-027) | `noeviction` + a larger limit (e.g. 1–2 GB, box has 16 GB). Add a Redis memory alert (Step 8) |
| U8 | No database backups (no `pg_dump` anywhere). Admin "BackupStore" is an in-memory list | repo-wide | One disk failure = everything lost | Daily `pg_dump` + Neo4j dump + MinIO/ES snapshot to off-box storage, 7/30-day retention, one restore drill (details in STEP_01) |
| U9 | Deploy runs `prisma db push` **after** containers restart and continues even if all 5 pushes fail | `.github/workflows/deploy.yml:192,197` | New code can run against an old schema | Push schema first; fail the deploy if it fails (details in STEP_01 / STEP_04) |
| U10 | Deploy has no `concurrency:` key; docs-only merges redeploy everything | `.github/workflows/deploy.yml` | Two pushes race to publish `:latest`; needless restarts (S148 trigger) | `concurrency: deploy` + `paths-ignore: docs/**` |
| U11 | Global MISP and REST workers share queue `FEED_FETCH_GLOBAL_REST`; the worker picks the connector, not the feed | `apps/ingestion/src/schedulers/global-feed-scheduler.ts:26-28`, `workers/global-misp-worker.ts:13`, `workers/global-rest-worker.ts:11` | ~half of REST jobs go through the MISP connector, fail, and auto-disable the feed after 5 failures (only when `TI_GLOBAL_PROCESSING_ENABLED=true`) | Separate queue for MISP, or one worker that dispatches by `feedType` |
| U12 | MFA setup falls back to a fixed demo secret + backup codes on error; feature limits fall back to demo limits | `apps/frontend/src/hooks/use-mfa.ts:18-23`, `use-feature-limits.ts` | A user could "enable" MFA with a fake secret; FeatureGate can unlock paid features | Remove demo fallback from these two hooks first (rest in Step 5) |

## 2. Session order

| S | Module | Items | Size |
|---|---|---|---|
| 0B-1 | ops (compose, nginx, VPS `.env` status check) 🔒 | U4 env var, U6, U7 | S |
| 0B-2 | elasticsearch-indexing-service 🔒 | U1 | S |
| 0B-3 | alerting-service 🔒 | U2 | S |
| 0B-4 | reporting-service 🔒 | U3 | S |
| 0B-5 | integration-service 🔒 | U4 code side (refuse default, mask secrets) | S |
| 0B-6 | billing-service | U5: disable webhook/checkout routes while Razorpay is deferred | S |
| 0B-7 | frontend | U12 | S |
| 0B-8 | ingestion | U11 | S |
| — | ops | U8, U9, U10 are done in Step 1 (S149) | — |

## 3. Acceptance checks

- U1–U3: as tenant A, call each route with `tenantId=<tenant B>` → 403 or tenant-A data only. Unit test per route.
- U4–U6: `docker compose config | grep -c placeholder` → 0; service logs show no "default key" warning; `curl -I https://intelwatch.in/grafana/` without login → 401/403.
- U7: `redis-cli CONFIG GET maxmemory-policy` → `noeviction`.
- U11: with global processing on in staging, a REST feed runs 10 times with 0 MISP-connector errors.
- U12: MFA setup with the API down shows an error, not a QR code.

## 4. Rollback

Each item is a small, isolated change. Revert its commit. For U7, set the policy back with `redis-cli CONFIG SET` (no restart needed).

## 5. Owner decisions

1. Approve Step 0B ahead of everything else, including S149.
2. Grafana access: nginx auth (same login) or Cloudflare Access?
3. Backup target: Hostinger backup, S3-compatible bucket, or a second machine?
