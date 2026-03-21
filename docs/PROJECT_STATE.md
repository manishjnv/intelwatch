# ETIP Project State
**Last updated:** 2026-03-21 (update at end of EVERY session via /session-end)

## Deployment Status
| Service | Status | Version | Last Deploy | Notes |
|---------|--------|---------|-------------|-------|
| etip_api | ✅ Running | 0.1.0 | 2026-03-21 | Health check passing |
| etip_frontend | ✅ Running | 0.1.0 | 2026-03-21 | Shell only, no dashboard yet |
| etip_nginx | ✅ Running | - | 2026-03-21 | Reverse proxy for ti.intelwatch.in |
| etip_postgres | ✅ Running | 16 | 2026-03-15 | Schema migrated, RLS enabled |
| etip_redis | ✅ Running | 7 | 2026-03-15 | Cache + BullMQ queues |
| etip_ingestion | ✅ Running | 0.1.0 | 2026-03-21 | Feed pipeline + 11 modules |
| etip_normalization | ✅ Running | 0.1.0 | 2026-03-21 | IOC upsert + 18 accuracy improvements |
| etip_enrichment | ✅ Running | 0.1.0 | 2026-03-21 | VT + AbuseIPDB, AI OFF by default |
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
| ingestion | 2 | ✅ Deployed | 2026-03-21 | Feed pipeline + 11 modules. 276 tests. Wired to normalization. |
| normalization | 2 | ✅ Deployed | 2026-03-21 | Port 3005. 18 accuracy improvements. 139 tests. Wired to enrichment. Lifecycle cron every 6h. |
| ai-enrichment | 2 | ✅ Deployed | 2026-03-21 | Port 3006. VT + AbuseIPDB + rate limiting. 27 tests. TI_AI_ENABLED=false by default. |
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
normalization         → shared-types, shared-utils, shared-normalization, shared-auth (Phase 2)
ai-enrichment         → shared-types, shared-utils, shared-auth, shared-enrichment (Phase 2)
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
- **Current phase:** Phase 2 COMPLETE — all 3 pipeline services deployed (ingestion → normalization → enrichment)
- **Last session outcome:** Session 13 (2026-03-21). Deployed normalization (18 accuracy improvements) + built & deployed AI Enrichment Service (Module 06). Full pipeline wired: ingestion → QUEUES.NORMALIZE → normalization → QUEUES.ENRICH_REALTIME → enrichment. VT + AbuseIPDB providers with rate limiting. Lifecycle cron worker (ACTIVE→AGING→EXPIRED every 6h). 851 tests total, zero failures. 14 containers on VPS, all healthy.
- **Known issues:** Raw GH_TOKEN + SSH key previously committed — rotated, history not purged. VPS SSH occasionally times out (RCA #6). BullMQ queue names must use dashes not colons. AI/enrichment OFF on VPS (TI_AI_ENABLED=false, no VT/AbuseIPDB keys set yet).
- **Next tasks:** (1) Set VT/AbuseIPDB API keys on VPS + enable TI_AI_ENABLED. (2) E2E test: create feed → fetch → ingest → normalize → enrich → query IOCs. (3) Elasticsearch IOC indexing. (4) Phase 3: IOC Intelligence Service (Module 07). (5) Dashboard frontend — IOC list page, feed management UI.

## E2E Smoke Test Plan
```
1. Create feed:   POST /api/v1/feeds  { name: "OTX", url: "...", type: "rss" }
2. Trigger fetch:  Scheduler auto-fetches OR POST /api/v1/feeds/:id/fetch
3. Verify articles: GET /api/v1/articles → articles persisted
4. Verify IOCs:    GET /api/v1/iocs → IOCs normalized, confidence scored
5. Verify enrichment: GET /api/v1/iocs/:id → enrichmentData has VT/AbuseIPDB results
6. Verify lifecycle: Wait 6h → IOCs without re-sighting transition to AGING
7. Verify stats:   GET /api/v1/iocs/stats → counts by type, lifecycle, severity
8. Verify enrich stats: GET /api/v1/enrichment/stats → enriched vs pending counts
```

## Environment Notes
- VPS: 72.61.227.64, 8GB RAM (~6GB used by 14 containers), 96GB disk (26% used)
- CI/CD: GitHub Actions deploy.yml → VPS, last run green
- Caddy: routing ti.intelwatch.in → etip_nginx
- SSH: Port 22 filtered, use GitHub Actions vps-cmd.yml or Cloudflare Tunnel
- API keys needed on VPS: TI_VIRUSTOTAL_API_KEY, TI_ABUSEIPDB_API_KEY, TI_AI_ENABLED=true
