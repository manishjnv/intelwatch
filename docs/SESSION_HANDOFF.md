# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-27
**Session:** 92
**Session Summary:** DECISION-029 Phase B2 — Global normalize/enrich workers, Shodan/GreyNoise enrichment clients, tenant IOC overlay service + routes. 75 new tests. All feature-gated.

## ✅ Changes Made

| Commit | Description |
|--------|-------------|
| 1f8d368 | feat: DECISION-029 Phase B2 — global normalize/enrich workers, Shodan/GreyNoise clients, tenant overlay (14 files, 2148 insertions) |

## 📁 Files / Documents Affected

**New files (12):**
| File | Purpose |
|------|---------|
| apps/normalization/src/enrichment/shodan-client.ts | Shodan IP enrichment (risk scoring, graceful degradation) |
| apps/normalization/src/enrichment/greynoise-client.ts | GreyNoise Community API (threat assessment, confidence adjustment) |
| apps/normalization/src/workers/global-normalize-worker.ts | NORMALIZE_GLOBAL consumer: IOC extraction, warninglist, Bayesian confidence, STIX tiers, upsert |
| apps/normalization/src/workers/global-enrich-worker.ts | ENRICH_GLOBAL consumer: external enrichment, confidence recalc, quality scoring, critical emission |
| apps/normalization/src/services/tenant-overlay-service.ts | Multi-tenant IOC overlay: merged view, CRUD, bulk ops, stats |
| apps/normalization/src/routes/tenant-overlay.ts | 6 REST routes for global IOC overlay (gated by TI_GLOBAL_PROCESSING_ENABLED) |
| apps/normalization/tests/shodan-client.test.ts | 9 tests |
| apps/normalization/tests/greynoise-client.test.ts | 9 tests |
| apps/normalization/tests/global-normalize-worker.test.ts | 18 tests |
| apps/normalization/tests/global-enrich-worker.test.ts | 15 tests |
| apps/normalization/tests/tenant-overlay-service.test.ts | 14 tests |
| apps/normalization/tests/tenant-overlay-routes.test.ts | 10 tests |

**Modified files (2):**
| File | Change |
|------|--------|
| apps/normalization/src/app.ts | Added tenant overlay routes registration + TenantOverlayService + prisma option |
| docs/PROJECT_STATE.md | Session 91→92 updates |

## 🔧 Decisions & Rationale

No new DECISION entries. All work follows DECISION-029 v2 Phase B2 plan.

Key design choices:
- Shodan/GreyNoise clients degrade gracefully (return null) when API keys not set
- Shodan risk score: base 20 + ports*5 (cap 30) + vulns*10 (cap 40) + tor(+15) - cloud(-5)
- GreyNoise confidence adjustment: riot=-20, benign_scanner=-10, malicious=+20, unknown=0
- Tenant overlay: overlay values WIN over global defaults, tags merged with dedup (Set)
- Enrichment quality: (sources_with_data/total)*50 + freshness*30 + coverage*20
- Global normalize worker uses buildGlobalDedupeHash(type, normalizedValue) — no tenantId
- Route tests require registerErrorHandler() for Zod→400 mapping

## 🧪 E2E / Deploy Verification Results

No deploy this session (code pushed to master, CI triggered). Test results:
- normalization-service: 232 passed (75 new across 6 test files)
- shared-normalization: 160 passed (0 new, regression check)
- Full monorepo: all pass, 0 failures

## ⚠️ Open Items / Next Steps

**Immediate (Session 93):**
- Phase C: Global feed subscription UI + dashboard widgets
- Or Phase C/D per DECISION-029 plan

**Deferred:**
- VPS `prisma db push` for 7 new global processing tables (required before enabling global workers)
- Set TI_GLOBAL_PROCESSING_ENABLED=true on VPS
- Set TI_SHODAN_API_KEY + TI_GREYNOISE_API_KEY on VPS
- Pre-existing TS errors in customization-service global-ai-store.ts (6 errors)

## 🔁 How to Resume

```
Session 93: DECISION-029 Phase C — Global Feed Subscription + Dashboard

SCOPE: frontend, customization (subscription management), normalization (overlay UI integration)
Do not modify: ai-enrichment, vulnerability-intel, billing, onboarding, api-gateway

Read docs/architecture/DECISION-029-Global-Processing-Plan.md (Phase C section)

Key interfaces from Phase B2:
- TenantOverlayService in normalization/services/tenant-overlay-service.ts
- 6 overlay routes: GET/PUT/DELETE /api/v1/normalization/global-iocs[/:id/overlay]
- ShodanClient in normalization/enrichment/shodan-client.ts
- GreyNoiseClient in normalization/enrichment/greynoise-client.ts
- Global normalize worker: NORMALIZE_GLOBAL queue → global_iocs upsert
- Global enrich worker: ENRICH_GLOBAL queue → enrichment + confidence recalc
- All gated by TI_GLOBAL_PROCESSING_ENABLED=false

STEPS:
1. git tag safe-point-2026-03-27-pre-phase-c
2. Build global feed subscription management (tenant → catalog)
3. Build dashboard widgets for global IOC stats
4. Wire overlay UI to tenant-overlay routes
5. Write tests
6. pnpm -r test → all pass
```
