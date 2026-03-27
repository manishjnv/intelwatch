# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-27
**Session:** 91
**Session Summary:** DECISION-029 Phase B1 — 5 global fetch workers (RSS/NVD/STIX/REST/MISP), GlobalFeedScheduler, MISP Warninglist matcher, ATT&CK technique weighting. 77 new tests. All feature-gated.

## ✅ Changes Made

| Commit | Description |
|--------|-------------|
| 283d7d8 | feat: DECISION-029 Phase B1 — global fetch workers, MISP warninglists, ATT&CK weighting (21 files, 1763 insertions) |

## 📁 Files / Documents Affected

**New files (19):**
| File | Purpose |
|------|---------|
| apps/ingestion/src/workers/global-fetch-base.ts | DRY shared worker logic: catalog lookup, rate limit (Redis), dedupe (by URL), consecutive failure tracking, auto-disable at 5 |
| apps/ingestion/src/workers/global-rss-worker.ts | Thin wrapper: FEED_FETCH_GLOBAL_RSS, concurrency 3, 5min rate limit |
| apps/ingestion/src/workers/global-nvd-worker.ts | FEED_FETCH_GLOBAL_NVD, concurrency 2, 10min rate limit |
| apps/ingestion/src/workers/global-stix-worker.ts | FEED_FETCH_GLOBAL_STIX, concurrency 2, 10min rate limit |
| apps/ingestion/src/workers/global-rest-worker.ts | FEED_FETCH_GLOBAL_REST, concurrency 3, 5min rate limit |
| apps/ingestion/src/workers/global-misp-worker.ts | Uses FEED_FETCH_GLOBAL_REST queue (MISP = REST transport), concurrency 2 |
| apps/ingestion/src/schedulers/global-feed-scheduler.ts | 5-min cron tick, isDue() check, per-type queue routing, feature-gated |
| packages/shared-normalization/src/warninglist.ts | MISP Warninglist matcher: 5 built-in lists, string/hostname/CIDR/regex matching |
| packages/shared-normalization/src/attack-weighting.ts | 30 ATT&CK techniques, composite severity (max*0.6+avg*0.4), sub-technique fallback |
| apps/ingestion/tests/global-fetch-base.test.ts | 11 tests |
| apps/ingestion/tests/global-rss-worker.test.ts | 3 tests |
| apps/ingestion/tests/global-nvd-worker.test.ts | 3 tests |
| apps/ingestion/tests/global-stix-worker.test.ts | 2 tests |
| apps/ingestion/tests/global-rest-worker.test.ts | 2 tests |
| apps/ingestion/tests/global-misp-worker.test.ts | 1 test |
| apps/ingestion/tests/global-feed-scheduler.test.ts | 11 tests |
| apps/ingestion/tests/global-worker-registration.test.ts | 5 tests |
| packages/shared-normalization/tests/warninglist.test.ts | 21 tests |
| packages/shared-normalization/tests/attack-weighting.test.ts | 18 tests |

**Modified files (2):**
| File | Change |
|------|--------|
| packages/shared-normalization/src/index.ts | Added warninglist + attack-weighting exports |
| apps/ingestion/src/index.ts | Global worker registration + scheduler start (behind TI_GLOBAL_PROCESSING_ENABLED) |

## 🔧 Decisions & Rationale

No new DECISION entries. All work follows DECISION-029 v2 Phase B1 plan.

Key design choices:
- DRY global-fetch-base.ts pattern: all 5 workers share dedupe, rate limit, failure tracking via createGlobalFetchWorker()
- MISP worker uses FEED_FETCH_GLOBAL_REST queue (MISP is REST transport)
- Rate limiting via Redis key per feed per connector type (not BullMQ limiter)
- Warninglist: simple /8, /16, /24 CIDR matching (covers 99% of warninglist CIDRs)
- ATT&CK severity: max*0.6 + avg*0.4 (dominated by worst technique but averaged for context)

## 🧪 E2E / Deploy Verification Results

No deploy this session (code pushed to master, CI triggered). Test results:
- shared-normalization: 160 passed (39 new: 21 warninglist + 18 attack-weighting)
- ingestion-service: 587 passed (38 new: 11 base + 3+3+2+2+1 workers + 11 scheduler + 5 registration)
- Full monorepo: all pass, 0 failures
- TypeScript: clean (0 errors in changed modules, pre-existing in customization)
- Lint: 0 errors (1 pre-existing warning in cpe.ts)

## ⚠️ Open Items / Next Steps

**Immediate (Session 92):**
- Phase B2: Global Normalize Worker + Enrich Worker + Tenant Distribution pipeline
- Process global_articles(pending) through triage/normalization → distribute to tenant IOC overlays
- Scope: ingestion + normalization workers (~8-10 files, ~40 tests)

**Deferred:**
- VPS `prisma db push` for 7 new global processing tables (required before enabling global workers)
- Set TI_GLOBAL_PROCESSING_ENABLED=true on VPS to activate global workers
- Phases C/D per DECISION-029 plan (sessions 93-94)
- Pre-existing TS errors in customization-service global-ai-store.ts (6 errors)

## 🔁 How to Resume

```
Session 92: Phase B2 — Global Normalize + Enrich + Tenant Distribution

SCOPE: ingestion (global normalize/enrich workers) + normalization (global IOC pipeline)
Do not modify: frontend, ai-enrichment, customization, vulnerability-intel, billing, onboarding

Read docs/architecture/DECISION-029-Global-Processing-Plan.md (Phase B2 section)

Key interfaces from Phase B1:
- createGlobalFetchWorker() in ingestion/workers/global-fetch-base.ts — DRY base pattern
- GlobalFeedScheduler in ingestion/schedulers/global-feed-scheduler.ts
- WarninglistMatcher in shared-normalization/warninglist.ts — check(iocType, value)
- calculateAttackSeverity(techniqueIds) in shared-normalization/attack-weighting.ts
- Global queues: FEED_FETCH_GLOBAL_RSS/NVD/STIX/REST, NORMALIZE_GLOBAL, ENRICH_GLOBAL
- All gated by TI_GLOBAL_PROCESSING_ENABLED=false

STEPS:
1. git tag safe-point-2026-03-27-pre-phase-b2
2. Create global normalize BullMQ worker (NORMALIZE_GLOBAL queue)
3. Create global enrich worker (ENRICH_GLOBAL queue) — calls Warninglist + ATT&CK
4. Create tenant distribution pipeline (global_articles → tenant IOC overlays)
5. Wire Bayesian confidence + STIX tiers into global normalization
6. Write ~40 tests
7. pnpm -r test → all pass
```
