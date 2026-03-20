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
| ingestion | 2 | 🔨 Deployed | 2026-03-21 | Full pipeline wired: 11 modules → feed-fetch worker. Article model + persistence + API routes. 222 tests across 18 files. Needs: STIX connectors, Claude Haiku triage, deploy session 9 |
| normalization | 2 | 🔨 Built | 2026-03-21 | Fastify on port 3005. BullMQ worker + IOC upsert + 6 accuracy improvements. 95 tests. Wired to ingestion. |
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
- **Current phase:** Phase 2 IN PROGRESS — normalization service built
- **Last session outcome:** Session 12 (2026-03-21). Normalization service (Module 05) fully built with 6 accuracy improvements: (1) live confidence decay on re-sighting, (2) feed reliability from DB, (3) sighting count + source diversity tracking, (4) IOC lifecycle transitions (NEW→ACTIVE→REACTIVATED), (5) bogon/safe-domain/placeholder quality filters, (6) auto-severity classification from context. Ingestion wired to queue IOCs to QUEUES.NORMALIZE. 95 normalization tests + 774 total across monorepo. Docker/nginx/deploy.yml registered.
- **Known issues:** Raw GH_TOKEN + SSH key previously committed — rotated, history not purged. VPS SSH occasionally times out (RCA #6). BullMQ queue names must use dashes not colons. AI currently OFF on VPS.
- **Next tasks:** (1) Deploy normalization service to VPS (push to master). (2) Module 06: AI Enrichment Service + VT/AbuseIPDB. (3) IOC lifecycle cron job (ACTIVE→AGING→EXPIRED auto-transitions). (4) Elasticsearch IOC indexing. (5) E2E test: feed → ingest → normalize → query IOCs API.

## Environment Notes
- VPS: 72.61.227.64, 8GB RAM (~5.5GB used by 11 containers), 96GB disk (26% used)
- CI/CD: GitHub Actions deploy.yml → VPS, last run green
- Caddy: routing ti.intelwatch.in → etip_nginx
- SSH: Port 22 filtered, use GitHub Actions vps-cmd.yml or Cloudflare Tunnel
