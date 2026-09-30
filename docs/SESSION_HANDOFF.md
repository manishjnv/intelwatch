# SESSION HANDOFF DOCUMENT

**Date:** 2026-09-30
**Session:** 177 part 2
**Session Summary:** Step 3 rows **S159/S159d/S159e** done, deployed and verified — hunting-service moved off its remaining in-memory Maps onto Postgres (one generic `hunting_docs` table, key `(kind, id)`, 8 kinds, DECISION-051 pattern, not `RedisJsonStore`), onboarding's module readiness/checklist/demo/tour state moved to Redis, and the offboarding purge worker widened to cover every tenant table plus Redis `etip:{tenantId}:*`. codex:rescue found 2 gaps (purge missed 8 older tenant tables; `ExternalPurger` accepted non-UUID tenant ids) — both fixed before merge. PR #70 merged `47201c0`, CI/CD run 36688149148 green. VPS HEAD `47201c0`, 32/32 healthy. hunting-service 251/251, onboarding 276/276, user-management-service 375/375. Real monorepo total **9,566 passed, 2 skipped, 0 failed, 33 packages** (was 9,524).

Previous (Session 177 part 1): Step 3 rows **S155–S158b** done, deployed and verified — alerting-service alerts/history/groups (dedup + escalation state as columns), integration-service logs/deliveries/tickets + generic `integration_docs` config/audit table, and drp-service assets/alerts/scans/takedowns/feedback all moved off in-process memory onto Postgres (12 new additive tables). Found and fixed the same session: alerting-service worker and caching-service cache-invalidation listener both dropped the Redis password and used the wrong BullMQ prefix (RCA #66), integration exports sent hard-coded demo IOCs (RCA #67), `integration_docs`'s first-cut primary key would have let two doc kinds collide (RCA #68, caught in review). PR #69 merged `e10897d`.

## ✅ Changes Made (Session 177 part 2)

| Commit(s) | Description |
|---|---|
| `b99d98d` | feat: Step 3 S159 schema (`hunting_docs`, key `(kind, id)`) + `etip_hunting` DB wiring |
| `3e2c04b` | feat: Step 3 S159 hunting-service → Postgres (`hunting_docs`) |
| `0f0d0c3` | feat: Step 3 S159d onboarding module readiness/checklist/demo/tour state → Redis |
| `17a7737` | feat: Step 3 S159e offboarding purge covers every tenant table + tenant Redis keys |
| `ffa77d4` | docs: S177 part 2 (S159/S159d/S159e) session doc, spec, backlog + VPS acceptance scripts |
| merge (PR #70 → `47201c0`) | PR #70 merged; CI/CD run 36688149148 green (Test, Build & Push, Deploy to VPS) |
| (this commit) | docs: post-deploy stats update — PROJECT_STATE, stats HTML, RCA row, README badge, module docs, PENDING_WORK, handoff |

VPS HEAD `47201c0`, 32/32 `etip_` containers healthy. hunting-service 251/251, onboarding 276/276, user-management-service 375/375. Real monorepo total **9,566 passed, 2 skipped, 0 failed, 33 packages** (CI run 36688149148; was 9,524).

## 📁 Files / Documents Affected (Session 177 part 2)

**New:** `apps/hunting-service/src/{doc-repo,doc-repo-prisma,prisma}.ts`, `apps/hunting-service/tests/{doc-repo-prisma,cross-tenant-routes,persistence-restart}.test.ts`, `apps/onboarding/src/services/demo-seed-data.ts`, `apps/onboarding/tests/redis-persistence.test.ts`, `apps/user-management-service/tests/offboarding-purge-worker.test.ts`, `scripts/vps-acceptance/s177-{hunting,onboarding}.mjs`, `docs/S177_STEP3_PERSISTENCE_S155_S158.md` (Part 2 section).

**Modified (code):** `prisma/schema.prisma` (+`hunting_docs`), `docker-compose.etip.yml` (`etip_hunting` DB URL + depends_on), `scripts/memory-store-baseline.txt` (117 → 102), `apps/hunting-service/src/{index,config,routes/*,services/*}.ts` (8 services converted to await the repo), `apps/onboarding/src/{index,services/module-readiness,services/checklist-persistence,services/demo-seeder,services/welcome-dashboard,routes/modules,routes/welcome}.ts`, `apps/user-management-service/src/services/{offboarding-purge-worker,external-purge}.ts`, `apps/hunting-service/package.json` (`@prisma/client`).

**Modified (docs):** `docs/PROJECT_STATE.md`, `docs/SESSION_HANDOFF.md`, `docs/DEPLOYMENT_RCA.md` (S177 part 2 deploy-log row), `docs/ETIP_Project_Stats.html`, `docs/PENDING_WORK.md`, `README.md`, `docs/modules/{onboarding,user-management-service}.md`, `docs/roadmap/STEP_03_PERSISTENCE.md`.

## 🧪 Deploy Verification Results (Session 177 part 2)

```
PR #70 → 47201c0 : CI run 36688149148 — Test ✓, Build & Push ✓, Deploy to VPS ✓.
VPS HEAD 47201c0, 32/32 etip_ containers healthy.
Table: hunting_docs (confirmed).
Logs: etip_hunting "Hunting persistence: Postgres". NOAUTH count = 0 and 0
  fallback/in-memory lines across etip_hunting, etip_onboarding,
  etip_user_management, etip_alerting, etip_caching.
VPS acceptance (throwaway tenant, rows/keys deleted after):
  hunting — a session doc and a playbook_execution doc with the same id both
    intact, 1 evidence doc, foreign-tenant read -> null, foreign-tenant save
    -> 409 CONFLICT, all still there after docker restart etip_hunting
    etip_onboarding.
  onboarding — module state written to etip:{tenantId}:modules and read back
    by a fresh ModuleReadinessChecker after the restart.
Tests: hunting-service 222->251, onboarding 267->276,
  user-management-service 371->375. Real monorepo total 9,566 passed,
  2 skipped, 0 failed, 33 packages (was 9,524).
Security: codex:rescue verdict REVISE -> 2 findings, both fixed before merge
  (offboarding purge missed 8 older tenant tables; ExternalPurger accepted
  non-UUID tenant ids).
```

## Session 177 part 1 — original content below

## ✅ Changes Made (Session 177 part 1)

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

## ⚠️ Open Items / Next Steps (Session 177 part 2)

**Full backlog: `docs/PENDING_WORK.md`** (all roadmap steps, SEO G1–G7 + weekly brief B1–B3, standing backlog, owner inputs, stale docs). Ordered queue (one task per fresh session):

1. **Wire the offboarding purge scheduler** — `runPurgeCheck` exists but no daily job calls it, `ExternalPurger.fromEnv` is never invoked, and `etip_user_management` lacks the Neo4j/ES env it would need. Destructive; needs an owner go-ahead first.
2. Owner decision on onboarding's "Seed Demo Data" button (`apps/frontend/src/pages/OnboardingPage.tsx:257`, `POST /onboarding/welcome/seed-demo`) — it writes fabricated IOCs/actors/malware/vulnerabilities into the tenant's real stores (DECISION-048 conflict). Remove the button/route, or restrict to a demo tenant.
3. **Step 3 row S159b** — caching-service archive rebuild from MinIO (archive is currently off), then S159c analytics tenant trends (grouped with the owner-scheduled security fix). Backlog modules: reporting, customization, user-management in-memory stores, correlation-engine.
4. Wiring fixes from the S173 sweep (see PENDING_WORK §3); S177 follow-ups (admin-service raw-LPUSH producer, api-gateway quota-enforcement raw-LPUSH, ALERT_EVALUATE producers missing retry/backoff, integration DLQ "retry" doesn't resend, exports support only `iocs`, `RedisJsonStore` data-loss traps, alert worker concurrency-5 dedup race, escalation dispatcher single-instance assumption, `integration-store.ts` at 397/400 lines).
5. AI enrichment runner (DECISION-045).
6. Graph visual redesign — needs owner reference designs.
7. Owner-scheduled security fix (includes private items — see private notes); owner go-ahead + adversarial review; before the first real customer.
8. Folded in, no own session: audit PR 3 leftovers, remaining `isDemo` hooks, S174 plan-gate leftovers, alert notification delivery (log-only today).
9. Parallel any time: SEO G1 (sitemap from routes + self-hosted fonts, small frontend task).

**Owner actions:** offboarding purge scheduler go-ahead (destructive), "Seed Demo Data" decision. Still open: graph designs, security-fix go-ahead, `PageStatsBar` OK, Step 15 P2 decisions, DECISION-032, SEO O-S1, brief O-B1–B3.

## 🔁 How to Resume (Session 178)

```
Run /session-start. Next task needs an owner go-ahead first: wire the offboarding
purge scheduler (runPurgeCheck is never called by a daily job, ExternalPurger.fromEnv
is never invoked, and etip_user_management lacks the Neo4j/ES env it would need —
this is destructive). If the owner has not yet approved, move to the next queue item:
the owner decision on onboarding's "Seed Demo Data" button (DECISION-048 conflict),
then Step 3 row S159b (caching-service archive rebuild from MinIO — spec
docs/roadmap/STEP_03_PERSISTENCE.md). Module: user-management-service (purge) or
caching-service (S159b) depending on which is unblocked.

Frozen / do-not-touch without explicit instruction: shared-* packages (Tier 1, api-gateway
included) — additive only, list every consumer before any change; shared-ui needs owner approval
for any PageStatsBar change. intelwatch.in and ti-platform-* containers — never touch.
nginx conf.d changes must pass `nginx -t` inside the live container before merge and must not
add a server-level `set` for any variable read inside an auth_request location (RCA #64).
Stage explicit paths only — private untracked .docx / AGENTS.md / setup-breakglass.sh live in the tree.
```

## Agent Utilization (Session 177 part 2)

- **Opus:** plan + code reading, Sonnet contract, diff critique, VPS acceptance verification, PR/merge/deploy watch, docs review, memory.
- **Sonnet:** S159 hunting implementation, S159d onboarding implementation, S159e purge-widening implementation, S177 part 2 change doc + module docs, post-deploy docs sweep.
- **codex:rescue:** verdict REVISE — 2 findings (purge missed 8 older tenant tables; `ExternalPurger` accepted non-UUID tenant ids), both fixed pre-merge.

Routing telemetry:
- sonnet · S159 hunting-service implementation · reworked: N
- sonnet · S159d onboarding Redis persistence · reworked: N
- sonnet · S159e offboarding purge widening · reworked: Y (codex:rescue REVISE, 2 findings fixed same PR)
- sonnet · S177 part 2 docs + post-deploy docs sweep · reworked: N
- codex:rescue · adversarial security review · reworked: N

---

## Session 177 part 1 — Agent Utilization (superseded, kept for history)

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
