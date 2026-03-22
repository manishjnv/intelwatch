# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-22
**Session:** 21
**Session Summary:** Differentiator A — AI Cost Transparency. Haiku triage + per-IOC cost tracking + 3 cost API endpoints. 98 new tests (125 total in ai-enrichment, 1680 monorepo). Commit df33330.

---

## ⚠️ MANDATORY: Review These Architecture Docs Every Session

These are the canonical design specifications. Load the relevant one based on session scope:

| Document | When to Load | Key Content |
|----------|-------------|-------------|
| `docs/architecture/CTI-Pipeline-Architecture-v2.0.html` | Pipeline work (ingestion, normalization, enrichment), confidence scoring, dedup | 4-stage pipeline, composite confidence formula (6 factors), enrichment Stage 2.5, cost model, 3-layer dedup, IOC lifecycle state machine |
| `docs/architecture/ETIP_Architecture_Blueprint_v4.html` | Phase 4+ (graph, correlation, hunting), module design, cost tracking, competitive positioning | 22-module map, living graph with retroactive risk propagation, 3 enrichment patterns (batch/real-time/agentic), reasoning trail schema, prompt caching, STIX/TAXII |

**Rule:** Before proposing architectural alternatives, check both docs + `docs/DECISIONS_LOG.md`. These are approved-for-development specifications.

---

## ✅ Changes Made (Session 21)

| Commit | Files | Description |
|--------|-------|-------------|
| `df33330` | 15 | feat: AI cost transparency — Haiku triage + per-IOC cost tracking + cost API |

## 📁 Files Created

| File | Purpose |
|------|---------|
| `apps/ai-enrichment/src/cost-tracker.ts` | EnrichmentCostTracker — per-IOC per-provider cost tracking, aggregate stats, tenant budget alerts |
| `apps/ai-enrichment/src/providers/haiku-triage.ts` | HaikuTriageProvider — Claude Haiku IOC classifier, prompt injection defense, graceful degradation |
| `apps/ai-enrichment/src/routes/cost.ts` | 3 cost API endpoints: /stats, /ioc/:iocId, /budget |
| `apps/ai-enrichment/tests/cost-tracker.test.ts` | 29 tests — cost calculation, provider tracking, aggregation, budget |
| `apps/ai-enrichment/tests/haiku-triage.test.ts` | 24 tests — enable/disable, triage, prompt, validation |
| `apps/ai-enrichment/tests/cost-routes.test.ts` | 14 tests — cost API endpoint tests |

## 📁 Files Modified

| File | Change |
|------|--------|
| `apps/ai-enrichment/src/config.ts` | +3 env vars: TI_ANTHROPIC_API_KEY, TI_HAIKU_MODEL, TI_ENRICHMENT_DAILY_BUDGET_USD |
| `apps/ai-enrichment/src/schema.ts` | +HaikuTriageResultSchema, CostBreakdownSchema, extended EnrichmentResultSchema |
| `apps/ai-enrichment/src/service.ts` | 3-provider pipeline (VT → AbuseIPDB → Haiku), backward-compat risk scoring, cost tracking |
| `apps/ai-enrichment/src/app.ts` | Registered cost routes, added costTracker to BuildAppOptions |
| `apps/ai-enrichment/src/index.ts` | Wired HaikuTriageProvider + EnrichmentCostTracker |
| `apps/ai-enrichment/package.json` | Added @anthropic-ai/sdk ^0.39.0 |
| `apps/ai-enrichment/tests/service.test.ts` | +20 tests: Haiku triage, cost tracking, 4-component scoring, backward compat |
| `apps/ai-enrichment/tests/config.test.ts` | +10 tests: new env var defaults, validation, parsing |
| `pnpm-lock.yaml` | Updated with @anthropic-ai/sdk |

---

## 🔧 Decisions & Rationale

- **Backward-compatible risk scoring**: When Haiku absent, formula unchanged (50/30/20). When present, 4-component (35/25/25/15). Existing test expectations preserved (score=46).
- **Graceful degradation**: Haiku returns null on any error. Pipeline continues with VT + AbuseIPDB.
- **No schema migration**: Cost data stored in existing enrichmentData JSON column.
- **In-memory cost tracker**: Per DECISION-013, acceptable for Phase 2 validation.
- **@anthropic-ai/sdk**: Already in lockfile via ingestion service. No new binary dependency.

---

## 🧪 Test Results

```
AI Enrichment: 125 tests (was 27, +98 new)
  - config: 17 (was 7, +10)
  - schema: 9 (unchanged)
  - rate-limiter: 7 (unchanged)
  - service: 28 (was 8, +20)
  - cost-tracker: 29 (NEW)
  - haiku-triage: 24 (NEW)
  - cost-routes: 14 (NEW)

Full Monorepo: 1680 tests (was 1582, +98), 0 failures, 17 packages
```

---

## ⚠️ Open Items / Next Steps

### Immediate — Session 22: AI Enrichment 15 Accuracy Improvements

**15 improvements planned** (see memory: `session21_improvements.md`). Split across 2 sessions:

| Session | Improvements | Est. Tests |
|---------|-------------|-----------|
| **22** | P0 (#1-5) + P1 top (#6-8): Evidence chain, MITRE extraction, FP detection, confidence feedback, budget gate, Redis cache, family/actor extraction, recommended actions | ~70 |
| **23** | P1 remaining (#9-10) + P2 (#11-15): STIX labels, quality score, prompt caching, geo, batch, persistence, scheduler | ~52 |

**Critical rule:** All improvements are ADDITIVE — never remove or overwrite Session 21 code.

### Deferred
- Session 23+: Elasticsearch IOC indexing
- Phase 4: Threat Graph → Correlation → Hunting (reordered per PROJECT_ASSESSMENT.md)
- Frontend improvements: see docs/FUTURE_IMPROVEMENTS.md (7 items, UI FROZEN)

---

## 🔁 How to Resume

### Option A — Session 22: AI Enrichment Accuracy Improvements (RECOMMENDED)
```
/session-start

Scope: AI Enrichment Accuracy Improvements (Module 06) — P0 + P1
Do not modify: shared-*, api-gateway, user-service, frontend (UI FROZEN),
  ingestion, normalization, ioc-intelligence,
  threat-actor-intel, malware-intel, vulnerability-intel (all Tier 1/2 frozen).

## Context
Session 21 shipped: Haiku triage + cost tracker + cost API. 125 tests. Commit df33330.
15 accuracy improvements planned — see memory session21_improvements.md.
This session: implement #1-8 (P0 + P1 top 3). ~70 new tests.
ALL improvements ADDITIVE — do NOT remove or overwrite session 21 code.

## Architecture Reference (MANDATORY)
Review before coding:
- docs/architecture/CTI-Pipeline-Architecture-v2.0.html (confidence formula, enrichment patterns)
- docs/architecture/ETIP_Architecture_Blueprint_v4.html (reasoning trails, prompt caching, STIX)

Port 3006. Skill: skills/06-AI-ENRICHMENT.md.
```

### Option B — Phase 4: Threat Graph Service
```
/session-start

Scope: Phase 4 — Threat Graph Service (Module 12)
Port 3012. Skill: skills/12-THREAT-GRAPH.md.

## Architecture Reference (MANDATORY)
Review: docs/architecture/ETIP_Architecture_Blueprint_v4.html (living graph, retroactive risk propagation, graph query patterns)
```

### Phase roadmap
```
Phase 1: Foundation          ✅ COMPLETE
Phase 2: Data Pipeline       ✅ COMPLETE
Phase 3: Core Intel          ✅ COMPLETE (4 modules)
Phase 3.5: Dashboard + Demo  ✅ FROZEN (5 pages, 15 UI, demo fallbacks)
Differentiator A             ✅ COMPLETE (AI cost transparency, Session 21)
Differentiator A+            📋 NEXT (15 accuracy improvements, Session 22-23)
Differentiator B             📋 Confidence explainability UI (Session 24)
Phase 4: Advanced Intel      📋 Graph → Correlation → Hunting (Session 25-29)
```

### Module → skill file map
```
ai-enrichment (improvements)  → skills/06-AI-ENRICHMENT.md
digital-risk-protection        → skills/11-DIGITAL-RISK-PROTECTION.md
threat-graph                   → skills/12-THREAT-GRAPH.md
correlation-engine             → skills/13-CORRELATION-ENGINE.md
threat-hunting                 → skills/14-THREAT-HUNTING.md
```

### Key constructor signatures (DO NOT BREAK)
```typescript
// EnrichmentService — 7 args
new EnrichmentService(repo, vtProvider, abuseProvider, haikuProvider, costTracker, aiEnabled, logger)

// computeRiskScore — exported, tested
computeRiskScore(vt, abuse, haiku, baseConfidence) → number

// HaikuTriageProvider — 4 args
new HaikuTriageProvider(apiKey, aiEnabled, logger, model?)

// EnrichmentCostTracker — 0 args
new EnrichmentCostTracker()
```
