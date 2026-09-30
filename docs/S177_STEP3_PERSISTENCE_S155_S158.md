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
| alerting-service | 377 | 417 |
| integration-service | 458 | 505 |
| drp-service | 310 | 351 |
| caching-service | 112 | 114 |

Monorepo total: **9,524 passed, 2 skipped, 0 failed, 33 packages** (was 9,394 passed + 2 skipped at S176).

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

PR #69 merged as `e10897d` (merge commit "Merge pull request #69 from manishjnv/s177/step3-persistence"). CI/CD run 36680150769: Test/Type-check/Lint/Audit ✓, Build & Push ✓, Deploy to VPS ✓ (7m50s), E2E pipeline smoke tests ✓.

VPS HEAD `e10897d`, **32/32** `etip_*` containers healthy.

Post-deploy logs: `etip_alerting` logs "Alerting persistence: Postgres", `etip_drp` logs "DRP persistence: Postgres", `etip_integration` logs "IntegrationStore hydrated from DB"; `NOAUTH` count = 0 in `etip_alerting`, `etip_integration`, `etip_drp`, `etip_caching` since deploy; 0 "fall back"/"in-memory" lines across all four.

VPS acceptance (run inside each container against real Postgres, throwaway tenant, rows deleted after):
- **alerting** — two jobs pushed through the real `bull` queue → worker → 1 alert with `dedup_count` 2, 1 history row, 1 group.
- **integration** — a TAXII collection doc and its objects doc (same id) both intact (RCA #68 regression check); foreign-tenant save → 409 CONFLICT, log row persisted; export of a real tenant → 25 real IOC records, no demo values (RCA #67 check).
- **drp** — asset persisted; foreign-tenant read → null; foreign-tenant save → 409.
- After `docker restart etip_alerting etip_integration etip_drp`, all data was still there and the alert/group was served by the alerting API.

Redis: `etip-cache-invalidate` backlog 550,602 → 0 within ~10 min of deploy (completed set capped at 1,000); Redis used memory 139.00M → 95.33M; 12 stale raw entries in `bull:etip-alert-evaluate:wait` were deleted before deploy (see "Pre-deploy VPS operation" above).

Security: codex:rescue verdict **ACCEPT**.

**Next:** Step 3 row S159 hunting-service → Postgres (generic `hunting_docs` table, DECISION-051 pattern — NOT `RedisJsonStore`), then S159b–e.

## Part 2 — S159, S159d, S159e (PR #70)

**Branch:** `s177/hunting-persistence-s159`. Commits: `b99d98d` (schema + compose), `3e2c04b` (S159 hunting), `0f0d0c3` (S159d onboarding + baseline), `17a7737` (S159e purge). Restore tag `safe-point-2026-09-30-s159`.

### What changed and why

Continuing Step 3, this PR moves hunting-service off its remaining in-memory Maps and onto Postgres (following the DECISION-051 pattern from S157, not `RedisJsonStore` — see the S159 note in `docs/roadmap/STEP_03_PERSISTENCE.md` §5.4), persists onboarding's module readiness/checklist/demo/tour state to Redis (S159d), and widens the offboarding purge worker to cover every tenant table including the S177 Part 1 and S159 tables (S159e).

### S159 — hunting-service → Postgres

One generic table `hunting_docs`, keyed `(kind, id)` (id `varchar(100)`, tenant_id uuid) — the same DECISION-051 pattern used for `integration_docs`, **not** `RedisJsonStore`. 8 kinds: `hunt_session`, `hunt_template`, `correlation_lead`, `hunt_comment`, `hunt_share`, `hunt_evidence`, `hunt_hypothesis`, `playbook_execution`.

- Playbook executions are persisted per tenant and hunt; the playbook start/step/progress routes resolve the hunt for the caller's tenant first.
- Every save is `updateMany where {kind, id, tenant_id}` then create — a foreign id is a 409 CONFLICT, same convention as S154–S158.
- Deleting a hunt cascades to its child docs.
- Explicit saves were added where code used to mutate objects held by the old Maps directly: session timeline events, expired-session cleanup, template usage count, hypothesis verdict/evidence links, playbook step completion, comment edit.
- Compose: `etip_hunting` gets `TI_DATABASE_URL` + `depends_on etip_postgres` (`service_healthy`); memory stays 512M.
- `package.json`: `@prisma/client ^5.22.0` added to hunting-service.

### S159d — onboarding → Redis

Module readiness, checklist snapshots, demo-seeded flag, and tour-completed flag move to Redis via the existing WizardStore client: `etip:{tenantId}:modules` (enabled + configured modules), `etip:{tenantId}:checklist` (snapshots, max 10), `etip:{tenantId}:demo-seeded`, `etip:{tenantId}:tour-completed`. Falls back to memory only when no Redis client is configured (tests). Redis errors propagate — same policy as the wizard store. Integration test results stay in memory (cache).

### S159e — offboarding purge widened

`apps/user-management-service/src/services/offboarding-purge-worker.ts`: `purgeTenant()` now also deletes:

- The 18 Step 3 tables: `integrations`, `integration_logs`, `integration_deliveries`, `integration_tickets`, `integration_docs`, `alert_rules`, `alert_channels`, `alert_escalation_policies`, `alert_maintenance_windows`, `alerts`, `alert_history`, `alert_groups`, `drp_assets`, `drp_alerts`, `drp_scans`, `drp_takedowns`, `drp_alert_feedback`, `hunting_docs`.
- 8 older tenant tables the worker had missed: `webhook_subscriptions`, `tenant_feed_subscriptions`, `tenant_ioc_overlays`, `tenant_item_consumption`, `feed_quota_plan_assignments`, `access_reviews`, `compliance_reports`, `mfa_enforcement_policies` (the nullable-tenant tables match the tenant only).

`ExternalPurger` also deletes Redis `etip:{tenantId}:*` and now rejects any tenant id that is not a UUID. First unit tests added for the purge worker.

**Not changed:** nothing schedules the purge worker yet (S148 follow-up, still open) — see `docs/PENDING_WORK.md` §3.

### Files touched

- **hunting-service:** Prisma schema (`hunting_docs`), repository layer for the 8 kinds, session/template/lead/comment/share/evidence/hypothesis/playbook services converted to await the repo, `src/index.ts`, `src/config.ts`, compose, `package.json`.
- **onboarding:** `services/module-readiness.ts`, `services/checklist-persistence.ts`, `services/demo-seeder.ts`, `services/welcome-dashboard.ts`, `src/index.ts`.
- **user-management-service:** `src/services/offboarding-purge-worker.ts`, its `ExternalPurger` (Redis pattern-delete + UUID validation), first unit test file for the worker.

### Tests

| Service | Before | After |
|---|---|---|
| hunting-service | 222 | 251 |
| onboarding | 267 | 276 |
| user-management-service | 371 | 375 |

Full local gate: 9,566 passed / 2 skipped / 0 failed.

### CI guard

`scripts/memory-store-baseline.txt`: 117 → 102 non-empty lines (8 hunting lines + 7 onboarding lines removed from the ratchet). Guard passes.

### Security review

codex:rescue adversarial review. **Verdict: REVISE.** Findings, both fixed in this PR:

1. The offboarding purge missed the 8 older tenant tables listed above.
2. `ExternalPurger` accepted non-UUID tenant ids — a `*` id could have widened the Redis pattern-delete beyond the intended tenant.

Hunting by-id paths, the `hunting_docs` key, cascade delete, the onboarding Redis keys, and error paths across all three services were reviewed clean.

### New backlog findings (added to `docs/PENDING_WORK.md` §3)

- **Offboarding purge worker is never scheduled** — no daily job calls `runPurgeCheck`, `ExternalPurger.fromEnv` is never invoked, and `etip_user_management` lacks the Neo4j/ES env it would need. Offboarded tenants are never hard-deleted today. Wiring the scheduler is destructive and needs an owner go-ahead.
- **Onboarding's "Seed Demo Data" button** (`apps/frontend/src/pages/OnboardingPage.tsx:257`, `POST /onboarding/welcome/seed-demo`) writes fabricated IOCs/actors/malware/vulnerabilities into the tenant's real stores — a DECISION-048 conflict. Owner decision needed: remove the button/route, or restrict to a demo tenant.
- The "real" seeding path, `POST /welcome/seed-demo` (`apps/onboarding/src/routes/welcome.ts:62–64`), also seeds demo vulnerabilities.

### Step 3 status after this PR

Rows done: 154-0, 154, 155, 156, 157, 158a, 158b, 159, 159d, 159e. Remaining: 159b (caching-service archive rebuild from MinIO — archive is currently off), 159c (analytics tenant trends — grouped with the owner-scheduled security fix), and the backlog modules (reporting, customization, user-management in-memory stores, correlation-engine).

### How to verify (VPS acceptance, spec §9)

```bash
docker exec etip_postgres psql -U etip_user -d etip -c "\dt hunting_docs"

docker logs etip_hunting --since 1h 2>&1 | grep -ci "fall.*back\|in-memory"
docker logs etip_onboarding --since 1h 2>&1 | grep -ci "fall.*back\|in-memory"
# each → 0

docker restart etip_hunting etip_onboarding
# data created before restart is still there after

bash scripts/check-memory-stores.sh && echo OK
```

### Rollback

- **Local:** `git reset --hard safe-point-2026-09-30-s159`.
- **VPS:** redeploy the previous image. `hunting_docs` is additive and can stay in Postgres — harmless if the app doesn't use it.

### Deploy result

PR #70 merged as `47201c0` (merge commit "Merge pull request #70 from manishjnv/s177/hunting-persistence-s159"). CI/CD run 36688149148: Test ✓, Build & Push ✓, Deploy to VPS ✓.

VPS HEAD `47201c0`, **32/32** `etip_*` containers healthy.

Tests: hunting-service 222 → 251, onboarding 267 → 276, user-management-service 371 → 375. Real monorepo total **9,566 passed, 2 skipped, 0 failed, 33 packages** (was 9,524 after PR #69).

Post-deploy: `hunting_docs` table exists; `etip_hunting` logs "Hunting persistence: Postgres"; `NOAUTH` count = 0 and 0 fallback/in-memory lines across `etip_hunting`, `etip_onboarding`, `etip_user_management`, `etip_alerting`, `etip_caching`.

VPS acceptance (`scripts/vps-acceptance/s177-hunting.mjs`, `s177-onboarding.mjs`, run inside the containers against real Postgres/Redis, throwaway tenant, rows/keys deleted after):
- **hunting** — a session doc and a playbook_execution doc with the same id both intact, 1 evidence doc, foreign-tenant read → null, foreign-tenant save → 409 CONFLICT, all still there after `docker restart etip_hunting etip_onboarding`.
- **onboarding** — module state written to `etip:{tenantId}:modules` and read back by a fresh `ModuleReadinessChecker` after the restart.

Security: codex:rescue verdict **REVISE** — 2 findings, both fixed before merge (see "Security review" above).

**Next:** wire the offboarding purge scheduler (owner go-ahead needed — destructive; `ExternalPurger.fromEnv` needs Neo4j/ES env on `etip_user_management`), then the owner decision on onboarding's "Seed Demo Data" button, then S159b (caching archive rebuild) / backlog modules / wiring fixes / AI runner / graph redesign / security fix. SEO G1 in parallel. Full list: `docs/PENDING_WORK.md`.
