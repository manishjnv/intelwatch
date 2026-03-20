# IntelWatch ETIP — Enterprise Threat Intelligence Platform

[![CI/CD](https://github.com/manishjnv/intelwatch/actions/workflows/deploy.yml/badge.svg)](https://github.com/manishjnv/intelwatch/actions/workflows/deploy.yml)
![Version](https://img.shields.io/badge/version-4.0.0-00ff88)
![Phase](https://img.shields.io/badge/phase-1%20foundation-00aaff)
![Tests](https://img.shields.io/badge/tests-266%20unit%20+%2017%20prod-00ff88)

**Live API**: https://ti.intelwatch.in/health

---

## Current Status

| Component | Status | Tests |
|-----------|--------|-------|
| Shared packages (types, utils, cache) | ✅ Deployed | 153 |
| Auth package (JWT, RBAC, bcrypt) | ✅ Deployed | 71 |
| API Gateway (Fastify, middleware) | ✅ **Live on VPS** | 26 |
| User Service (register, login, refresh) | ✅ **Live on VPS** | 16 |
| Prisma Schema (5 tables applied) | ✅ **Applied to DB** | — |
| Infrastructure (9 Docker containers) | ✅ All healthy | — |
| CI/CD (test → deploy) | ✅ Auto-deploy | — |
| SSL (ti.intelwatch.in) | ✅ Caddy + LE | — |
| Production tests (VPS) | ✅ 17/17 passing | 17 |
| Frontend shell | ⬜ Next | — |
| **Phase 1 Progress** | **95%** | **266 + 17** |

## Live API Endpoints

```bash
# Health
curl https://ti.intelwatch.in/health
# → {"status":"ok","service":"api-gateway","version":"1.0.0","uptime":...}

# Register
curl -X POST https://ti.intelwatch.in/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourSecurePass12!","displayName":"Your Name","tenantName":"Your Org","tenantSlug":"your-org"}'

# Login
curl -X POST https://ti.intelwatch.in/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourSecurePass12!"}'

# Profile (with token from login)
curl -H "Authorization: Bearer <accessToken>" https://ti.intelwatch.in/api/v1/auth/me
```

## Architecture

```
Internet → Caddy (SSL) → etip_nginx → etip_api:3001 (Fastify)
                                         ↕
                                   etip_postgres:5432
                                   etip_redis:6379
```

9 containers: PostgreSQL 16, Redis 7, Elasticsearch 8, Neo4j 5, MinIO, Prometheus, Grafana, Nginx, **API Gateway**

## Development

```bash
pnpm install
pnpm exec prisma generate --schema=prisma/schema.prisma
pnpm -r test    # 266 tests
```

## Security

- JWT access (15min) + refresh (7d) with single-use rotation and theft detection
- bcrypt cost 12 · RBAC 5 roles, 30+ perms · Service JWT 60s TTL
- PII redaction · Rate limiting 100/min · Zod validation · CORS + Helmet

## Deployment

Push to `master` → CI runs 266 tests → auto-deploys to VPS → prisma db push → health check.
See `docs/DEPLOYMENT_RCA.md` for deployment troubleshooting guide.

---

**Built with Claude** · [Architecture Details](PROJECT_BRAIN.md) · [Deployment RCA](docs/DEPLOYMENT_RCA.md)
