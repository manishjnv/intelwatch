# IntelWatch ETIP — Enterprise Threat Intelligence Platform

[![CI/CD](https://github.com/manishjnv/intelwatch/actions/workflows/deploy.yml/badge.svg)](https://github.com/manishjnv/intelwatch/actions/workflows/deploy.yml)
![Version](https://img.shields.io/badge/version-4.0.0-00ff88)
![Phase](https://img.shields.io/badge/phase-7%20started-00ff88)
![Tests](https://img.shields.io/badge/tests-4615%20passing-00ff88)

**Live API**: https://ti.intelwatch.in/health

---

## Current Status

| Component | Status | Tests |
|-----------|--------|-------|
| Shared packages (types, utils, cache, auth, audit, normalization, enrichment) | ✅ Deployed | 343 |
| API Gateway (Fastify, middleware) | ✅ Live on VPS | 45 |
| User Service (register, login, refresh) | ✅ Live on VPS | 21 |
| Ingestion Service (RSS feeds, 11 pipeline modules) | ✅ Live on VPS | 276 |
| Normalization Service (18 accuracy improvements) | ✅ Live on VPS | 139 |
| AI Enrichment Service (VT + AbuseIPDB + Haiku AI + Cost Transparency + 15 Accuracy Improvements) | ✅ Live on VPS | 253 |
| IOC Intelligence Service (CRUD, search, pivot, campaigns) | ✅ Live on VPS | 119 |
| Threat Actor Intel Service (CRUD, 15 accuracy improvements) | ✅ Live on VPS | 190 |
| Malware Intel Service (CRUD, 15 accuracy improvements) | ✅ Live on VPS | 149 |
| Vulnerability Intel Service (CRUD, 15 accuracy improvements) | ✅ Live on VPS | 119 |
| Frontend (React 18 + Vite, 16 data pages, 19 viz components, demo fallbacks all 5 entity types, Phase 6 pages, Known Gaps P1, D3 code-split) | ✅ Live on VPS | 530 |
| Threat Graph Service (Neo4j knowledge graph, 20 improvements, 32 endpoints) | 🔨 Feature-complete | 294 |
| Correlation Engine (15 improvements, AI patterns, rule templates, graph integration) | 🔨 Feature-complete (15/15) | 166 |
| Threat Hunting Service (47 endpoints, 15 improvements, hunt workspace) | 🔨 Feature-complete (15/15) | 222 |
| DRP Service (4 detection engines, 12 typosquat algos, CertStream, 36 endpoints) | 🔨 Feature-complete (15/15 + accuracy) | 310 |
| Enterprise Integration Service (SIEM, webhooks, ticketing, STIX/TAXII, 58 endpoints) | 🔨 Feature-complete (15/15) | 335 |
| User Management Service (RBAC, teams, SSO, MFA, break-glass, 32 endpoints) | 🔨 Feature-complete (5 P0) | 185 |
| Customization Service (module toggles, AI config, risk weights, 35 endpoints) | 🔨 Feature-complete (5 P0) | 159 |
| Onboarding Service (8-step wizard, connectors, health checks, 32 endpoints) | ✅ Deployed | 190 |
| Billing Service (plan management, Razorpay, usage metering, GST invoices, 28 endpoints) | ✅ Built | 149 |
| Admin Ops Service (system health, maintenance, backup/restore, tenant admin, audit, 28 endpoints) | ✅ Built | 147 |
| CI/CD (test → build → deploy) | ✅ Auto-deploy | — |
| E2E Pipeline (feed → ingest → normalize → enrich) | ✅ Verified | — |
| Elasticsearch IOC Indexing Service (BullMQ worker, full-text search, multi-tenant, 3 endpoints) | ✅ Deployed | 57 |
| Reporting Service (5 report types, BullMQ worker, cron scheduling, template engine, 20 endpoints) | ✅ Deployed | 199 |
| Infrastructure (30 Docker containers) | ✅ All healthy | — |
| **Phase 7 — ES Indexing + Reporting deployed** | **30/30 modules** | **4597** |

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

18 containers: PostgreSQL 16, Redis 7, Elasticsearch 8, Neo4j 5, MinIO, Prometheus, Grafana, Nginx, API Gateway, Ingestion, Normalization, AI Enrichment, IOC Intelligence, Threat Actor Intel, Malware Intel, Vulnerability Intel, Frontend

## Development

```bash
pnpm install
pnpm exec prisma generate --schema=prisma/schema.prisma
pnpm -r test    # 1582 tests
```

## Security

- JWT access (15min) + refresh (7d) with single-use rotation and theft detection
- bcrypt cost 12 · RBAC 5 roles, 30+ perms · Service JWT 60s TTL
- PII redaction · Rate limiting 100/min · Zod validation · CORS + Helmet

## Deployment

Push to `master` → CI runs 1582 tests → auto-deploys to VPS → prisma db push → health check.
See `docs/DEPLOYMENT_RCA.md` for deployment troubleshooting (36 resolved issues).

---

**Built with Claude** · [Project State](docs/PROJECT_STATE.md) · [Decisions](docs/DECISIONS_LOG.md) · [Deployment RCA](docs/DEPLOYMENT_RCA.md)
