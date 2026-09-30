# SESSION HANDOFF DOCUMENT

**Date:** 2026-09-29
**Session:** 175
**Session Summary:** Step 3 (persistence) row `154-0` is the ops prerequisite plus owner decisions D1 and D4 (DECISION-049). Re-verifying spec §3 against current code found two of the four items already done by earlier work: deploy ordering (`scripts/deploy-vps.sh`, S150) already pushes the schema before recreating app containers and fails the deploy if the push fails, and D1 (Redis `noeviction`) was already live from STEP_00B. Only D4 (archive off) and the CI memory-store guard needed new work this session. PR #67 turns off caching-service's archive cron/route by default (`TI_ARCHIVE_ENABLED=false`) so it stops writing sample records to MinIO, and wires a CI ratchet guard against new untagged in-memory stores.

## ✅ Changes Made (Session 175)

| Commit(s) | Description |
|---|---|
| `9c4e242` → merge `3de537f` | PR #67: `TI_ARCHIVE_ENABLED` defaults `false` in caching-service (`config.ts`, `index.ts`, `archive-engine.ts` — `runOnce()` returns `null`, `startCron()` logs and skips); `scripts/check-memory-stores.sh` + `scripts/memory-store-baseline.txt` (158-entry baseline) wired into `.github/workflows/deploy.yml` test job and `Makefile` `check` target; +4 archive-engine tests. |

VPS HEAD `3de537f`, 32/32 `etip_` containers healthy. caching-service 112/112 (was 108). Real monorepo total 9,346 passed + 2 skipped, 0 failed, 33 packages (was 9,342 + 2). Full detail: `docs/S175_STEP3_OPS_PREREQ.md`.

## 📁 Files / Documents Affected (Session 175)

**New doc:** `docs/S175_STEP3_OPS_PREREQ.md`.

**Code touched:** `apps/caching-service/src/config.ts`, `apps/caching-service/src/index.ts`, `apps/caching-service/src/services/archive-engine.ts`, `apps/caching-service/tests/archive-engine.test.ts`, `scripts/check-memory-stores.sh` (new), `scripts/memory-store-baseline.txt` (new), `.github/workflows/deploy.yml`, `Makefile`.

**Modified (docs):** `docs/PROJECT_STATE.md`, `docs/SESSION_HANDOFF.md` (this file), `docs/DEPLOYMENT_RCA.md`, `docs/ETIP_Project_Stats.html`.

## 🔧 Decisions & Rationale (Session 175)

No new DECISION entries this session — DECISION-049 (Step 3 D1–D7 accepted as recommended, recorded in S174) is what this session executes for D1 and D4. No new decision was needed for the deploy-ordering re-verification or the CI guard: both are mechanical follow-through on the already-accepted spec.

## 🧪 Deploy Verification Results (Session 175)

```
PR #67 → 3de537f : caching-service 112/112 (was 108).
                    CI run 36606869933: Test, Build & Push Docker Images, Deploy to VPS all success.
                    CI log: "memory-store guard: OK".
VPS HEAD 3de537f, deploy status ok, log "schema unchanged, skipping push", 32/32 etip
containers healthy. etip_caching log: "Archive disabled (TI_ARCHIVE_ENABLED=false) —
cron not started". Redis maxmemory-policy noeviction. Local /health 200, public
https://intelwatch.in/health 200, /login 200.
Real monorepo test total: 9,346 passed + 2 skipped, 0 failed, 33 packages (was 9,342 + 2).
Reviews: etip-reviewer PASS (non-blocking note: the guard only sees single-line field
declarations). codex:rescue not run — not security-adjacent (config flag + CI script).
No new RCA issues.
```

## ⚠️ Open Items / Next Steps (Session 175)

> **S176 update (2026-09-30):** Step 3 row S154 is DONE and live (PR #68, merge `3e2a73f`) — next is **row S155**. The full consolidated backlog (roadmap steps, SEO + weekly brief track, standing backlog, owner inputs, stale docs) is in **`docs/PENDING_WORK.md`** — read it at session start.

**Ordered task queue (one task per fresh session):**
1. ~~Plan-enforcement gap~~ — DONE S174 (PR #66, owner browser check PASSED).
2. **Step 3 — no business data in memory** (`docs/roadmap/STEP_03_PERSISTENCE.md`; D1–D7 accepted as recommended, DECISION-049). Run the §10 rows in order, one per session. ~~First session (S175): the `154-0` ops row~~ — **DONE this session** (D4 archive off + CI memory-store guard; deploy ordering and D1 were already live, no change needed). **Next: row S154 — alerting-service** (models (7) + rules, channels (encrypted), escalations, maintenance → Postgres; spec §5.1/§6.1). Then S155 alerting, S156/S157 integration, S158a/b DRP, S159 hunting, small ones.
3. Wiring fixes found in the S173 sweep: `apiList` drops pagination totals; broken request bodies (correlation Create Ticket, DRP bulk triage + takedown, Jira/ServiceNow creation form); frontend admin `TenantRecord` type vs real `/admin/tenants` shape; missing/mismatched backend routes (TAXII managed-collection list, global IOC stats, `/ingestion/catalog/subscription-stats`, `/analytics/feed-performance` shape, per-source enrichment breakdown, test-notification route).
4. AI enrichment runner (DECISION-045) — also replaces the fake vendor verdicts in `EnrichmentDetailPanel` / `InvestigationDrawer` with real ones.
5. Graph visual redesign — needs owner reference designs; load the ui-design-workflow skill.
6. Owner-scheduled security fix (includes private items — see private notes); needs owner go-ahead + adversarial review; before the first real customer.
7. Folded into the tasks above, no own session: rest of old audit PR 3 (demo rows on IOC/malware/vuln/actor lists, fake MITRE IDs on actors, `PageStatsBar` Demo badge — shared-ui still needs owner approval), remaining `isDemo` hooks (access reviews, break-glass, campaigns; `useFeeds` swallows errors). Old audit PR 4 (dead demo code) waits until something needs it.
8. Deferred from S174, tracked in `docs/S174_PLAN_FEATURE_GATE.md`: (a) daily/monthly usage counters not applied on nginx-proxied routes; (b) Command Center Alerts & Reports tab has no plan check (no impact today); (c) `apps/api-gateway/src/config/feature-routes.ts` stale entries (`/hunting`, `/correlation`, `/threat-actors`, `/integrations`→`api_access`).
9. From S175: existing sample archive objects in the MinIO bucket `etip-archive` are not deleted by the D4 change — deleting them and rebuilding the index from real data is row S159b.

**Owner actions:** none required this session (ops/config change, no user-facing behavior). Still open: graph reference designs (task 5), security-fix go-ahead (task 6), `PageStatsBar` OK (only if a task needs it).

## 🔁 How to Resume (Session 176)

```
Run /session-start, then start Step 3 row S154 (alerting-service → Postgres, spec
docs/roadmap/STEP_03_PERSISTENCE.md §5.1/§6.1). Module: alerting-service;
prisma/schema.prisma additive models only (D2); fail with 503 on DB error (D3);
delete alerting lines from scripts/memory-store-baseline.txt as they move.

Frozen / do-not-touch without explicit instruction: shared-* packages (Tier 1, api-gateway
included) — additive only, list every consumer before any change; shared-ui needs owner approval
for any PageStatsBar change. intelwatch.in and ti-platform-* containers — never touch.
nginx conf.d changes must pass `nginx -t` inside the live container before merge (deploy
force-recreates etip_nginx; a bad config = outage) and must not add a server-level `set` for any
variable read inside an auth_request location (RCA #64).
```

## Agent Utilization (Session 175)

- **Opus:** plan, spec §3 re-verification (found deploy ordering + D1 already live), guard script + CI/Makefile wiring, diff critique, VPS pre/post-deploy checks, PR/merge, memory.
- **Sonnet:** 5 runs — context digest, D4 archive kill switch + tests, etip-reviewer (PASS), S175 change doc + spec update, post-deploy docs.
- **Haiku:** n/a — VPS checks were two SSH one-liners, faster inline than a cold agent start.
- **codex:rescue:** n/a — not security-adjacent (config flag + CI script).

Routing telemetry:
- sonnet · session-start context digest · reworked: N
- sonnet · D4 archive flag + tests · reworked: N
- sonnet/etip-reviewer · pre-push review · reworked: N
- sonnet · S175 change doc + spec · reworked: N (2 one-line Opus fixes: unauthenticated curl, missing index.ts row)
- sonnet · post-deploy docs · reworked: N (left a duplicate "Last session outcome" line in PROJECT_STATE — fixed by Opus at session end)
