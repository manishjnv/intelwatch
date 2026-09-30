# SESSION HANDOFF DOCUMENT

**Date:** 2026-09-30
**Session:** 177
**Session Summary:** Step 3 rows **S155–S158b** done, deployed and verified — alerting-service alerts/history/groups (dedup + escalation state as columns), integration-service logs/deliveries/tickets + generic `integration_docs` config/audit table, and drp-service assets/alerts/scans/takedowns/feedback all moved off in-process memory onto Postgres (12 new additive tables). Found and fixed the same session: alerting-service worker and caching-service cache-invalidation listener both dropped the Redis password and used the wrong BullMQ prefix (RCA #66), integration exports sent hard-coded demo IOCs (RCA #67), `integration_docs`'s first-cut primary key would have let two doc kinds collide (RCA #68, caught in review).

## ✅ Changes Made (Session 177)

| Commit(s) | Description |
|---|---|
| `1cbe235` | feat: Step 3 S155 alerting alerts/history/groups/dedup/escalation → Postgres |
| `1117349` | feat: Step 3 S156+S157 integration records + config → Postgres, real-data exports |
| `a33934c` | feat: Step 3 S158 drp assets/alerts/scans/takedowns/feedback → Postgres |
| `914274e` | fix: BullMQ workers dropped the Redis password (NOAUTH) — alerting + caching listener (RCA #66) |
| `36911c6` | docs: S177 Step 3 S155-S158 session doc, RCA #66-68, DECISION-051, spec + backlog |
| merge (PR #69 → `e10897d`) | PR #69 merged; CI/CD run 36680150769 all green (Test/Type-check/Lint/Audit, Build & Push, Deploy to VPS 7m50s, E2E pipeline smoke tests) |
| (this commit) | docs: post-deploy stats update — PROJECT_STATE, stats HTML, RCA row, README badge, module docs, PENDING_WORK, handoff |

VPS HEAD `e10897d`, 32/32 `etip_` containers healthy. alerting-service 417/417, integration-service 505/505, drp-service 351/351, caching-service 114/114. Real monorepo total **9,524 passed + 2 skipped, 0 failed, 33 packages** (CI run 36680150769; was 9,394 + 2).

## 📁 Files / Documents Affected (Session 177)

**New:** `apps/alerting-service/src/repository-prisma-alerts.ts`, `apps/drp-service/src/{prisma,repository,repository-prisma,repository-prisma-alerts}.ts`, `apps/integration-service/src/services/{doc-repo,doc-repo-prisma,records-repo,records-repo-prisma,ioc-client}.ts`, matching test files, `docs/S177_STEP3_PERSISTENCE_S155_S158.md`.

**Modified (code):** `prisma/schema.prisma` (+12 additive models), `pnpm-lock.yaml`, `docker-compose.etip.yml` (`etip_drp` DB URL + depends_on + memory limit, `etip_ioc_intelligence` caller allowlist), `scripts/memory-store-baseline.txt` (158 → 117), `apps/alerting-service/src/{repository,index}.ts` + routes/services/worker/handler, `apps/integration-service/src/{index,routes/*,services/*}.ts`, `apps/drp-service/src/{index,config,schemas/store}.ts` + 16 services + 5 routes, `apps/caching-service/src/workers/event-listener.ts` (RCA #66 fix), `apps/alerting-service/src/workers/alert-worker.ts` (rethrows `DB_UNAVAILABLE`). Deleted: `apps/alerting-service/src/services/dedup-store.ts`.

**Modified (docs):** `docs/PROJECT_STATE.md`, `docs/SESSION_HANDOFF.md`, `docs/DEPLOYMENT_RCA.md` (Issues 66–68 + S177 row), `docs/ETIP_Project_Stats.html`, `docs/PENDING_WORK.md`, `README.md`, `docs/modules/{alerting-service,digital-risk-protection,caching-service}.md`, `apps/integration-service/README.md`, `docs/roadmap/STEP_03_PERSISTENCE.md`, `docs/DECISIONS_LOG.md` (DECISION-051).

## 🔧 Decisions & Rationale (Session 177)

**DECISION-051** — one generic `integration_docs` table (primary key `(kind, id)`) instead of Redis JSON or eight bespoke Prisma models for S157's config/audit stores (routing rules, field-mapping presets, ticket templates, TAXII collections + objects, export schedules + runs, credential rotations, audit entries, webhook retry configs). This pattern is now the template for S159 hunting-service — **not** `RedisJsonStore` as-is.

## 🧪 Deploy Verification Results (Session 177)

```
PR #69 → e10897d : CI run 36680150769 — Test/Type-check/Lint/Audit ✓, Build & Push ✓,
Deploy to VPS ✓ (7m50s), E2E pipeline smoke tests ✓.
VPS HEAD e10897d, 32/32 etip_ containers healthy.
Tables: alerts, alert_history, alert_groups, integration_logs, integration_deliveries,
integration_tickets, integration_docs, drp_assets, drp_alerts, drp_scans, drp_takedowns,
drp_alert_feedback (12, all confirmed).
Logs: etip_alerting "Alerting persistence: Postgres", etip_drp "DRP persistence: Postgres",
etip_integration "IntegrationStore hydrated from DB". NOAUTH count = 0 in etip_alerting,
etip_integration, etip_drp, etip_caching since deploy. 0 "fall back"/"in-memory" lines.
VPS acceptance (throwaway tenant, rows deleted after):
  alerting — 2 jobs through the real bull queue → worker → 1 alert (dedup_count 2),
    1 history row, 1 group.
  integration — TAXII collection doc + its objects doc (same id) both intact (RCA #68
    regression check); foreign-tenant save → 409 CONFLICT, log row persisted; export of a
    real tenant → 25 real IOC records, no demo values (RCA #67 check).
  drp — asset persisted; foreign-tenant read → null; foreign-tenant save → 409.
  docker restart etip_alerting etip_integration etip_drp → all data still there, alert/group
    served by the alerting API afterward.
Redis: etip-cache-invalidate backlog 550,602 → 0 within ~10 min of deploy (completed set
  capped at 1,000); used memory 139.00M → 95.33M; 12 stale raw entries in
  bull:etip-alert-evaluate:wait deleted before deploy (RCA #66 leftovers, not real jobs).
Tests: alerting-service 377→417, integration-service 458→505, drp-service 310→351,
  caching-service 112→114. Real monorepo total 9,524 passed + 2 skipped, 0 failed,
  33 packages (was 9,394 + 2).
Security: codex:rescue verdict ACCEPT (all by-id paths, save helpers, integration_docs key,
  IOC export fetch, cross-tenant background jobs, error paths across all 3 services).
```

## ⚠️ Open Items / Next Steps (Session 177)

**Full backlog: `docs/PENDING_WORK.md`** (all roadmap steps, SEO G1–G7 + weekly brief B1–B3, standing backlog, owner inputs, stale docs). Ordered queue (one task per fresh session):

1. **Step 3 row S159** — hunting-service → Postgres. Use a generic `hunting_docs` table like `integration_docs` (DECISION-051 pattern), **not** `RedisJsonStore` as-is. Persist hunt playbook executions keyed by (tenant, hunt). Delete the 8 remaining hunting lines from `scripts/memory-store-baseline.txt`.
2. Rest of Step 3: S159b archive rebuild (incl. deleting MinIO sample objects), S159c analytics tenant trends, S159d onboarding, S159e offboarding purge (must now also delete from the 12 new S177 tables plus the 4 S154 alert tables).
3. Wiring fixes from the S173 sweep (see PENDING_WORK §3); S177 follow-ups (admin-service raw-LPUSH producer, api-gateway quota-enforcement raw-LPUSH, ALERT_EVALUATE producers missing retry/backoff, integration DLQ "retry" doesn't resend, exports support only `iocs`, `RedisJsonStore` data-loss traps, alert worker concurrency-5 dedup race, escalation dispatcher single-instance assumption, `integration-store.ts` at 397/400 lines).
4. AI enrichment runner (DECISION-045).
5. Graph visual redesign — needs owner reference designs.
6. Owner-scheduled security fix (includes private items — see private notes); owner go-ahead + adversarial review; before the first real customer.
7. Folded in, no own session: audit PR 3 leftovers, remaining `isDemo` hooks, S174 plan-gate leftovers, alert notification delivery (log-only today).
8. Parallel any time: SEO G1 (sitemap from routes + self-hosted fonts, small frontend task).

**Owner actions:** none blocking. Still open: graph designs, security-fix go-ahead, `PageStatsBar` OK, Step 15 P2 decisions, DECISION-032, SEO O-S1, brief O-B1–B3.

## 🔁 How to Resume (Session 178)

```
Run /session-start, then start Step 3 row S159 (hunting-service → Postgres:
spec docs/roadmap/STEP_03_PERSISTENCE.md). Module: hunting-service.
Follow the DECISION-051 pattern from S157 (a single generic table, `hunting_docs`,
primary key (kind, id), not RedisJsonStore) for hunting's config/audit-style stores;
reuse the Repo<T>/MemoryRepo/dbCall pattern from src/repository.ts in alerting-service/
drp-service for anything that needs a dedicated table. prisma/schema.prisma additive
models only (D2); DB error → 503, never a memory fallback (D3); by-id lookups
tenant-scoped + cross-tenant 404 tests; persist playbook executions keyed by
(tenant, hunt); delete the remaining 8 hunting lines from
scripts/memory-store-baseline.txt. Security-adjacent → codex:rescue before push.

Frozen / do-not-touch without explicit instruction: shared-* packages (Tier 1, api-gateway
included) — additive only, list every consumer before any change; shared-ui needs owner approval
for any PageStatsBar change. intelwatch.in and ti-platform-* containers — never touch.
nginx conf.d changes must pass `nginx -t` inside the live container before merge and must not
add a server-level `set` for any variable read inside an auth_request location (RCA #64).
Stage explicit paths only — private untracked .docx / AGENTS.md / setup-breakglass.sh live in the tree.
```

## Agent Utilization (Session 177)

- **Opus:** plan + code reading, Sonnet contract, diff critique, VPS acceptance verification, PR/merge/deploy watch, docs review, memory.
- **Sonnet:** S155/S156-S157/S158 implementation, RCA #66 fix (alerting + caching listener), S177 change doc + module docs, post-deploy docs sweep.
- **codex:rescue:** verdict ACCEPT (all by-id paths, save helpers, `integration_docs` key, IOC export fetch, cross-tenant background jobs, error paths).

Routing telemetry:
- sonnet · S155 alerting implementation · reworked: N
- sonnet · S156+S157 integration implementation · reworked: N
- sonnet · S158 drp implementation · reworked: N
- sonnet · RCA #66 BullMQ password/prefix fix (alerting + caching) · reworked: N
- sonnet · S177 docs + post-deploy docs sweep · reworked: N
- codex:rescue · adversarial security review · reworked: N
