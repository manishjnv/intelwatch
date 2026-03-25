# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-25
**Session:** 66
**Session Summary:** AC-2 COMPLETE — ArticlePipeline reads per-tenant AI subtask model
assignments from the customization service. CustomizationClient with 5-min TTL cache
and safe fallback. 15 new tests. 360 ingestion tests pass.

## ✅ Changes Made

| Commit  | Files | Description                               |
|---------|-------|-------------------------------------------|
| 242c132 | 8     | AC-2: CustomizationClient + pipeline wire |

## 📁 Files / Documents Affected

### New Files

- `apps/ingestion/src/services/customization-client.ts` — HTTP client for
  GET /api/v1/customization/ai/subtasks. 5-min TTL cache per tenant, service JWT auth,
  safe Haiku/Sonnet defaults on network error or HTTP 5xx.
- `apps/ingestion/tests/customization-client.test.ts` — 12 tests: alias→model-ID
  mapping, TTL cache hit, per-tenant isolation, clearCache, error fallback (network +
  503), no cache on error, BYOK string passthrough.

### Modified Files

- `apps/ingestion/src/config.ts` — Added `TI_CUSTOMIZATION_URL` (default: localhost:3017)
- `apps/ingestion/src/services/triage.ts` — Added `setModel(model)` for lightweight
  per-article model override (no Anthropic client recreation)
- `apps/ingestion/src/services/extraction.ts` — Same `setModel(model)` pattern
- `apps/ingestion/src/services/dedup.ts` — Added optional `model?: string` to
  `arbitrate()`, replaces hardcoded haiku ID
- `apps/ingestion/src/workers/pipeline.ts` — Added `customizationClient?: CustomizationClient`
  to PipelineDeps; stores `aiEnabled` + `dedupModel`; in `processArticle()`: fetches
  tenant models → `setModel()` on triage/extraction → passes `dedupModel` to arbitrate()
- `apps/ingestion/tests/pipeline.test.ts` — 3 AC-2 tests: getSubtaskModels called with
  tenantId; custom opus model completes without error; fallback when no client injected

## 🔧 Decisions & Rationale

No new DECISION entries. All changes DECISION-013 compliant (in-memory, no Prisma migrations).

Key implementation notes:

- `setModel()` used instead of re-calling `init()` — avoids Anthropic client recreation per article.
- `customizationClient` is OPTIONAL — all 345 pre-AC-2 tests pass unmodified (null by default, falls back
  to construction-time models).
- AiModel aliases (`haiku`, `sonnet`, `opus`) mapped to full Anthropic model IDs. Unknown strings
  passed through as-is (BYOK / custom fine-tuned models supported).
- Cache entries are per-tenant; error responses are NOT cached (retry on next article).
- Pipeline never crashes if customization service is unreachable — always has safe defaults.

## 🧪 E2E / Deploy Verification Results

No deploy this session — code-only.

Local test results:

- ingestion: **360 tests** (23 test files, all pass) ✅
- ingestion typecheck: **0 errors** ✅
- ingestion lint: **0 errors** ✅
- Pre-existing TS error in `apps/customization/src/routes/ai-models.ts:108`
  confirmed pre-existing (not introduced by AC-2)
- **Estimated monorepo total: ~5,557 tests**

## ⚠️ Open Items / Next Steps

### Immediate

- Push to master → CI/CD → VPS deploy (AC-2 + G1-G5 + G5 P0 all pending)
- Verify `PUT /ioc-intelligence/:id/lifecycle` endpoint in ioc-intelligence service (deferred from G3)

### Deferred

- `apps/correlation-engine/src/services/store-checkpoint.ts` — pre-existing uncommitted WIP, not AC-2
- Gap #8: regex fallback drops threatActors/campaigns when AI disabled — documented, acceptable
- Gap #15: enrichment quality distribution widget — needs new widget slot
- Gap #17: enrichmentData JSONB archive strategy — needs Prisma migration
- Gap #19: stage-2 factor calibration — needs 30+ days historical data

## 🔁 How to Resume

Paste this prompt to start next session:

```text
/session-start
Working on: deploy AC-2 + G1-G5 to VPS (git push origin master → CI/CD)
Frozen: all deployed modules. Do not modify: apps/customization, shared packages.
Note: pre-existing uncommitted changes in apps/correlation-engine —
leave unstaged unless working on correlation engine.
```

| Module        | Skill file                      |
|---------------|---------------------------------|
| ingestion     | skills/04-INGESTION.md          |
| customization | skills/17-CUSTOMIZATION.md      |
| correlation   | skills/13-CORRELATION-ENGINE.md |
| devops/deploy | skills/03-DEVOPS.md             |
