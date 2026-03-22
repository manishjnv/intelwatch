# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-22
**Session:** 25
**Session Summary:** Threat Graph Service (Module 12) — Neo4j knowledge graph with living risk propagation, 7 node types, 9 relationship types, 11 endpoints, 5 P0 differentiator improvements. Phase 4 started.

---

## MANDATORY: Review These Architecture Docs Every Session

| Document | When to Load | Key Content |
|----------|-------------|-------------|
| `docs/architecture/CTI-Pipeline-Architecture-v2.0.html` | Pipeline work | 4-stage pipeline, composite confidence formula, enrichment Stage 2.5, cost model, 3-layer dedup, IOC lifecycle state machine |
| `docs/architecture/ETIP_Architecture_Blueprint_v4.html` | Phase 4+ | 22-module map, living graph with retroactive risk propagation, 3 enrichment patterns, reasoning trail schema, prompt caching, STIX/TAXII |

---

## ✅ Changes Made (Session 25)

| Commit | Files | Description |
|--------|-------|-------------|
| `2e37845` | 33 | feat: add threat graph service (Module 12) — Neo4j knowledge graph with living risk propagation |

## 📁 Files Created

| File | Purpose |
|------|---------|
| `apps/threat-graph/package.json` | Dependencies (neo4j-driver, bullmq, fastify, zod) |
| `apps/threat-graph/tsconfig.json` | TypeScript config (composite, references) |
| `apps/threat-graph/vitest.config.ts` | Vitest with workspace aliases |
| `apps/threat-graph/README.md` | Module documentation |
| `apps/threat-graph/src/index.ts` | Entry point, startup, graceful shutdown |
| `apps/threat-graph/src/app.ts` | Fastify builder with all plugins |
| `apps/threat-graph/src/config.ts` | Zod env schema (port 3012 + Neo4j + propagation config) |
| `apps/threat-graph/src/logger.ts` | Pino singleton with ETIP redaction |
| `apps/threat-graph/src/prisma.ts` | PrismaClient singleton |
| `apps/threat-graph/src/driver.ts` | Neo4j driver singleton (new pattern) |
| `apps/threat-graph/src/plugins/auth.ts` | JWT authenticate + rbac preHandlers |
| `apps/threat-graph/src/plugins/error-handler.ts` | AppError + Zod + Fastify error handler |
| `apps/threat-graph/src/schemas/graph.ts` | Zod schemas: 7 node types, 9 relationship types, query params |
| `apps/threat-graph/src/repository.ts` | Neo4j Cypher queries: CRUD, N-hop, path, cluster, stats |
| `apps/threat-graph/src/service.ts` | Business logic: create/query/expand + path explanation |
| `apps/threat-graph/src/propagation.ts` | Risk propagation engine (BFS, decay, confidence-weighted, temporal) |
| `apps/threat-graph/src/queue.ts` | BullMQ GRAPH_SYNC queue + worker factory |
| `apps/threat-graph/src/routes/health.ts` | GET /health, /ready (incl. Neo4j check) |
| `apps/threat-graph/src/routes/graph.ts` | All graph API endpoints (11 routes) |
| `apps/threat-graph/tests/health.test.ts` | 3 tests |
| `apps/threat-graph/tests/config.test.ts` | 9 tests |
| `apps/threat-graph/tests/schemas.test.ts` | 28 tests |
| `apps/threat-graph/tests/driver.test.ts` | 8 tests |
| `apps/threat-graph/tests/repository.test.ts` | 12 tests |
| `apps/threat-graph/tests/service.test.ts` | 17 tests |
| `apps/threat-graph/tests/propagation.test.ts` | 13 tests |

## 📁 Files Modified

| File | Change |
|------|--------|
| `tsconfig.build.json` | Added `{ "path": "apps/threat-graph" }` to references |
| `Dockerfile` | Added COPY line for threat-graph package.json + tsconfig.json |
| `docker-compose.etip.yml` | Added etip_threat_graph service (port 3012, depends_on neo4j) + nginx depends_on |
| `pnpm-lock.yaml` | Auto-updated (neo4j-driver added) |

---

## 🔧 Decisions & Rationale

- **DECISION-018**: neo4j-driver in threat-graph only (not a shared package). Only one service talks to Neo4j.
- **DECISION-019**: No Prisma models for graph data — Neo4j is the sole store. Cypher queries directly.
- **DECISION-020**: Risk propagation is upward-only (never lowers scores). Prevents false-positive cascading.

---

## 🧪 Deploy Verification

```
CI Run: 23407860884 — IN PROGRESS (pushed 2e37845)
  - Tests: 1961 passing (90 new)
  - Typecheck: 0 errors
  - Lint: 0 errors
  - Docker build: pending CI
  - Deploy to VPS: pending CI
```

---

## ⚠️ Open Items / Next Steps

### Immediate — Session 26: Threat Graph P1+P2 Improvements
10 remaining improvements for Module 12:
- P1: #6 Bidirectional semantics, #7 Cluster detection, #8 Impact radius, #9 Cross-entity scoring, #10 Graph diff/timeline
- P2: #11 Expand node, #12 STIX export, #13 Graph search, #14 Relationship CRUD, #15 Propagation audit trail

### After That — Phase 4 Continues
- Module 13: Correlation Engine (rule-based + AI)
- Module 14: Threat Hunting (investigation workspaces)
- Module 11: Digital Risk Protection (P1)

### Deferred
- Update QA_CHECKLIST.md to mark enrichment items [U]
- Elasticsearch IOC indexing
- Frontend improvements: docs/FUTURE_IMPROVEMENTS.md
- Verify CI run 23407860884 completes green

---

## 🔁 How to Resume

### Session 26: Phase 4 — Threat Graph P1+P2 (RECOMMENDED)
```
/session-start

Scope: Phase 4 — Threat Graph Service P1+P2 (Module 12)
Do not modify: shared-*, api-gateway, user-service, ingestion, normalization,
  ai-enrichment, ioc-intelligence, threat-actor-intel, malware-intel,
  vulnerability-intel, frontend.

## Context
Session 25 built threat graph core + P0 #1-5. Port 3012. 90 tests. Commit 2e37845.
Neo4j knowledge graph: 7 node types, 9 relationship types, 11 endpoints.
Risk propagation (BFS 3-hop, 0.7^distance decay, confidence-weighted, temporal decay).
Path explanation, graph statistics. BullMQ GRAPH_SYNC worker.

## Task: 10 Improvements (P1 #6-10 + P2 #11-15)

P1 — Accuracy Boosters:
  #6  Bidirectional relationship semantics (query from either direction)
  #7  Cluster detection (community detection for shared infrastructure)
  #8  Impact radius calculation (blast radius before action)
  #9  Cross-entity type scoring (per-relationship-type propagation weights)
  #10 Graph diff / timeline (neighborhood changes over N days)

P2 — UX Enhancements (backend-ready):
  #11 Expand node API (lazy-load immediate neighbors only)
  #12 Subgraph export as STIX 2.1 bundle
  #13 Graph search (find nodes by property, type, risk score range)
  #14 Relationship CRUD (analyst-confirmed vs auto-detected labels)
  #15 Risk propagation audit trail (before/after scores, trigger, decay path)

Target: all in apps/threat-graph/ only. Suggest further improvements.
Skill: skills/12-THREAT-GRAPH.md.
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
Phase 4: Advanced Intel      IN PROGRESS: Graph (core done) → P1+P2 → Correlation → Hunting
```
