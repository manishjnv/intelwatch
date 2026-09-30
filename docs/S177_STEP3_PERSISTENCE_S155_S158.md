# S177 — Step 3 persistence, rows S155–S158b (alerting, integration, DRP)

**Date:** 2026-09-30 · **Session:** 177 · Branch `s177/step3-persistence` from master `b2572b6` · safe-point tag `safe-point-2026-09-30-s177`

Spec: `docs/roadmap/STEP_03_PERSISTENCE.md` §5.1–§5.3, §6.1–§6.3. One PR, one deploy (owner asked to ship the rows together).

## What changed and why

Continuing Step 3 (S154 shipped alerting rules/channels/escalations/maintenance in S176), this session moves the rest of alerting-service plus all of integration-service and drp-service off in-process memory and onto Postgres, so their data survives a container restart/deploy.

Rows done:

- **S155** — alerting-service alerts, alert history, alert groups, dedup, escalation dispatcher, worker → Postgres.
- **S156** — integration-service logs, webhook deliveries + DLQ, tickets → Postgres.
- **S157** — integration-service routing rules, field-mapping presets, ticket templates, TAXII collections + objects, export schedules + runs, credential rotations, audit entries, webhook retry configs → Postgres (one generic table, DECISION-051); exports now use real IOCs instead of hard-coded demo values (RCA #67).
- **S158a + S158b** — drp-service assets, alerts (incl. AI enrichment + evidence chain as JSON columns), scans, takedowns, feedback → Postgres.

## New tables (12, all additive)

All new models follow the Step 3 convention: `id uuid` default-generated, `tenant_id uuid` with **no** relation to `Tenant` (purge is a separate task, S159e), snake_case `@@map`, additive-only columns.

| Table | Service | Notes |
|---|---|---|
| `alerts` | alerting | dedup (`fingerprint`, `dedup_count`, `last_seen_at`) and escalation state (`escalation_policy_id`, `escalation_step`, `next_escalation_at`) live as columns here, not separate stores |
| `alert_history` | alerting | append-only audit trail |
| `alert_groups` | alerting | group membership is `alert_ids` array (not `groupId` on `alerts`) |
| `integration_logs` | integration | delivery logs, 30-day retention purge |
| `integration_deliveries` | integration | webhook deliveries + DLQ (one table, `status`) |
| `integration_tickets` | integration | Jira/ServiceNow tickets |
| `integration_docs` | integration | generic config/audit table, primary key `(kind, id)` (DECISION-051) — routing rules, field-mapping presets, ticket templates, TAXII collections + objects, export schedules + runs, credential rotations, audit entries, webhook retry configs |
| `drp_assets` | drp | unique `(tenant_id, type, value)` |
| `drp_alerts` | drp | `asset_id` is free text — callers pass a domain or brand name, batch scans a comma-joined list |
| `drp_scans` | drp | `asset_id` same as above |
| `drp_takedowns` | drp | — |
| `drp_alert_feedback` | drp | — |

## Files touched

**alerting-service:**
- `src/repository.ts`, `src/repository-prisma-alerts.ts` (new) — repos for alerts, alert history, alert groups.
- `src/services/{alert-store,alert-history,alert-group-store,escalation-dispatcher}.ts` — async, repo-backed.
- `src/workers/alert-worker.ts` — retry-safe, rethrows `DB_UNAVAILABLE`.
- `src/routes/{alerts,groups,stats}.ts`, `src/index.ts` — await the stores; wire repos when `TI_DATABASE_URL` is set.
- `src/handlers/global-ioc-alert-handler.ts` — await.
- Deleted: `src/services/dedup-store.ts` (dedup is now columns on `alerts`).

**integration-service:**
- `src/services/{records-repo,records-repo-prisma,doc-repo,doc-repo-prisma,ioc-client}.ts` (new) — `records-repo*` for the dedicated-table stores (logs, deliveries, tickets), `doc-repo*` for the generic `integration_docs` table, `ioc-client.ts` for the real-IOC export fix (RCA #67).
- `src/services/integration-store.ts` and the 8 converted stores (routing rules, field-mapping presets, ticket templates, TAXII collections + objects, export schedules + runs, credential rotations, audit entries, webhook retry configs) — async, repo-backed.
- `src/routes/{export,advanced,p2-routes,integrations,webhooks}.ts`, `src/index.ts` — await; export routes call `ioc-client.ts` for real data.
- `package.json`, `pnpm-lock.yaml` — `@prisma/client ^5.22.0`.

**drp-service:**
- `src/{prisma,repository,repository-prisma,repository-prisma-alerts}.ts` (new).
- `src/schemas/store.ts` — thin async facade over the repos, same accessor names.
- 16 services + 5 routes — await the facade instead of touching Maps directly.
- `src/index.ts`, `src/config.ts` — DB URL + repo wiring.

## Design notes

- **Alert group membership** stays an `alert_ids` array on `alert_groups` (not a `groupId` column on `alerts`) — keeps the existing API shape.
- **`alerts.rule_id`** is `varchar(100)`, not uuid — global IOC alerts use the literal rule id `global-ioc-critical`, which is not a UUID.
- **Dedup** is columns on `alerts` (`fingerprint`, `dedup_count`, `last_seen_at`); the standalone `DedupStore` class is deleted.
- **Escalation state** is columns on `alerts` (`escalation_policy_id`, `escalation_step`, `next_escalation_at`); the dispatcher's in-memory pending map is deleted.
- **Alert status changes are conditional on the current status** — a concurrent change returns 409 CONFLICT instead of silently overwriting.
- **`rule-engine`'s event buffer stays in memory**, tagged `memory-ok: buffer` — it's a rebuildable threshold window, not business data.
- **DRP signals** stay in memory, capped at 5,000 per tenant; signal stats, correlations, and asset risk scores stay in memory as derived data (recomputed on request).
- **`drp_alerts.asset_id` / `drp_scans.asset_id`** are free text — callers pass a domain or brand name, and batch scans pass a comma-joined list.
- **Every by-id write in all three services** (including the S154 alerting repos) is `updateMany where {id, tenant_id}` then create — a foreign id is a 409 CONFLICT, never an overwrite.
- **Alert worker** is retry-safe: an event is pushed into the rule-engine buffer only on the first delivery attempt, and the duplicate counter is bumped only on the first attempt; it rethrows `DB_UNAVAILABLE` so the BullMQ job fails (and retries) instead of silently dropping the event; malformed payloads are skipped. This closes the S155 follow-up noted in the S176 doc.
- **Escalation-dispatcher's interval now catches errors** — an unhandled rejection there could previously crash the process.
- **Integration log/delivery writes are best-effort** — a DB outage must not make the webhook loop re-send to the customer; reads fail with 503 `DB_UNAVAILABLE` as everywhere else. A daily retention purge deletes logs and successful deliveries older than 30 days.
- **`integration_docs` key is `(kind, id)`**, not `id` alone — see RCA #68 (a same-id collision across two doc kinds was caught in review before deploy).

## Compose / dependency changes

- `etip_drp`: adds `TI_DATABASE_URL`, `depends_on etip_postgres` (`service_healthy`), memory limit raised 256M → 384M (Prisma engine).
- `etip_ioc_intelligence`: `TI_IOC_SERVICE_CALLERS` default `threat-graph` → `threat-graph,integration-service` (needed for the real-IOC export fix, RCA #67).
- No new secrets or env vars needed on the VPS for this session.

## Bugs fixed

See `docs/DEPLOYMENT_RCA.md` Issues 66–68:

- **Issue 66** — alerting-service worker never received a single ALERT_EVALUATE job: BullMQ queue prefix mismatch between producers and the worker, AND its `parseRedisUrl()` dropped the Redis password (8,180 `NOAUTH` errors in 72 h). The caching-service cache-invalidation listener had the same two bugs (4,084 `NOAUTH` in 72 h, 550,602 jobs queued) — fixed in the same PR (`apps/caching-service/src/workers/event-listener.ts`: password + db passed, no prefix, events older than 1 h skipped, finished jobs trimmed to 1,000). Found while writing the VPS acceptance test. caching-service tests 112 → 114; alerting-service 416 → 417.
- **Issue 67** — integration exports sent hard-coded demo IOCs to real tenants (DECISION-048 violation, server-side, invisible to the frontend honest-empty sweeps).
- **Issue 68** — `integration_docs`'s first-cut primary key (`id` alone) would have let a TAXII collection doc and its objects doc silently overwrite each other; caught in review before deploy, fixed with a composite `(kind, id)` key.

## Decision

`DECISION-051` — one generic `integration_docs` table instead of Redis JSON or eight bespoke Prisma models for S157's config/audit stores. See `docs/DECISIONS_LOG.md`.

## Security review

codex:rescue adversarial review of all by-id paths, the save helpers, the `integration_docs` key, the IOC export fetch, cross-tenant background jobs, and error paths across all three services. **Verdict: ACCEPT, no findings.**

## Tests

| Service | Before | After |
|---|---|---|
| alerting-service | 377 | 416 |
| integration-service | 458 | 505 |
| drp-service | 310 | 351 |

Monorepo total: TBD (post-deploy, from CI).

## CI guard

`scripts/memory-store-baseline.txt`: 158 → 117 non-empty lines (41 lines removed from the ratchet: 7 alerting, 22 integration, 12 drp — the stores converted to repo-backed classes in this session). Guard passes.

## Pre-deploy VPS operation

12 stale raw-JSON entries (queue-health payloads with `tenantId: 'system'`, dated 2026-09-25..27) in the Redis list `bull:etip-alert-evaluate:wait` were deleted before deploy — they are not BullMQ jobs (no job hash), just leftovers from the admin-service raw-LPUSH bug (RCA #66). Deleting them does not affect any real job.

## How to verify (VPS acceptance, spec §9)

```bash
docker exec etip_postgres psql -U etip_user -d etip -c "\dt alert*|integration*|drp_*"
# 12 tables exist (this session) + the 4 from S154

docker logs etip_alerting --since 1h 2>&1 | grep -ci "fall.*back\|in-memory"
docker logs etip_integration --since 1h 2>&1 | grep -ci "fall.*back\|in-memory"
docker logs etip_drp --since 1h 2>&1 | grep -ci "fall.*back\|in-memory"
# each → 0; each service logs Postgres persistence once

docker restart etip_alerting etip_integration etip_drp
# data created before restart is still there after

# TAXII collection created then read back (regression check for RCA #68)

# exports contain no demo values (RCA #67)

bash scripts/check-memory-stores.sh && echo OK
```

## Rollback

- **Local:** `git reset --hard safe-point-2026-09-30-s177`.
- **VPS:** redeploy the previous image. The 12 new tables are additive and can stay in Postgres — harmless if the app doesn't use them.

## Follow-ups

- S159 hunting-service: use Postgres or the `integration_docs` pattern, **not** `RedisJsonStore` as-is (DECISION-051).
- S159e offboarding purge must delete from these 12 tables plus the 4 S154 alert tables.
- admin-service `queue-alert-evaluator.ts:210` raw-LPUSH producer (RCA #66) — tracked in `docs/PENDING_WORK.md`.
- Integration DLQ "retry" only flips status to `retrying` — nothing re-sends yet.
- Exports support only `iocs` entity type — others return 400.
- Full list in `docs/PENDING_WORK.md` §3 (Standing backlog), S177 follow-ups entry.

## Deploy result

TBD (post-deploy).
