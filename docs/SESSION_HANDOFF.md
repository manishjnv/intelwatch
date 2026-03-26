# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-26
**Session:** 78
**Session Summary:** Downstream pipeline verification — audited all event/queue wiring across 8 services, fixed 2 broken INTEGRATION_PUSH payload chains (alerting + correlation), created pipeline health check script, 19 wiring alignment tests.

## Changes Made
- Fixed alerting-service INTEGRATION_PUSH payload: `eventType` → `event`, flat fields → `payload` wrapper
- Fixed correlation-engine INTEGRATION_PUSH payload: same shape mismatch
- Updated alerting + correlation test assertions to match corrected payload shape
- Created `scripts/check-pipeline-health.ts` — checks all 23 services, queues, data stores
- Created `tests/e2e/pipeline-wiring.test.ts` — 19 alignment tests (queue names, event types, chain integrity)
- Updated `tests/e2e/vitest.config.ts` — added @etip/shared-utils alias for wiring tests
- Updated `docs/QA_CHECKLIST.md` — added Pipeline E2E Data Flow section

## New Files
| File | Purpose |
|------|---------|
| `scripts/check-pipeline-health.ts` | Pipeline health check — service endpoints, queue depths, data store counts |
| `tests/e2e/pipeline-wiring.test.ts` | 19 unit tests verifying queue/event constant alignment across pipeline |

## Modified Files
| File | Change |
|------|--------|
| `apps/alerting-service/src/workers/alert-worker.ts` | Line 205-215: INTEGRATION_PUSH payload → `{tenantId, event, payload}` shape |
| `apps/alerting-service/tests/alert-integration-push.test.ts` | Updated assertion to match new payload shape |
| `apps/correlation-engine/src/workers/correlate.ts` | Line 187-195: INTEGRATION_PUSH payload → `{tenantId, event, payload}` shape |
| `apps/correlation-engine/tests/correlate-downstream.test.ts` | Updated 2 assertions to match new payload shape |
| `tests/e2e/vitest.config.ts` | Added @etip/shared-utils + @etip/shared-types resolve aliases |
| `docs/QA_CHECKLIST.md` | Added Pipeline E2E Data Flow section (10 verified chains) |

## Pipeline Wiring Audit Results

### Verified CONNECTED (no fix needed)
1. Ingestion → Normalization (NORMALIZE queue)
2. Normalization → Enrichment (ENRICH_REALTIME queue)
3. Enrichment → ES Indexing (IOC_INDEX queue)
4. Enrichment → Threat Graph (GRAPH_SYNC queue)
5. Enrichment → Correlation (CORRELATE queue)
6. Correlation → Alerting (ALERT_EVALUATE queue)
7. Enrichment → Caching (CACHE_INVALIDATE queue)

### Fixed (was BROKEN)
8. Alerting → Integration (INTEGRATION_PUSH) — payload shape mismatch
9. Correlation → Integration (INTEGRATION_PUSH) — same payload shape mismatch

Both emitters were sending `{tenantId, eventType, ...flatFields}` but integration service's EventRouter expects `{tenantId, event: TriggerEvent, payload: Record<string, unknown>}`. Field name `eventType` → `event`, and all entity fields wrapped in `payload` object.

### Unused queues (by design, not broken)
- DEDUPLICATE — placeholder, no producer/consumer exists
- ENRICH_BATCH — placeholder, batch enrichment not yet implemented
- ARCHIVE — caching service uses cron-based archival, not queue-based

## Decisions & Rationale
- No new DECISION-NNN entries. The INTEGRATION_PUSH fix is a bug fix, not an architectural decision.

## E2E / Deploy Verification Results
- Tests: 19/19 pipeline wiring tests pass, 4/4 alerting integration push tests pass, 7/7 correlation downstream tests pass
- Pre-existing: 7 alerting route test files fail (registerMetrics not a function — session 73 known issue, unrelated)
- Not yet deployed — commit pending

## Open Items / Next Steps
### Immediate
1. Run seed-feeds.sh on VPS (from session 77 — feeds not yet active)
2. Deploy this session's fixes (INTEGRATION_PUSH payload shape)
3. After feeds active + data flowing, run `npx tsx scripts/check-pipeline-health.ts` to verify end-to-end

### Expected timeline after feeds activate
- Within 30 min: articles and IOCs in PostgreSQL
- Within 1 hour: IOCs indexed in Elasticsearch (search works with real data)
- Within 1 hour: graph nodes appear in Neo4j
- Within 2-4 hours: correlation patterns start detecting matches
- Within 4-8 hours: first real alerts fire, integration push delivers to configured webhooks

### Deferred
- Wire billing-service Prisma in index.ts (session B2)
- Persistence migration B2: alerting-service → Postgres
- Fix registerMetrics TS errors (3 services — session 73 pre-existing)
- Expand admin-service KNOWN_QUEUES to monitor all 15 active queues (currently only 5)

## How to Resume
```
Working on: Post-pipeline deployment verification
Module target: cross-service (read-only verification)
Do not modify: frontend, shared packages

Steps:
1. Deploy session 78 commit (INTEGRATION_PUSH fix)
2. SSH to VPS, run seed-feeds.sh (session 77)
3. Wait 30 min for pipeline to process
4. Run: npx tsx scripts/check-pipeline-health.ts
5. Verify: GET /api/v1/search?q=cve returns real ES results
6. Verify: GET /api/v1/graph/stats shows non-zero nodes
7. Verify: GET /api/v1/alerts shows alerts (may take hours)
```
