# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-23
**Session:** 28
**Session Summary:** Correlation Engine P2 (#11-15) — 5 new services completing Module 13 (15/15 improvements). AI pattern detection, rule templates, confidence decay, batch re-correlation, graph integration. 60 new tests, 8 new endpoints.

---

## MANDATORY: Review These Architecture Docs Every Session

| Document | When to Load | Key Content |
|----------|-------------|-------------|
| `docs/architecture/CTI-Pipeline-Architecture-v2.0.html` | Pipeline work | 4-stage pipeline, composite confidence formula, enrichment Stage 2.5, cost model, 3-layer dedup, IOC lifecycle state machine |
| `docs/architecture/ETIP_Architecture_Blueprint_v4.html` | Phase 4+ | 22-module map, living graph with retroactive risk propagation, 3 enrichment patterns, reasoning trail schema, prompt caching, STIX/TAXII |

---

## ✅ Changes Made (Session 28)

| Commit | Files | Description |
|--------|-------|-------------|
| 9430bdd | 17 | feat: add correlation engine P2 improvements (#11-15) — AI patterns, rule templates, decay, batch, graph integration |

## 📁 Files Created

| File | Purpose |
|------|---------|
| `apps/correlation-engine/src/services/ai-pattern-detection.ts` | #11 Claude Sonnet entity cluster analysis (budget-gated, prompt caching) |
| `apps/correlation-engine/src/services/rule-templates.ts` | #12 Six MITRE ATT&CK-anchored detection templates |
| `apps/correlation-engine/src/services/confidence-decay.ts` | #13 Dual IOC + correlation confidence aging per DECISION-015 |
| `apps/correlation-engine/src/services/batch-recorrelation.ts` | #14 Async batch re-correlation with cancel + diff report |
| `apps/correlation-engine/src/services/graph-integration.ts` | #15 HTTP client for graph service with service JWT + retry |
| `apps/correlation-engine/src/routes/advanced.ts` | 8 new endpoints for P2 features |
| `apps/correlation-engine/tests/ai-pattern-detection.test.ts` | 13 tests (mocked SDK) |
| `apps/correlation-engine/tests/rule-templates.test.ts` | 12 tests |
| `apps/correlation-engine/tests/confidence-decay.test.ts` | 16 tests |
| `apps/correlation-engine/tests/batch-recorrelation.test.ts` | 10 tests |
| `apps/correlation-engine/tests/graph-integration.test.ts` | 9 tests (mocked fetch + service JWT) |

## 📁 Files Modified

| File | Change |
|------|--------|
| `apps/correlation-engine/package.json` | Added `@anthropic-ai/sdk` dependency |
| `apps/correlation-engine/src/schemas/correlation.ts` | Added ~112 lines: P2 types (AIPatternDetection, RuleTemplate, DecayedResult, BatchJob, GraphSyncResult, etc.) |
| `apps/correlation-engine/src/config.ts` | Added 8 env vars (AI key/model/budget, decay hours, graph URL/sync toggle) |
| `apps/correlation-engine/src/app.ts` | Added advancedDeps to BuildAppOptions, registered advancedRoutes |
| `apps/correlation-engine/src/index.ts` | Instantiated 5 new services, passed advancedDeps to buildApp |
| `pnpm-lock.yaml` | Updated for @anthropic-ai/sdk |

---

## 🔧 Decisions & Rationale

No new DECISION entries this session. All patterns followed existing decisions:
- DECISION-013: In-memory state (Maps) for all new services
- DECISION-015: IOC decay rates inlined (not imported from shared-normalization to avoid Tier 1 dep)
- DECISION-021: `alert:read`/`alert:create` permissions for new endpoints
- DECISION-022: No Prisma, no neo4j-driver — graph integration uses HTTP API

---

## 🧪 Deploy Verification

```
No deploy this session (code-only).
Tests: 2331 passing (166 in correlation-engine, 60 new this session)
Typecheck: 0 errors
Lint: 0 errors
All source files under 400 lines (max: 358 in schemas/correlation.ts)
```

---

## ⚠️ Open Items / Next Steps

### Immediate — Deploy
- Deploy threat-graph to VPS (session 25+26 code)
- Deploy correlation-engine to VPS (session 27+28 code)

### Immediate — Phase 4 Continuation
- Threat Hunting Service (Module 14) — next Phase 4 module
- Digital Risk Protection (Module 11) — final Phase 4 module

### Deferred
- Add `correlation:*` permissions to shared-auth (uses `alert:*` for now)
- Add `CORRELATED_WITH` relationship type to threat-graph schema (currently maps to existing types)
- Elasticsearch IOC indexing
- Update QA_CHECKLIST.md
- Migrate in-memory services to Redis/PostgreSQL for scaling

---

## 🔁 How to Resume

### Session 29: Phase 4 — Threat Hunting (Module 14) — Core + P0 (RECOMMENDED)
```
/session-start

Scope: Phase 4 — Threat Hunting (Module 14)
Do not modify: shared-*, api-gateway, user-service, ingestion, normalization,
  ai-enrichment, ioc-intelligence, threat-actor-intel, malware-intel,
  vulnerability-intel, frontend, threat-graph, correlation-engine.

## Context
Session 28 completed Correlation Engine (Module 13) — all 15/15 improvements done.
26 source files, 20 endpoints, 166 tests. 2331 monorepo tests. Commit 9430bdd.
Phase 4 progress: Graph COMPLETE, Correlation COMPLETE, Hunting next, DRP last.

## Task: Threat Hunting Service (Module 14) — Core + P0
Scaffold and build the threat hunting workspace:
- Service scaffold (port 3014, Fastify, BullMQ, in-memory store)
- Hunt query builder (Elasticsearch DSL generation from structured queries)
- Hunt session management (create, execute, save, share)
- IOC pivot chains (multi-hop investigation from any entity)
- Saved hunt library (reusable hunt templates)
- Integration with correlation engine results and graph data

Suggest 15 accuracy improvements split across P0 (core, this session)
and P1/P2 (next session).

Target: apps/hunting-service/ (new module — use /new-module scaffold).
Skill: skills/14-THREAT-HUNTING.md.
```

### Phase roadmap
```
Phase 1: Foundation          COMPLETE
Phase 2: Data Pipeline       COMPLETE
Phase 3: Core Intel          COMPLETE (4 modules)
Phase 3.5: Dashboard + Demo  FROZEN (6 pages, 15 UI, demo fallbacks, mobile)
Differentiator A             COMPLETE (AI cost transparency)
Differentiator A+            COMPLETE (15/15 improvements)
Differentiator B             COMPLETE (Enrichment UI)
Phase 4: Advanced Intel      IN PROGRESS: Graph COMPLETE → Correlation COMPLETE → Hunting → DRP
```
