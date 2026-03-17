# PROJECT BRAIN — ETIP v4.0 Enterprise Threat Intelligence Platform

**Last Updated**: 2026-03-17
**Current Phase**: 1 (Foundation) — IN PROGRESS
**Skill System**: v3 (26 numbered skill files)
**Status**: Docker ✅ · Shared Packages ✅ (153 tests) · Auth+Gateway+UserService ✅ (113 tests) · Prisma ✅ · **API Deployed to VPS** ✅ · DB Tables Created ✅ · 17/17 VPS prod tests ✅ · CI/CD Live ✅ · **Total: 266 unit tests + 17 production tests**

---

## SESSION START TEMPLATE

```
Read E:\code\IntelWatch\PROJECT_BRAIN.md via filesystem.
Read E:\code\IntelWatch\docker-compose.etip.yml via filesystem.
Load from project knowledge: 00-ARCHITECTURE-ROADMAP.md, 00-MASTER.md, [relevant module skill]
Task: [describe task here]. Begin pre-task ritual per 00-CLAUDE-INSTRUCTIONS.md.
```

---

## PROJECT OVERVIEW

**IntelWatch ETIP v4.0** — enterprise threat intelligence platform with automated ingestion, AI enrichment, Neo4j graph, real-time alerting.

- **Live URL**: https://ti.intelwatch.in
- **Repo**: https://github.com/manishjnv/intelwatch
- **VPS**: 72.61.227.64 (Ubuntu 24.04, KVM2)
- **Deploy path**: `/opt/intelwatch/`

---

## INFRASTRUCTURE

### Deployment Architecture
```
Internet → Caddy (ti-platform-caddy-1, ports 80/443)
  ├── intelwatch.in     → ti-platform-* containers (NEVER TOUCH)
  └── ti.intelwatch.in  → etip_nginx:80 (via ti-platform_default network)
        ├── /health, /ready     → etip_api:3001
        ├── /api/v1/auth/*      → etip_api:3001
        └── /                   → landing page
```

### ⚠️ CRITICAL: After every etip_nginx recreate:
```bash
docker network connect ti-platform_default etip_nginx
docker restart ti-platform-caddy-1
```

### VPS Containers (9 total, all healthy)

| Container | Image | Port | Status |
|-----------|-------|------|--------|
| etip_api | etip-etip_api (custom) | 3001 | ✅ Healthy |
| etip_postgres | postgres:16-alpine | 5433 | ✅ Healthy |
| etip_redis | redis:7-alpine | 6380 | ✅ Healthy |
| etip_elasticsearch | elasticsearch:8.15.0 | 9201 | ✅ Healthy |
| etip_neo4j | neo4j:5-community | 7475/7688 | ✅ Healthy |
| etip_minio | minio/minio:latest | 9001/9002 | ✅ Healthy |
| etip_prometheus | prom/prometheus:v2.53.0 | 9190 | ✅ Healthy |
| etip_grafana | grafana/grafana:11.1.0 | 3101 | ✅ Healthy |
| etip_nginx | nginx:1.27-alpine | 8080 | ✅ Running |

---

## MODULE REGISTRY

| # | Module | Status | Path | Tests |
|---|--------|--------|------|-------|
| — | api-gateway | ✅ Deployed | `/apps/api-gateway` | 26 |
| 16 | user-service | ✅ Deployed | `/apps/user-service` | 16 |
| — | shared-auth | ✅ Complete | `/packages/shared-auth` | 71 |
| — | shared-types | ✅ Complete | `/packages/shared-types` | 55 |
| — | shared-utils | ✅ Complete | `/packages/shared-utils` | 58 |
| — | shared-cache | ✅ Complete | `/packages/shared-cache` | 40 |
| — | prisma schema | ✅ Applied to VPS | `/prisma/schema.prisma` | — |
| 04-22 | Remaining modules | Planned | Phase 2-8 | — |
| 20 | frontend | Planned | `/apps/frontend` | — |

---

## Phase 1 — Foundation — 🟡 95% complete

| Task | Status | Notes |
|------|--------|-------|
| Docker Compose (9 services) | ✅ | PG, Redis, ES, Neo4j, MinIO, Prometheus, Grafana, Nginx, API |
| Shared packages (types, utils, cache) | ✅ | 153 tests |
| Shared packages (auth) | ✅ | 71 tests. JWT, RBAC, bcrypt, service JWT |
| API Gateway | ✅ | 26 tests. Fastify, CORS, Helmet, rate-limit, auth/RBAC middleware |
| User service | ✅ | 16 tests. Register, login, refresh, logout, profile |
| Prisma schema | ✅ | 5 tables, 3 enums. Applied via `prisma db push` |
| Dockerfile + build pipeline | ✅ | Multi-stage: install → build TS → production (node) |
| Nginx proxy to API | ✅ | /health, /ready, /api/* → etip_api:3001 |
| CI/CD (test → deploy) | ✅ | 266 tests in CI, auto-deploy + prisma push + Caddy reconnect |
| VPS production verified | ✅ | 17/17 prod tests |
| Pino logging + PII redaction | ✅ | Structured JSON, secrets redacted |
| **Frontend shell** | ⬜ | React 18 + Vite + shadcn/ui, login page |

---

## PRISMA SCHEMA (SOURCE OF TRUTH — Applied to VPS)

| Table | Key Fields |
|-------|-----------|
| `tenants` | id, name, slug (unique), plan, maxUsers, maxIOCs, aiCredits, active |
| `users` | id, tenantId (FK), email (unique per tenant), role, authProvider, passwordHash |
| `sessions` | id, userId (FK), refreshTokenHash, ipAddress, expiresAt, revokedAt |
| `api_keys` | id, tenantId, userId, name (unique per tenant), prefix, keyHash, scopes[] |
| `audit_logs` | id, tenantId, userId, action, entityType, entityId, changes (immutable) |

---

## SECURITY FEATURES

| Feature | Location |
|---------|----------|
| JWT access (15min) + refresh (7d) with rotation | shared-auth, user-service |
| Token theft detection (revoke all) | user-service |
| bcrypt cost 12, RBAC 5 roles 30+ perms | shared-auth |
| Service JWT (60s TTL), PII redaction | shared-auth, api-gateway |
| Rate limiting (100/min), Zod validation | api-gateway |
| CORS + Helmet | api-gateway |

---

## DEPLOYMENT RCA (Session 2)

See `docs/DEPLOYMENT_RCA.md` — 8 issues resolved:
1. pnpm version conflict (packageManager vs action param)
2. prisma CLI not at workspace root
3. Stale lockfile
4. MODULE_NOT_FOUND (no TS build in Docker)
5. Unused imports blocking tsc strict
6. SSH timeout (transient)
7. OpenSSL missing for Prisma on Alpine
8. workflow_dispatch skipping deploy

**Key Docker rule**: Alpine + Prisma needs `apk add openssl`. Always `pnpm -r build` before `node dist/`.

---

## CHANGE LOG

| Date | Entry |
|------|-------|
| 2026-03-15 | v3 Migration: 26 skill files, docker-compose, folder structure. |
| 2026-03-17 | Session 1: shared-types (55), shared-utils (58), shared-cache (40). 153 tests. |
| 2026-03-17 | VPS Infra: 8 containers, Caddy proxy, SSL, landing page, CI/CD. |
| 2026-03-17 | Session 2 Code: shared-auth (71), api-gateway (26), user-service (16), prisma. 113 tests. |
| 2026-03-17 | Session 2 Deploy: Dockerfile, etip_api service, nginx proxy. 8 issues resolved (RCA). |
| 2026-03-17 | **VPS LIVE**: 9 containers healthy. DB tables created. 17/17 prod tests. Full auth flow verified. |

---

## NEXT ACTIONS

### Session 2 — COMPLETE ✅
All code + deploy + prod tests done.

### Next — Phase 1 Session 3
1. **Frontend shell** — React 18 + Vite + shadcn/ui, login page, empty dashboard
2. **Shared packages** — shared-audit, shared-normalization, shared-enrichment
3. **Phase 1 Gate** → Phase 2

### Phase 1 Gate Check
- [x] Prisma applied · [x] API healthy · [x] Nginx proxy · [x] /health → 200
- [x] Register → 201 · [x] Login → 200 · [x] Refresh → 200 · [x] /me → 200 · [x] Logout → 204
- [x] 266 unit tests · [x] CI/CD auto-deploys · [ ] Frontend shell

---

**Version**: 4.1 · **Last Updated**: 2026-03-17
