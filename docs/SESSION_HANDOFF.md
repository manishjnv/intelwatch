# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-27
**Session:** 90
**Session Summary:** DECISION-029 Phase A2 — Bayesian confidence model, STIX 2.1 tiers, EPSS live API, global AI config store + routes, plan limits routes. 102 new tests across 3 packages.

## ✅ Changes Made

| Commit | Description |
|--------|-------------|
| af55748 | feat: DECISION-029 Phase A2 — Bayesian confidence, STIX tiers, EPSS, global AI config (18 files, 2021 insertions) |

## 📁 Files / Documents Affected

**New files (17):**
| File | Purpose |
|------|---------|
| packages/shared-normalization/src/bayesian-confidence.ts | Log-odds Bayesian confidence model (toLogOdds, fromLogOdds, calculateBayesianConfidence, selectConfidenceModel) |
| packages/shared-normalization/src/stix-confidence.ts | STIX 2.1 §4.14 semantic confidence tiers + traffic-light colors |
| packages/shared-normalization/tests/bayesian-confidence.test.ts | 20 tests |
| packages/shared-normalization/tests/stix-confidence.test.ts | 32 tests |
| apps/vulnerability-intel/src/services/epss-client.ts | FIRST.org EPSS API client (batch 100, retry 3x, backoff, 10s timeout) |
| apps/vulnerability-intel/src/crons/epss-refresh.ts | Daily EPSS refresh cron (6 AM UTC, queries active CVEs, batch update) |
| apps/vulnerability-intel/tests/epss-client.test.ts | 8 tests |
| apps/vulnerability-intel/tests/epss-refresh.test.ts | 4 tests |
| apps/customization/src/services/global-ai-store.ts | 15-subtask AI model config (RECOMMENDED_MODELS, 5-min TTL cache, plan presets) |
| apps/customization/src/services/cost-predictor.ts | Monthly cost estimation (TOKEN_PRICING for haiku/sonnet/opus, AVG_TOKENS_PER_SUBTASK) |
| apps/customization/src/routes/global-ai.ts | 6 routes: GET config, PUT model, POST apply-plan, GET cost-estimate, GET/PUT confidence-model |
| apps/customization/src/routes/plan-limits.ts | 2 routes: GET plans, PUT plans/:planId (4 tiers: free/starter/teams/enterprise) |
| apps/customization/tests/global-ai-store.test.ts | 13 tests |
| apps/customization/tests/cost-predictor.test.ts | 5 tests |
| apps/customization/tests/global-ai-routes.test.ts | 13 tests |
| apps/customization/tests/plan-limits-routes.test.ts | 7 tests |

**Modified files (2):**
| File | Change |
|------|--------|
| packages/shared-normalization/src/index.ts | Added exports for bayesian-confidence + stix-confidence |
| apps/customization/src/app.ts | Registered globalAiRoutes + planLimitsRoutes |

## 🔧 Decisions & Rationale

No new DECISION entries. All work follows DECISION-029 v2 Phase A2 plan.

## 🧪 E2E / Deploy Verification Results

No deploy this session (code pushed to master, CI triggered). Test results:
- shared-normalization: 121 passed (52 new)
- vulnerability-intel: 131 passed (12 new)
- customization: 319 passed (38 new)
- Total new: 102 tests, 0 failures

## ⚠️ Open Items / Next Steps

**Immediate (Session 91):**
- Phase B: Global pipeline worker + dedup engine + FP signal + MISP warninglists
- Scope: ingestion + normalization workers (~12 files, ~40 tests)
- Deploy to VPS + run `prisma db push` for 7 new tables

**Deferred:**
- Phases C/D per DECISION-029 plan (sessions 92-93)
- VPS `prisma db push` for global processing + feed_quota tables

## 🔁 How to Resume

```
Session 91: Phase B — Global Pipeline Worker + Dedup + FP Signal

SCOPE: ingestion (global processing worker) + normalization (dedup engine)
Do not modify: frontend, ai-enrichment, customization, vulnerability-intel

Read docs/architecture/DECISION-029-Global-Processing-Plan.md (Phase B section)

Key interfaces from Phase A2:
- calculateBayesianConfidence() in shared-normalization/bayesian-confidence.ts
- stixConfidenceTier/Color() in shared-normalization/stix-confidence.ts
- selectConfidenceModel('bayesian') factory function
- GlobalAiStore.getModelForSubtask() for per-subtask model routing
- EPSS client: fetchEpssScores() in vulnerability-intel/services/epss-client.ts
- Plan limits: PlanLimitsStore with 4 tiers (free/starter/teams/enterprise)
- All gated by TI_GLOBAL_PROCESSING_ENABLED=false

STEPS:
1. git tag safe-point-2026-03-27-pre-phase-b
2. Create global processing BullMQ worker (etip-global-ingest queue)
3. Implement fuzzy dedup engine (RFC 3986 URL normalization, similarity scoring)
4. Add FP signal propagation (false positive flagging across correlated IOCs)
5. Integrate MISP warninglists (known benign IP/domain lists for FP reduction)
6. Wire Bayesian confidence into normalization pipeline (feature-flagged)
7. Write ~40 tests
8. pnpm -r test → all pass
```
