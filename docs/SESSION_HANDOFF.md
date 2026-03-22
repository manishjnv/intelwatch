# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-23
**Session:** 26
**Session Summary:** Threat Graph Service (Module 12) — 20 improvements complete (#1-20). P1 accuracy boosters, P2 UX enhancements, advanced operations (merge/split, batch, decay cron, presets, trending). 32 endpoints, 294 tests.

---

## MANDATORY: Review These Architecture Docs Every Session

| Document | When to Load | Key Content |
|----------|-------------|-------------|
| `docs/architecture/CTI-Pipeline-Architecture-v2.0.html` | Pipeline work | 4-stage pipeline, composite confidence formula, enrichment Stage 2.5, cost model, 3-layer dedup, IOC lifecycle state machine |
| `docs/architecture/ETIP_Architecture_Blueprint_v4.html` | Phase 4+ | 22-module map, living graph with retroactive risk propagation, 3 enrichment patterns, reasoning trail schema, prompt caching, STIX/TAXII |

---

## ✅ Changes Made (Session 26)

| Commit | Files | Description |
|--------|-------|-------------|
| `bb0a5c1` | 40 | feat: add 20 threat graph improvements — P1/P2 + advanced operations |

## 📁 Files Created

| File | Purpose |
|------|---------|
| `apps/threat-graph/src/schemas/search.ts` | Zod schemas for P1+P2 (#6-15) |
| `apps/threat-graph/src/schemas/operations.ts` | Zod schemas for #16-20 |
| `apps/threat-graph/src/repository-extended.ts` | Extracted stats + relationship CRUD (400L split) |
| `apps/threat-graph/src/services/audit-trail.ts` | #15 Propagation audit trail (in-memory circular buffer) |
| `apps/threat-graph/src/services/bidirectional.ts` | #6 Bidirectional relationship queries |
| `apps/threat-graph/src/services/cluster-detection.ts` | #7 Community detection via shared infrastructure |
| `apps/threat-graph/src/services/impact-radius.ts` | #8 Dry-run blast radius calculator |
| `apps/threat-graph/src/services/graph-diff.ts` | #10 Neighborhood timeline changes |
| `apps/threat-graph/src/services/expand-node.ts` | #11 Paginated 1-hop neighbor expansion |
| `apps/threat-graph/src/services/stix-export.ts` | #12 STIX 2.1 bundle export (7 SDO types + SROs) |
| `apps/threat-graph/src/services/graph-search.ts` | #13 Full-text property/type/risk search |
| `apps/threat-graph/src/services/node-merge.ts` | #16 Node merge/split operations |
| `apps/threat-graph/src/services/batch-import.ts` | #17 Bulk node+relationship import |
| `apps/threat-graph/src/services/decay-cron.ts` | #18 Risk score decay scheduler (6h interval) |
| `apps/threat-graph/src/services/layout-presets.ts` | #19 Graph layout preset CRUD |
| `apps/threat-graph/src/services/relationship-trending.ts` | #20 Confidence change tracking |
| `apps/threat-graph/src/routes/graph-extended.ts` | Routes for #6-15 (11 endpoints) |
| `apps/threat-graph/src/routes/graph-operations.ts` | Routes for #16-20 (10 endpoints) |
| `apps/threat-graph/tests/` (15 new test files) | 204 new tests covering all 20 improvements |

## 📁 Files Modified

| File | Change |
|------|--------|
| `apps/threat-graph/src/schemas/graph.ts` | Added RELATIONSHIP_TYPE_WEIGHTS (#9), source field on relationships (#14) |
| `apps/threat-graph/src/propagation.ts` | Cross-entity type scoring (#9), audit callback hook (#15) |
| `apps/threat-graph/src/repository.ts` | Delegated stats+CRUD to repository-extended.ts, added relType to propagation query |
| `apps/threat-graph/src/queue.ts` | Added source field to create_relationship action |
| `apps/threat-graph/src/config.ts` | Added TI_GRAPH_DECAY_CRON_INTERVAL, TI_GRAPH_DECAY_THRESHOLD, TI_GRAPH_MAX_LAYOUT_PRESETS |
| `apps/threat-graph/src/app.ts` | Registered graph-extended + graph-operations route plugins |
| `apps/threat-graph/src/index.ts` | Wired all 13 services, started decay cron, graceful shutdown |
| `apps/threat-graph/src/routes/graph-extended.ts` | Hooked trending tracker into PUT /relationships |

---

## 🔧 Decisions & Rationale

No new DECISION entries this session. All work follows existing patterns:
- DECISION-013 (in-memory state): layout presets, trending, audit trail use in-memory Maps
- DECISION-018 (neo4j-driver in threat-graph only): all Neo4j queries stay in this module
- DECISION-019 (no Prisma for graph data): all new services use Cypher directly
- DECISION-020 (upward-only propagation): decay cron is separate from propagation (explicitly lowers scores)

---

## 🧪 Deploy Verification

```
No deploy this session (code-only).
Tests: 2165 passing (294 in threat-graph, 204 new this session)
Typecheck: 0 errors
Lint: 0 errors
All source files under 400 lines (max: 375)
```

---

## ⚠️ Open Items / Next Steps

### Immediate — Deploy Threat Graph
- Push to master triggers CI → deploy etip_threat_graph container
- Verify: `docker ps --filter name=etip_threat_graph`, health check on port 3012

### Next — Phase 4 Continues
- Module 13: Correlation Engine (rule-based + AI pattern matching)
- Module 14: Threat Hunting (investigation workspaces)
- Module 11: Digital Risk Protection (dark web monitoring)

### Deferred
- Elasticsearch IOC indexing
- Update QA_CHECKLIST.md to mark enrichment items [U]
- Frontend improvements: docs/FUTURE_IMPROVEMENTS.md
- Migrate in-memory services (audit, presets, trending) to Redis/PostgreSQL for scaling

---

## 🔁 How to Resume

### Session 27: Phase 4 — Correlation Engine (Module 13) (RECOMMENDED)
```
/session-start

Scope: Phase 4 — Correlation Engine (Module 13)
Do not modify: shared-*, api-gateway, user-service, ingestion, normalization,
  ai-enrichment, ioc-intelligence, threat-actor-intel, malware-intel,
  vulnerability-intel, frontend, threat-graph.

## Context
Session 26 completed Threat Graph (Module 12) with 20 improvements, 32 endpoints,
294 tests. Commit bb0a5c1. 2165 monorepo tests. Deploy pending.

## Task: Correlation Engine Service (Module 13)
Build correlation-service on port 3013. Features:
- Rule-based correlation (IOC co-occurrence, shared infrastructure, temporal clustering)
- AI-assisted pattern detection (Claude Sonnet for complex correlations)
- Alert generation from correlation matches
- BullMQ CORRELATE queue consumer
- Integration with threat-graph for relationship creation

Target: apps/correlation-service/ (new module via /new-module).
Skill: skills/13-CORRELATION-ENGINE.md.
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
Phase 4: Advanced Intel      IN PROGRESS: Graph COMPLETE (20 improvements) → Correlation → Hunting → DRP
```
