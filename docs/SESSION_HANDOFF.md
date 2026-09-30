# SESSION HANDOFF DOCUMENT

**Date:** 2026-09-30
**Session:** 176
**Session Summary:** Step 3 row **S154** done, deployed and verified — alerting-service rules, notification channels, escalation policies and maintenance windows moved from in-process Maps to Postgres (4 additive tables), channel config encrypted at rest and masked in API responses, by-id lookups tenant-scoped. Then a full `docs/` sweep produced one consolidated backlog, `docs/PENDING_WORK.md`.

## ✅ Changes Made (Session 176)

| Commit(s) | Description |
|---|---|
| `a653895` (38 files) | feat: Step 3 S154 — `prisma/schema.prisma` +4 models (`alert_rules`, `alert_channels`, `alert_escalation_policies`, `alert_maintenance_windows`); `src/repository.ts` (`Repo<T>`, `MemoryRepo`, `dbCall` → 503, `isUuid`) + `src/repository-prisma.ts`; `src/services/channel-crypto.ts` (AES-256-GCM, mask); 4 stores async + repo; routes/worker/dispatcher await; `requestTenant()`; config + index wiring; notifier logs URL origin only; compose `etip_alerting` DB URL + key + postgres dependency + 384M; baseline −4 lines; tests 329 → 377 |
| `973d897` (2 files) | docs: `docs/S176_STEP3_ALERTING_S154.md` + `docs/modules/alerting-service.md` |
| merge `3e2a73f` | PR #68 merged; CI/CD run 36617017423 all green (test, build, deploy) |
| `6d4f42b` (7 files) | docs: post-deploy stats update — PROJECT_STATE, stats HTML, RCA #65, README badge, spec §10 row 154, S176 doc deploy result |
| `ce3fad1` (2 files) | docs: consolidated backlog `docs/PENDING_WORK.md` (full docs sweep) + handoff pointer |
| (this commit) | docs: session 176 end — handoff, PROJECT_STATE known issues |

VPS HEAD `3e2a73f`, 32/32 `etip_` containers healthy. alerting-service 377/377. Real monorepo total **9,394 passed + 2 skipped, 0 failed, 33 packages** (CI run 36617017423; was 9,346 + 2).

## 📁 Files / Documents Affected (Session 176)

**New:** `apps/alerting-service/src/repository.ts`, `src/repository-prisma.ts`, `src/services/channel-crypto.ts`, `tests/{channel-crypto,repository,persistence-restart,config}.test.ts`, `docs/S176_STEP3_ALERTING_S154.md`, `docs/PENDING_WORK.md`.

**Modified (code):** `prisma/schema.prisma`, `pnpm-lock.yaml`, `docker-compose.etip.yml` (etip_alerting only), `scripts/memory-store-baseline.txt`, `apps/alerting-service/package.json`, `src/{config,index}.ts`, `src/plugins/tenant-guard.ts`, `src/routes/{rules,channels,escalations,maintenance,templates,stats}.ts`, `src/services/{rule,channel,escalation,maintenance}-store.ts`, `src/services/{escalation-dispatcher,notifier}.ts`, `src/workers/alert-worker.ts`, 9 existing test files.

**Modified (docs):** `docs/PROJECT_STATE.md`, `docs/SESSION_HANDOFF.md`, `docs/DEPLOYMENT_RCA.md` (Issue 65 + S176 row), `docs/ETIP_Project_Stats.html`, `docs/modules/alerting-service.md`, `docs/roadmap/STEP_03_PERSISTENCE.md`, `README.md`.

## 🔧 Decisions & Rationale (Session 176)

No new DECISION entry — the session executes DECISION-049 (D2 additive schema, D3 fail with 503). Deliberate deviations from the §6.1 sketch, recorded in the S176 doc: only 4 of 7 models (the S155 ones come with S155 — additive-only schema makes an unused table costly to reshape); no `configMasked`/`keyVersion` columns (mask computed on read, both addable later); no `src/prisma.ts`; id arrays are `text[]`; the channel key is 32 random bytes in base64 (not the integration helper's first-32-chars scheme).

## 🧪 Deploy Verification Results (Session 176)

```
PR #68 → 3e2a73f : CI run 36617017423 — Test/Type-check/Lint & Audit success, Build & Push success, Deploy to VPS success.
VPS HEAD 3e2a73f, 32/32 etip containers healthy.
Tables: alert_channels, alert_escalation_policies, alert_maintenance_windows, alert_rules.
etip_alerting log "Alerting persistence: Postgres" (1); "fall back"/"in-memory" lines: 0 (before and after restart).
Created (internal 127.0.0.1:3023, real tenant uuid) a DISABLED test rule + test Slack channel:
  create response masked (hooks.slack.com/****), token leaked: 0; DB config_enc prefix 'v1:', plaintext rows: 0
  docker restart etip_alerting → health 200; rule GET 200 (name matches); channel listed, token leaked 0;
  channel test route (decrypts) success; cleanup DELETE 204/204, leftover test rows 0.
Memory guard OK. etip_alerting 43.34 MiB / 384 MiB (limit 402653184).
Reviews: Opus diff review (+ escalation policy lookup scoped to the alert's tenant, + test);
codex:rescue verdict REVISE — (1) webhook URL logged in full → FIXED (origin only);
(2) worker swallows DB errors so the job isn't retried → DEFERRED to S155 (retry not idempotent yet).
etip-reviewer PASS. RCA #65 recorded (alerting by-id lookups not tenant-filtered, fixed).
```

## ⚠️ Open Items / Next Steps (Session 176)

**Full backlog: `docs/PENDING_WORK.md`** (all roadmap steps, SEO G1–G7 + weekly brief B1–B3, standing backlog, owner inputs, stale docs). Ordered queue (one task per fresh session):

1. **Step 3 row S155** — alerting-service alerts, history, groups, dedup, escalation dispatcher `pending`, worker → Postgres; add models `Alert`, `AlertHistoryEntry`, `AlertGroup` (spec §5.1/§6.1); make `processJob` idempotent, then rethrow `DB_UNAVAILABLE` so BullMQ retries; delete the remaining 7 alerting lines from `scripts/memory-store-baseline.txt`; keep every by-id lookup tenant-scoped with a cross-tenant 404 test.
2. Rest of Step 3: S156/S157 integration → S158a/b DRP → S159 hunting → S159b–e (archive rebuild incl. deleting MinIO sample objects, analytics tenant trends, onboarding, offboarding purge incl. the 4 new alert tables).
3. Wiring fixes from the S173 sweep (see PENDING_WORK §3).
4. AI enrichment runner (DECISION-045).
5. Graph visual redesign — needs owner reference designs.
6. Owner-scheduled security fix (includes private items — see private notes); owner go-ahead + adversarial review; before the first real customer.
7. Folded in, no own session: audit PR 3 leftovers, remaining `isDemo` hooks, S174 plan-gate leftovers, alert notification delivery (log-only today).
8. Parallel any time: SEO G1 (sitemap from routes + self-hosted fonts, small frontend task).

**Owner actions:** none blocking. Key copies confirmed (VPS `.env`, local `.env`, owner offline backup). Still open: graph designs, security-fix go-ahead, `PageStatsBar` OK, Step 15 P2 decisions, DECISION-032, SEO O-S1, brief O-B1–B3.

## 🔁 How to Resume (Session 177)

```
Run /session-start, then start Step 3 row S155 (alerting-service → Postgres, part 2:
alerts, history, groups, dedup, escalation dispatcher, worker; spec
docs/roadmap/STEP_03_PERSISTENCE.md §5.1/§6.1/§8). Module: alerting-service.
Reuse the S154 layer: src/repository.ts (Repo<T>, MemoryRepo, dbCall → 503, isUuid) and
src/repository-prisma.ts. prisma/schema.prisma additive models only (D2); DB error → 503,
never a memory fallback (D3); by-id lookups tenant-scoped + cross-tenant 404 tests; make
alert-worker processJob idempotent, then rethrow DB_UNAVAILABLE; delete the remaining alerting
lines from scripts/memory-store-baseline.txt. Security-adjacent → codex:rescue before push.

Frozen / do-not-touch without explicit instruction: shared-* packages (Tier 1, api-gateway
included) — additive only, list every consumer before any change; shared-ui needs owner approval
for any PageStatsBar change. intelwatch.in and ti-platform-* containers — never touch.
nginx conf.d changes must pass `nginx -t` inside the live container before merge and must not
add a server-level `set` for any variable read inside an auth_request location (RCA #64).
Stage explicit paths only — private untracked .docx / AGENTS.md / setup-breakglass.sh live in the tree.
```

## Agent Utilization (Session 176)

- **Opus:** plan + code reading, Sonnet contract, diff critique + 2 fixes (dispatcher tenant scope, notifier log mask), VPS key + verification script, PR/merge/deploy watch, docs review, memory.
- **Sonnet:** 7 runs — S154 implementation, etip-reviewer (PASS), S176 docs, post-deploy docs, 3 docs-sweep agents (roadmap, state docs, other docs).
- **Haiku:** 1 run — session-start context digest (two facts corrected by Opus: baseline count, invented index.ts lines).
- **codex:rescue:** verdict REVISE — 1 fixed (webhook URL log), 1 deferred to S155 with reason (worker retry not idempotent yet).

Routing telemetry:
- haiku · session-start context digest · reworked: Y (invented 3 baseline lines, Opus re-grepped)
- sonnet · S154 implementation (37 files) · reworked: N (Opus added 2 small fixes after review)
- sonnet/etip-reviewer · pre-push review · reworked: N
- sonnet · S176 change doc + module README · reworked: N
- sonnet · post-deploy docs (7 files) · reworked: N (numbers verified against facts, no duplicates)
- sonnet × 3 · full docs pending-work sweep · reworked: N
- codex:rescue · adversarial security review · reworked: N
