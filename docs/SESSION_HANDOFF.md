# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-23
**Session:** 27
**Session Summary:** Correlation Engine Service (Module 13) — core + 10 accuracy improvements (P0 #1-5 + P1 #6-10). 20 source files, 12 API endpoints, 106 tests. In-memory, no deploy.

---

## MANDATORY: Review These Architecture Docs Every Session

| Document | When to Load | Key Content |
|----------|-------------|-------------|
| `docs/architecture/CTI-Pipeline-Architecture-v2.0.html` | Pipeline work | 4-stage pipeline, composite confidence formula, enrichment Stage 2.5, cost model, 3-layer dedup, IOC lifecycle state machine |
| `docs/architecture/ETIP_Architecture_Blueprint_v4.html` | Phase 4+ | 22-module map, living graph with retroactive risk propagation, 3 enrichment patterns, reasoning trail schema, prompt caching, STIX/TAXII |

---

## ✅ Changes Made (Session 27)

| Commit | Files | Description |
|--------|-------|-------------|
| pending | 36 | feat: add correlation engine service (Module 13) — 10 improvements, 12 endpoints, 106 tests |

## 📁 Files Created

| File | Purpose |
|------|---------|
| `apps/correlation-engine/package.json` | @etip/correlation-engine deps (no Prisma, no Neo4j) |
| `apps/correlation-engine/tsconfig.json` | Composite true, refs to shared-types/utils/auth |
| `apps/correlation-engine/vitest.config.ts` | Alias resolution for @etip/* packages |
| `apps/correlation-engine/src/config.ts` | Zod env schema: port 3013, 13 correlation-specific tunables |
| `apps/correlation-engine/src/logger.ts` | Pino singleton, name `etip-correlation-engine` |
| `apps/correlation-engine/src/app.ts` | Fastify builder with plugins + route registration |
| `apps/correlation-engine/src/index.ts` | Bootstrap: config→JWT→services→app→worker→listen |
| `apps/correlation-engine/src/plugins/auth.ts` | authenticate, getUser, rbac preHandlers |
| `apps/correlation-engine/src/plugins/error-handler.ts` | AppError/ZodError/rate-limit handlers |
| `apps/correlation-engine/src/schemas/correlation.ts` | All types: CorrelatedIOC, CorrelationResult, CampaignCluster, DiamondMapping, KillChainCoverage, FPFeedback, RuleStats, CorrelationStore class, route query schemas |
| `apps/correlation-engine/src/routes/health.ts` | /health + /ready endpoints |
| `apps/correlation-engine/src/routes/correlations.ts` | 10 correlation endpoints under /api/v1/correlations |
| `apps/correlation-engine/src/workers/correlate.ts` | BullMQ CORRELATE consumer + queue producer |
| `apps/correlation-engine/src/services/cooccurrence.ts` | #1 Sliding-window Jaccard co-occurrence |
| `apps/correlation-engine/src/services/infrastructure-cluster.ts` | #2 ASN/CIDR/registrar overlap clustering |
| `apps/correlation-engine/src/services/temporal-wave.ts` | #3 Z-score anomaly detection on IOC volume |
| `apps/correlation-engine/src/services/ttp-similarity.ts` | #4 Sorensen-Dice coefficient on MITRE techniques |
| `apps/correlation-engine/src/services/campaign-cluster.ts` | #5 DBSCAN 4D campaign auto-clustering |
| `apps/correlation-engine/src/services/confidence-scoring.ts` | #6 Composite weighted confidence formula |
| `apps/correlation-engine/src/services/diamond-model.ts` | #7 Diamond Model facet classification |
| `apps/correlation-engine/src/services/kill-chain.ts` | #8 MITRE tactic → Kill Chain phase mapping |
| `apps/correlation-engine/src/services/fp-suppression.ts` | #9 Per-rule FP rate tracking + auto-suppress |
| `apps/correlation-engine/src/services/relationship-inference.ts` | #10 BFS transitive closure with confidence decay |
| `apps/correlation-engine/tests/` (13 test files) | 106 tests covering config, health, schemas, and all 10 services |

## 📁 Files Modified

| File | Change |
|------|--------|
| `tsconfig.build.json` | Added `{ "path": "apps/correlation-engine" }` to references |
| `pnpm-lock.yaml` | Updated for new module dependencies |

---

## 🔧 Decisions & Rationale

- **DECISION-021**: Correlation engine uses `alert:read`/`alert:create` permissions (no shared-auth change needed — correlations produce alerts, same access semantics)
- **DECISION-022**: Correlation engine is fully in-memory (no Prisma, no Neo4j driver — follows DECISION-013 pattern for Phase 4 validation)

---

## 🧪 Deploy Verification

```
No deploy this session (code-only).
Tests: 2271 passing (106 in correlation-engine, 106 new this session)
Typecheck: 0 errors
All source files under 300 lines (max: 246 in schemas/correlation.ts)
```

---

## ⚠️ Open Items / Next Steps

### Immediate — Correlation Engine P2
- #11 AI-assisted pattern detection (Claude Sonnet for entity cluster analysis)
- #12 Correlation rule template library (pre-built APT, ransomware, C2, supply chain rules)
- #13 Correlation confidence decay (type-specific aging per DECISION-015)
- #14 Batch re-correlation (retroactive rule execution against historical data)
- #15 Threat-graph integration (push CORRELATED_WITH relationships to Neo4j)

### Pending — Deploy
- Deploy threat-graph to VPS (session 25+26 code)
- Deploy correlation-engine after P2 complete

### Deferred
- Add `correlation:*` permissions to shared-auth (uses `alert:*` for now)
- Elasticsearch IOC indexing
- Update QA_CHECKLIST.md
- Migrate in-memory services to Redis/PostgreSQL for scaling

---

## 🔁 How to Resume

### Session 28: Phase 4 — Correlation Engine P2 (#11-15) (RECOMMENDED)
```
/session-start

Scope: Phase 4 — Correlation Engine P2 (Module 13)
Do not modify: shared-*, api-gateway, user-service, ingestion, normalization,
  ai-enrichment, ioc-intelligence, threat-actor-intel, malware-intel,
  vulnerability-intel, frontend, threat-graph.

## Context
Session 27 built Correlation Engine core + 10 improvements (P0 #1-5, P1 #6-10).
20 source files, 12 endpoints, 106 tests. 2271 monorepo tests. No deploy.

## Task: Correlation Engine P2 (#11-15)
Complete remaining 5 improvements:
- #11 AI-assisted pattern detection (Claude Sonnet)
- #12 Correlation rule template library
- #13 Correlation confidence decay
- #14 Batch re-correlation
- #15 Threat-graph integration (CORRELATED_WITH relationships)

Target: apps/correlation-engine/ (existing module).
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
Phase 4: Advanced Intel      IN PROGRESS: Graph COMPLETE → Correlation WIP (10/15) → Hunting → DRP
```
