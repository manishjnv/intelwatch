# ETIP Project State
**Last updated:** 2026-03-20 (update at end of EVERY session via /session-end)

## Deployment Status
| Service | Status | Version | Last Deploy | Notes |
|---------|--------|---------|-------------|-------|
| etip_api | ✅ Running | 0.1.0 | 2026-03-15 | Health check passing |
| etip_frontend | ✅ Running | 0.1.0 | 2026-03-15 | Shell only, no dashboard yet |
| etip_nginx | ✅ Running | - | 2026-03-15 | Reverse proxy for ti.intelwatch.in |
| etip_postgres | ✅ Running | 16 | 2026-03-15 | Schema migrated, RLS enabled |
| etip_redis | ✅ Running | 7 | 2026-03-15 | Cache + BullMQ queues |
| etip_prometheus | ✅ Running | - | 2026-03-15 | Metrics on port 9190 |
| etip_grafana | ✅ Running | - | 2026-03-15 | Dashboards on port 3101 |
| intelwatch.in | ⛔ DO NOT TOUCH | - | - | Live production site |

## Module Development Status
| Module | Phase | Status | Last Worked | Blockers |
|--------|-------|--------|-------------|----------|
| api-gateway | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-types | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-utils | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-auth | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-cache | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-audit | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-normalization | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-enrichment | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-ui | 1 | ✅ Deployed | 2026-03-15 | None |
| user-service | 1 | ✅ Deployed | 2026-03-15 | None |
| frontend | 1 | 🔨 Shell only | 2026-03-15 | Needs dashboard layout |
| ingestion | 2 | 🔨 In progress | 2026-03-20 | PR #17 open, CI green, needs container setup |
| normalization | 2 | 📋 Not started | - | Depends on ingestion |
| ai-enrichment | 2 | 📋 Not started | - | Depends on normalization |
| ioc-intelligence | 3 | 📋 Not started | - | Phase 3 gate |
| threat-actor-intel | 3 | 📋 Not started | - | Phase 3 gate |
| malware-intel | 3 | 📋 Not started | - | Phase 3 gate |
| vulnerability-intel | 3 | 📋 Not started | - | Phase 3 gate |
| digital-risk-protection | 4 | 📋 Not started | - | Phase 4 gate |
| threat-graph | 4 | 📋 Not started | - | Phase 4 gate |
| correlation-engine | 4 | 📋 Not started | - | Phase 4 gate |
| threat-hunting | 4 | 📋 Not started | - | Phase 4 gate |
| enterprise-integration | 5 | 📋 Not started | - | Phase 5 gate |
| user-management | 5 | 📋 Not started | - | Phase 5 gate |
| customization | 5 | 📋 Not started | - | Phase 5 gate |
| onboarding | 6 | 📋 Not started | - | Phase 6 gate |
| billing | 6 | 📋 Not started | - | Phase 6 gate |
| admin-ops | 6 | 📋 Not started | - | Phase 6 gate |

## Module Dependency Map
```
shared-types          → (no deps)
shared-utils          → (no deps)
shared-cache          → (no deps)
shared-ui             → (no deps)
shared-auth           → shared-types, shared-utils
shared-audit          → shared-utils
shared-normalization  → shared-utils
shared-enrichment     → shared-utils
user-service          → shared-types, shared-utils, shared-auth
api-gateway           → shared-types, shared-utils, shared-auth, user-service
ingestion             → shared-types, shared-utils, shared-auth, shared-cache, shared-audit, shared-enrichment, shared-normalization (Phase 2)
normalization         → shared-types, shared-utils, shared-normalization (Phase 2)
ai-enrichment         → shared-types, shared-utils, shared-enrichment (Phase 2)
frontend              → shared-types, shared-ui (Phase 1+)
```

## Module Ownership Tiers

### Tier 1 — FROZEN (shared-* packages, api-gateway)
- Backward-compatible changes ONLY
- Breaking changes require: impact analysis → list all consumers → get explicit approval
- Before any modification:
  1. List every module that imports from this package
  2. Verify the change is additive (new exports OK, changing/removing existing = breaking)
  3. If breaking: must update ALL consumers in the same PR
- api-gateway: central orchestrator — route registration changes only, never structural

### Tier 2 — GUARDED (✅ Deployed feature services)
- Bug fixes with test coverage: allowed
- New features: only if in current phase scope
- Structural changes (file moves, pattern changes): require plan mode + approval
- Never touch during another module's development session

### Tier 3 — FREE (🔨 WIP and 📋 Not Started modules)
- Active development welcome
- Follow TDD via /implement
- Can evolve freely within architecture constraints
- Must still respect shared package boundaries (Tier 1 rules apply to imports)

### Status Quick Reference
- ✅ DEPLOYED = Tier 2 (guarded)
- 🔨 WIP = Tier 3 (free)
- 📋 NOT STARTED = Tier 3 after /new-module scaffold
- ⛔ NEVER TOUCH = intelwatch.in, ti-platform-* containers
- shared-* packages = Tier 1 (frozen) always, regardless of other status

## Work In Progress
- **Current phase:** Phase 2 IN PROGRESS — ingestion service built
- **Last session outcome:** Session 6 (2026-03-20). Built ingestion service: Fastify microservice with 10 API endpoints (feed CRUD, trigger, health, stats), JWT auth + RBAC. Implemented 6 competitive improvement modules: Corroboration Engine (cross-feed confidence boost), Adaptive Triage (per-tenant feedback loop), IOC Context Extractor (±1 sentence windowing), Feed Reliability Auto-Tuner (4-metric EMA), 3-Layer Dedup (Bloom+Jaccard+LLM), Cost Tracker (per-article per-stage). 101 tests, 8 test files, CI green. PR #17 open on feat/phase2-ingestion-service.
- **Known issues:** Raw GH_TOKEN + SSH key previously committed — rotated, history not purged. Ingestion excluded from CI test/typecheck (intentional). Ingestion has no container in docker-compose yet (needs etip_ingestion service definition + nginx proxy rules).
- **Next tasks:** (1) Merge PR #17 to master. (2) Add etip_ingestion container to docker-compose.etip.yml. (3) Add nginx proxy for /api/v1/feeds/*. (4) Deploy to VPS. (5) Implement feed connectors (RSS, STIX, TAXII parsers) as next chunk. (6) Implement BullMQ workers for feed-fetch queue.

## Environment Notes
- VPS: 72.61.227.64, 8GB RAM (5.2GB used by 10 containers), 96GB disk (26% used)
- CI/CD: GitHub Actions deploy.yml → VPS, last run green
- Caddy: routing ti.intelwatch.in → etip_nginx
- SSH: Port 22 filtered, use GitHub Actions vps-cmd.yml or Cloudflare Tunnel
