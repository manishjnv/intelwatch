# VPS baseline — 2026-09-25

Read-only checks run from Claude Code (VS Code) over the Cloudflare tunnel, per `docs/roadmap/VPS_CHECKS_PROMPT.md`. Nothing was restarted, edited or written on the VPS. No secret values printed.

- VPS: 187.127.138.93, `/opt/intelwatch`, running commit `d447962` (master, PR #32)
- Checked: 2026-09-25 ~14:30 UTC

> **Public repo note.** Section A1 (secret status) is **withheld** from this file because the repo is public and the findings are unfixed. The full A1 table is in a local, git-excluded file on the owner's machine (`docs/VPS_BASELINE_2026-09-25.PRIVATE.md`). Summary for planning: **Step 0B-1 (secrets) is needed — at least one item is not production-grade.** Add the details here after the fix is deployed.

## H. Summary

| Area | Status | Maps to |
|---|---|---|
| Secrets (A1) | ⚠️ Action needed — details withheld (see note above) | U4, U5 |
| Grafana (A2) | Not open: `/grafana/` → 302 to login. `/grafana/api/health` is anonymous (Grafana default) and shows version 11.1.0 | U6 |
| Cross-tenant search without token (A3) | 401 ✅ (nginx auth works; U1 is about *logged-in* users, not tested here) | U1 |
| Razorpay webhook (A4) | 401 (reachable, rejected by auth gate) | U5 |
| Containers (B2) | 32/32 Up + healthy ✅ | — |
| Health-recovery cron (B1) | Script is `-rwx` now. Log has **20,361 "Permission denied" lines and nothing else**, last write 2026-09-24 23:35 UTC. Cron has been dead for weeks until the exec-bit fix | Step 1 |
| Backups (B4) | ❌ **None for ETIP.** No pg_dump / Neo4j / ES / MinIO backup cron or files. Hostinger snapshots not checked | U8 |
| Redis (C1) | ❌ `allkeys-lru`, 256 MB cap, **1,420 keys already evicted** | U7 |
| ES vs DB (D) | ❌ **Postgres 12,010 IOCs vs ES 0 docs.** 6,035 failed index jobs, 0 completed | Step 2 |
| Global processing (D4) | `true` in `.env` and in `etip_ingestion` → U11 (MISP/REST queue bug) is live | U11 |
| RLS (E) | ❌ Only role is `etip_user` (superuser + bypassrls); all 17 app connections use it. 6 of 25 tenant tables have no RLS and no policy | Step 4 |

**One-line recommendations**
- **U4/U5 (secrets):** see private note; do 0B-1 first.
- **U6:** Grafana login works; optionally block `/grafana/api/health` at nginx to hide the version.
- **U7:** switch to `noeviction` + 1–2 GB now. Evictions are already happening, so BullMQ jobs / config keys may have been lost.
- **U8:** add daily `pg_dump` + Neo4j dump before anything else in Step 1. Nothing is backed up today.
- **U11:** global processing is on, so the queue bug is causing real feed auto-disables. Fix in 0B-8.
- **Step 2:** the indexer fails every job with `Cannot read properties of undefined (reading 'type')`, a payload shape mismatch. It has been broken since at least 2026-07-11, so search shows nothing.
- **Step 4:** roles `etip_app` / `etip_owner` / `etip_worker` don't exist yet. RLS policies exist but can't apply while the app connects as a superuser.

---

## A. Secrets and exposure

**A1** — withheld (public repo). See note at top.

**A2 — Grafana (from outside)**

| URL | Code |
|---|---|
| `https://intelwatch.in/grafana/` | 302 → `/login` |
| `https://intelwatch.in/grafana/api/health` | 200 — `{"database":"ok","version":"11.1.0"}` (anonymous by Grafana design) |

Dashboards need login. The admin password comes from `.env` (compose line 199 has a fallback default, so the env var must stay set).

**A3** — `GET /api/v1/search/iocs?tenantId=0000…` with no token → **401**.

**A4** — `POST /api/v1/billing/webhooks/razorpay` with no body/token → **401**.

## B. Uptime and deploy

**B1**
- `scripts/health-recovery.sh` and `scripts/docker-cleanup.sh`: `-rwxr-xr-x`, mtime Sep 25 07:26.
- ETIP crontab: `*/5 * * * * nice -n 19 ionice -c3 /opt/intelwatch/scripts/health-recovery.sh >> /var/log/etip-health-recovery.log 2>&1`
- `/etc/cron.daily/docker-cleanup` and `/etc/cron.d/docker-{builder,image}-prune` present.
- `/var/log/etip-health-recovery.log`: 1.8 MB. All 20,361 lines are `ionice: failed to execute … Permission denied`. Last write 2026-09-24 23:35 UTC, nothing since. Either it now runs and is silent when healthy, or it is not logging. Worth adding a timestamped "ok" line (Step 1).
- Other crons on the box belong to a different project (`/opt/dhanradar`: backup daily, auto-deploy poll every minute).
- VPS working tree has untracked files: `There`, `docker/grafana/provisioning/alerting/`, `docker/prometheus/prometheus.yml.bak-b38-20260611`.

**B2** — 32 `etip_*` containers, **32 Up / 32 healthy**. Infra containers (postgres, redis, ES, neo4j, minio, grafana, prometheus) up 2 days; app containers up 8 hours (PR #32 deploy).

**B3**

| Item | Value |
|---|---|
| Disk `/` | 193 G, 42 G used (22%) |
| RAM | 15 Gi total, 8.4 Gi used, 7.2 Gi available, **no swap** |
| Docker images | 19, 15.77 GB (listed 100% reclaimable) |
| Docker volumes | 14, 21.13 GB |
| Build cache | 104.8 MB |

**B4 — Backups:** none for ETIP. `/opt/backups` and `/opt/intelwatch/backups` don't exist. `/var/backups` only holds OS files plus the other project's `dhanradar/` folder. No `*.dump` / `*.sql.gz` modified in the last 30 days. No ETIP backup cron. Hostinger snapshot settings: not checked (no VPS tool available).

**B5**

| URL | Code |
|---|---|
| `https://intelwatch.in/health` | 200 |
| `https://intelwatch.in/api/v1/health` | 404 (not a route; `/health` is the real one) |

## C. Redis

**C1**

| Metric | Value |
|---|---|
| used_memory | 118.67 M |
| maxmemory | 256 M (container limit 300 MiB) |
| maxmemory_policy | **allkeys-lru** |
| evicted_keys | **1,420** |
| keys (db0) | 63,333 |

Compose runs `redis-server --requirepass … --maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly yes --appendfsync everysec`.

## D. Search index

**D1 — Postgres**

| tenant_id | iocs |
|---|---|
| e4e11c4c-8a7f-47d7-a4cd-a377f06fe959 | 6,009 |
| 10c895c3-80ba-4f8d-b48d-9e90d26b781b | 6,001 |
| `global_iocs` | 168 |

**D2 — Elasticsearch**

| index | docs | size |
|---|---|---|
| etip_10c895c3-…_iocs | 0 | 250 b |
| etip_e4e11c4c-…_iocs | 0 | 250 b |

No other non-system indices.

**D3 — queue `bull:etip-ioc-indexed`**

| wait | failed | completed |
|---|---|---|
| 0 | **6,035** | 0 |

- Failure reason on latest jobs: `Cannot read properties of undefined (reading 'type')`
- Oldest failure: 2026-07-11 04:44 UTC. Latest: 2026-09-25 11:42 UTC.
- Other queues present: cache-invalidate, correlate, enrich-realtime, feed-fetch-{nvd,rest,rss}, graph-sync, integration-push, normalize.

**D4** — `TI_GLOBAL_PROCESSING_ENABLED`: `true` in `.env`, `true` in `etip_ingestion`.

## E. Database roles and RLS

**E1**

| rolname | super | bypassrls |
|---|---|---|
| etip_user | t | t |

No `etip_app`, `etip_owner` or `etip_worker`.

**E2** — `etip_user`: 17 connections (all app traffic plus this check).

**E3** — tenant tables with no RLS and no policy (6 of 25):

| table | rls | force | policy |
|---|---|---|---|
| access_reviews | f | f | none |
| compliance_reports | f | f | none |
| mfa_enforcement_policies | f | f | none |
| scim_tokens | f | f | none |
| sso_configs | f | f | none |
| webhook_subscriptions | f | f | none |

**E4** — `max_connections` 100; current 22.

## F. In-memory data

**F1** — no tables matching `alert*`, `integration*`, `report*`, `drp*` or `*backup*`. Alert rules, integrations, reports, DRP and backups live only in memory (lost on restart). Tables that do exist: access_reviews, ai_processing_costs, api_keys, articles, audit_logs, billing_coupons, billing_grace_periods, billing_invoices, billing_usage_records, compliance_reports, feed_quota_plan_assignments, feed_sources, global_ai_config, global_articles, global_feed_catalog, global_iocs, iocs, malware_profiles, mfa_enforcement_policies, plan_feature_limits, plan_tier_config, provider_api_keys, scim_tokens, sessions, sso_configs, subscription_plan_definitions, tenant_feature_overrides, tenant_feed_subscriptions, tenant_ioc_overlays, tenant_item_consumption, tenant_subscriptions, tenants, threat_actor_profiles, users, vulnerability_profiles, webhook_subscriptions.

## G. Capacity

**G1** (sorted by memory)

| container | mem / limit | cpu |
|---|---|---|
| etip_neo4j | 1.177 GiB / 2 GiB | 0.50% |
| etip_elasticsearch | 1.124 GiB / 2 GiB | 0.35% |
| etip_ingestion | 300.8 MiB / 512 MiB | 2.30% |
| etip_postgres | 244.8 MiB / 512 MiB | 0.01% |
| etip_correlation | 198.7 MiB / 512 MiB | 0.28% |
| etip_grafana | 146 MiB / 256 MiB | 0.12% |
| etip_minio | 124.6 MiB / 256 MiB | 0.02% |
| etip_redis | 123.3 MiB / 300 MiB | 0.42% |
| etip_enrichment | 88.0 MiB / 512 MiB | 0.27% |
| etip_prometheus | 70.9 MiB / 256 MiB | 0.10% |
| etip_api | 67.6 MiB / 512 MiB | 0.25% |
| etip_caching | 60.9 MiB / 256 MiB | 0.28% |
| etip_normalization | 56.2 MiB / 512 MiB | 0.29% |
| etip_es_indexing | 51.4 MiB / 256 MiB | 0.28% |
| etip_threat_graph | 50.2 MiB / 512 MiB | 0.33% |
| etip_user_management | 47.4 MiB / 256 MiB | 0.32% |
| etip_billing | 46.0 MiB / 256 MiB | 0.31% |
| etip_integration | 45.8 MiB / 256 MiB | 0.26% |
| etip_reporting | 45.0 MiB / 256 MiB | 0.32% |
| etip_admin | 44.8 MiB / 256 MiB | 0.29% |
| etip_analytics | 44.7 MiB / 256 MiB | 0.32% |
| etip_alerting | 43.6 MiB / 256 MiB | 0.28% |
| etip_customization | 43.2 MiB / 256 MiB | 0.70% |
| etip_ioc_intelligence | 40.6 MiB / 512 MiB | 0.26% |
| etip_onboarding | 39.9 MiB / 256 MiB | 0.30% |
| etip_malware_intel | 39.6 MiB / 512 MiB | 0.31% |
| etip_threat_actor_intel | 39.2 MiB / 512 MiB | 0.27% |
| etip_vulnerability_intel | 39.0 MiB / 512 MiB | 0.31% |
| etip_drp | 38.6 MiB / 256 MiB | 0.26% |
| etip_hunting | 36.7 MiB / 512 MiB | 0.31% |
| etip_nginx | 5.5 MiB / 128 MiB | 0.00% |
| etip_frontend | 4.8 MiB / 64 MiB | 0.00% |

**G2** — host RAM 8.6 GiB used of 15.6 GiB. ETIP containers ≈ 4.9 GiB; the rest is the other project on the box plus OS/page cache. 26 Node services use ~1.2 GiB total, which is the consolidation target for Step 7.
