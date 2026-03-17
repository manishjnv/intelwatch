# PROJECT BRAIN — ETIP v4.0 Enterprise Threat Intelligence Platform

**Last Updated**: 2026-03-17
**Current Phase**: 1 (Foundation) — IN PROGRESS
**Skill System**: v3 (26 numbered skill files)
**Status**: Docker Compose ✅ · Folder Structure ✅ · Shared Packages ✅ (153 tests) · Auth+Gateway+UserService ✅ (113 tests) · Prisma Schema ✅ · VPS Deployed ✅ · CI/CD Live ✅ · https://ti.intelwatch.in ✅ · **Total: 266 tests passing**

---

## SESSION START TEMPLATE

Copy this into every new Claude conversation to resume context:

```
Read E:\code\IntelWatch\PROJECT_BRAIN.md via filesystem.
Read E:\code\IntelWatch\docker-compose.etip.yml via filesystem.

Load from project knowledge files:
1. 00-ARCHITECTURE-ROADMAP.md
2. 00-MASTER.md
3. [relevant module skill, e.g., 07-IOC-INTELLIGENCE.md]

Task: [describe task here].
Begin pre-task ritual per 00-CLAUDE-INSTRUCTIONS.md.
```

---

## PROJECT OVERVIEW

**IntelWatch ETIP v4.0** is an enterprise-grade threat intelligence platform combining automated ingestion, AI-powered enrichment, Neo4j graph analysis, and real-time alerting. It consolidates feeds (STIX/TAXII, MISP, NVD, dark web, OSINT) with enterprise integrations (15+ SIEMs, case management, ticketing) and provides hunting, digital risk protection, and compliance reporting.

**Competitive Positioning**: vs CrowdStrike (endpoint), Recorded Future (paid feeds), ThreatConnect (open-source)
- **Unique**: Claude AI reasoner (campaign attribution, risk scoring), Neo4j graph (IOC ↔ Actor relationships), open standards (STIX/TAXII)
- **Target**: Mid-market + enterprise security teams (100–500K IOCs/day)
- **SLA**: Ingestion <5min, enrichment <5s, search <100ms, alerts <5min

---

## INFRASTRUCTURE

### Local Development
- **Machine**: Windows
- **Project path**: `E:\code\IntelWatch\`
- **Repo**: https://github.com/manishjnv/intelwatch
- **Branch strategy**: main (stable) → feature/module-name

### VPS Production
- **OS**: Ubuntu 24.04 LTS
- **Type**: KVM2
- **IP**: 72.61.227.64
- **SSH**: `ssh root@72.61.227.64`
- **ETIP URL**: https://ti.intelwatch.in (LIVE)
- **ETIP deploy path**: `/opt/intelwatch/`
- **Reverse proxy**: Caddy (existing `ti-platform-caddy-1` container, NOT Nginx)
- **SSL**: Auto via Caddy + Let's Encrypt
- **DNS**: Cloudflare — `ti` A record → `72.61.227.64` (DNS only, no proxy)

### Deployment Architecture
```
Internet → Caddy (ports 80/443, ti-platform-caddy-1)
  ├── intelwatch.in     → ti-platform-api-1 / ti-platform-ui-1 (UNTOUCHED)
  └── ti.intelwatch.in  → etip_nginx:80 → ETIP services (via ti-platform_default network)
```

### ⚠️ CRITICAL: Caddy ↔ ETIP Nginx Networking
After every `docker compose up -d --force-recreate etip_nginx`, you MUST reconnect:
```bash
docker network connect ti-platform_default etip_nginx
docker restart ti-platform-caddy-1
```

### Port Allocation (ETIP-specific, conflict-safe)

| Service | ETIP Port | Default Port (avoid) |
|---------|-----------|----------------------|
| PostgreSQL | 5433 | 5432 |
| Redis | 6380 | 6379 |
| Elasticsearch | 9201 | 9200 |
| Neo4j Bolt | 7688 | 7687 |
| Neo4j HTTP | 7475 | 7474 |
| MinIO API | 9001 | 9000 |
| MinIO Console | 9002 | 9001 |
| API (Fastify) | 3001 | 3000 |
| Frontend (Vite) | 3002 | — |
| Nginx HTTP | 8080 | 80 |
| Prometheus | 9190 | 9090 |
| Grafana | 3101 | 3000 |

---

## V3 MODULE REGISTRY

| # | Module | Status | Path | Phase | Tests |
|---|--------|--------|------|-------|-------|
| — | api-gateway | ✅ Complete | `/apps/api-gateway` | 1 | 26 |
| 16 | user-service | ✅ Complete (Phase 1) | `/apps/user-service` | 1 | 16 |
| — | shared-auth | ✅ Complete | `/packages/shared-auth` | 1 | 71 |
| — | shared-types | ✅ Complete | `/packages/shared-types` | 1 | 55 |
| — | shared-utils | ✅ Complete | `/packages/shared-utils` | 1 | 58 |
| — | shared-cache | ✅ Complete | `/packages/shared-cache` | 1 | 40 |
| — | prisma schema | ✅ Validated | `/prisma/schema.prisma` | 1 | — |
| 04 | ingestion-service | Planned | `/apps/ingestion-service` | 2 | — |
| 05 | normalization-service | Planned | `/apps/normalization-service` | 2 | — |
| 06 | enrichment-service | Planned | `/apps/enrichment-service` | 2 | — |
| 07 | ioc-service | Planned | `/apps/ioc-service` | 3 | — |
| 08 | threat-actor-service | Planned | `/apps/threat-actor-service` | 3 | — |
| 09 | malware-service | Planned | `/apps/malware-service` | 3 | — |
| 10 | vuln-service | Planned | `/apps/vuln-service` | 3 | — |
| 11 | drp-service | Planned | `/apps/drp-service` | 4 | — |
| 12 | graph-service | Planned | `/apps/graph-service` | 4 | — |
| 13 | correlation-service | Planned | `/apps/correlation-service` | 4 | — |
| 14 | hunting-service | Planned | `/apps/hunting-service` | 4 | — |
| 15 | integration-service | Planned | `/apps/integration-service` | 5 | — |
| 17 | customization-service | Planned | `/apps/customization-service` | 5 | — |
| 18 | onboarding-service | Planned | `/apps/onboarding-service` | 6 | — |
| 19 | billing-service | Planned | `/apps/billing-service` | 6 | — |
| 22 | admin-service | Planned | `/apps/admin-service` | 6 | — |
| 20 | frontend | Planned | `/apps/frontend` | 8 | — |

---

## PHASED IMPLEMENTATION ROADMAP

### Phase 1 — Foundation — 🟡 IN PROGRESS (85% complete)

| Task | Status | Notes |
|------|--------|-------|
| Docker Compose (8 services) | ✅ COMPLETE | `docker-compose.etip.yml` — PG, Redis, ES, Neo4j, MinIO, Prometheus, Grafana, Nginx |
| Folder structure | ✅ COMPLETE | apps/, packages/, docs/, skills/, prisma/, config/, docker/, scripts/, .github/ |
| Root config files | ✅ COMPLETE | package.json, pnpm-workspace.yaml, tsconfig.base.json, .gitignore, .env.example |
| Skills v3 migration | ✅ COMPLETE | 26 skill files loaded as project knowledge |
| Shared packages (types, utils, cache) | ✅ COMPLETE | 153 tests, 0 TS errors. Session 1. |
| VPS deployment (8 containers) | ✅ COMPLETE | All healthy at /opt/intelwatch/ |
| CI/CD pipeline (GitHub Actions → VPS) | ✅ COMPLETE | Auto-deploy on master push + workflow_dispatch |
| Caddy reverse proxy + SSL | ✅ COMPLETE | ti.intelwatch.in → etip_nginx:80 |
| Landing page | ✅ COMPLETE | Futuristic design live at https://ti.intelwatch.in |
| Shared packages (auth) | ✅ COMPLETE | JWT (access 15min + refresh 7d), RBAC (5 roles, 30+ perms, wildcards), bcrypt (cost 12), service JWT (60s TTL). **71 tests.** |
| API Gateway | ✅ COMPLETE | Fastify, CORS, rate-limit, Helmet, auth/RBAC middleware, error handler, health/ready, auth routes. **26 tests.** |
| User service | ✅ COMPLETE | Register, login, refresh (token rotation + theft detection), logout, profile. Prisma mocked. **16 tests.** |
| Prisma schema (validated) | ✅ COMPLETE | 5 tables (tenants, users, sessions, api_keys, audit_logs), 3 enums, 12 indexes, 7 relations. `prisma validate` ✅. Client generated. |
| Pino logging setup | ✅ COMPLETE | api-gateway/src/logger.ts — Pino structured JSON, PII redaction |
| Prisma migrations on VPS | ⬜ NOT STARTED | `prisma migrate dev --name phase1-foundation` on etip_postgres |
| Docker: etip_api service | ⬜ NOT STARTED | Add api-gateway container to docker-compose.etip.yml |
| Nginx proxy update | ⬜ NOT STARTED | Route `/api/` → `etip_api:3001` |
| Frontend shell | ⬜ NOT STARTED | React 18 + Vite + shadcn/ui, login page, empty dashboard |

**Exit criteria**: User can register, login, see empty dashboard. CI/CD deployed. `/health` → 200. DB migrations applied.

---

### Phase 2 — Data Pipeline — ⬜ PLANNED

| Task | Module | Priority |
|------|--------|----------|
| Normalization engine | 05-normalization | P0 |
| AI Enrichment service | 06-ai-enrichment | P0 |
| Ingestion service | 04-ingestion | P0 |
| BullMQ pipeline wiring | 21-module-integration | P0 |
| Feed management API + UI | 04-ingestion | P0 |
| Caching layer (Redis L1) | 23-caching-archival | P1 |

---

### Phases 3–8 — See 00-ARCHITECTURE-ROADMAP.md

---

## PRISMA SCHEMA (SOURCE OF TRUTH)

> **The authoritative Phase 1 database schema is `prisma/schema.prisma`.**

| Table | Key Fields | Notes |
|-------|-----------|-------|
| `tenants` | id, name, slug (unique), plan, maxUsers, maxIOCs, aiCredits, settings, active | Multi-tenant with plan limits |
| `users` | id, tenantId (FK), email, displayName, role, authProvider, passwordHash, mfaEnabled | Unique on (tenantId, email) |
| `sessions` | id, userId (FK), tenantId, refreshTokenHash, ipAddress, userAgent, expiresAt, revokedAt | Token rotation + theft detection |
| `api_keys` | id, tenantId, userId, name, prefix, keyHash, scopes[], lastUsed, expiresAt, active | Unique on (tenantId, name) |
| `audit_logs` | id, tenantId, userId, action, entityType, entityId, changes, ipAddress, userAgent | Immutable (no updatedAt) |

| Enum | Values |
|------|--------|
| Plan | free, pro, enterprise |
| Role | super_admin, tenant_admin, analyst, viewer, api_only |
| AuthProvider | email, google, saml, oidc |

---

## PROJECT CONSTANTS

```typescript
const MODELS = { default: 'claude-sonnet-4-20250514', fast: 'claude-haiku-4-5-20251001', heavy: 'claude-opus-4-6' }
const CACHE_TTL = { dashboard: 172800, iocSearch: 3600, enrichment: { ip: 3600, domain: 86400, hash: 604800, cve: 43200 }, userSession: 900, feedData: 1800 }
const ARCHIVE_AFTER_DAYS = 60
const MAX_FILE_LINES = 400
const API_VERSION = 'v1'
```

---

## SECURITY FEATURES (SESSION 2)

| Feature | Implementation | Location |
|---------|---------------|----------|
| JWT access tokens (15min) | jsonwebtoken + Zod validation | shared-auth/jwt.ts |
| JWT refresh tokens (7d) | Single-use rotation, sha256 hash stored | user-service/service.ts |
| Token theft detection | Revokes ALL sessions on hash mismatch | user-service/service.ts |
| bcrypt password hashing | Cost factor 12, unique salts | shared-auth/password.ts |
| RBAC (5 roles, 30+ perms) | Wildcard matching (*, resource:*) | shared-auth/permissions.ts |
| Service-to-service JWT | 60s TTL, issuer validation | shared-auth/service-jwt.ts |
| PII redaction in logs | Pino redact (passwords, tokens, secrets) | api-gateway/logger.ts |
| Rate limiting | Per-user/IP via @fastify/rate-limit | api-gateway/app.ts |
| Input validation | Zod schemas on all routes | api-gateway/routes/auth.ts |
| CORS + Helmet | @fastify/cors, @fastify/helmet | api-gateway/app.ts |

---

## CHANGE LOG

| Date | Entry |
|------|-------|
| 2026-03-15 | **v3 Migration**: 26 skill files, docker-compose, folder structure, root configs. |
| 2026-03-16 | **PROJECT_BRAIN v3**: 8-phase roadmap, v3 service names, conflict-safe ports. |
| 2026-03-17 | **Session 1 — Shared packages**: shared-types (55), shared-utils (58), shared-cache (40). 153 tests. |
| 2026-03-17 | **VPS Infra**: 8 containers, Caddy proxy, SSL, landing page, CI/CD pipeline. |
| 2026-03-17 | **Session 2 — Auth+Gateway+UserService**: shared-auth (71), api-gateway (26), user-service (16), prisma validated. 113 new tests (266 total). 34 files, 3,022 lines. Matrix-verified. |
| 2026-03-17 | **Prisma Phase 1**: 5 tables, 3 enums, 12 indexes, 7 relations, cascade deletes. Prisma is source of truth. |
| 2026-03-17 | **Security**: Token rotation, theft detection, bcrypt cost 12, PII redaction, service JWT, RBAC wildcards. |
| 2026-03-17 | **Docs update**: PROJECT_BRAIN v4.0, README (266 tests), .env.example (TI_SERVICE_JWT_SECRET). |

---

## NEXT ACTIONS

### Session 2 — COMPLETE ✅
- ~~shared-auth~~ ✅ 71 tests · ~~api-gateway~~ ✅ 26 tests · ~~prisma~~ ✅ · ~~user-service~~ ✅ 16 tests · ~~pino logging~~ ✅

### Next — Phase 1 Session 3
1. **Prisma migrations** — Apply to etip_postgres on VPS
2. **Docker: etip_api** — Add api-gateway to docker-compose.etip.yml (port 3001)
3. **Nginx proxy** — Route `/api/` → `etip_api:3001`
4. **Deploy + verify** — `GET https://ti.intelwatch.in/health` → 200
5. **Frontend shell** — React 18 + Vite + shadcn/ui, login page
6. **Shared packages** — shared-audit, shared-normalization, shared-enrichment

### Phase 1 Gate Check
- [ ] Prisma migrations applied
- [ ] etip_api container running
- [ ] /health → 200 at ti.intelwatch.in
- [ ] Register + login endpoints working
- [ ] Frontend shell visible
- [ ] 266 tests passing
- [ ] CI/CD deploys updated stack

---

**Version**: 4.0 · **Last Updated**: 2026-03-17
