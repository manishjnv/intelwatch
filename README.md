# IntelWatch ETIP — Enterprise Threat Intelligence Platform

[![CI/CD](https://github.com/manishjnv/intelwatch/actions/workflows/deploy.yml/badge.svg)](https://github.com/manishjnv/intelwatch/actions/workflows/deploy.yml)
![Version](https://img.shields.io/badge/version-4.0.0-00ff88)
![Phase](https://img.shields.io/badge/phase-1%20foundation-00aaff)
![Tests](https://img.shields.io/badge/tests-266%20passing-00ff88)

**Live**: https://ti.intelwatch.in

---

## What is ETIP?

An enterprise-grade threat intelligence platform combining automated ingestion, AI-powered enrichment (Claude), Neo4j graph analysis, and real-time alerting.

## Current Status

| Component | Status | Tests |
|-----------|--------|-------|
| Shared packages (types, utils, cache) | ✅ Complete | 153 |
| Auth package (JWT, RBAC, bcrypt, service JWT) | ✅ Complete | 71 |
| API Gateway (Fastify, middleware, health) | ✅ Complete | 26 |
| User Service (register, login, refresh, profile) | ✅ Complete | 16 |
| Prisma Schema (5 tables, 3 enums, 12 indexes) | ✅ Validated | — |
| Infrastructure (8 Docker containers) | ✅ Running on VPS | — |
| CI/CD (GitHub Actions → VPS) | ✅ Auto-deploy | — |
| SSL + Domain (ti.intelwatch.in) | ✅ Caddy + Let's Encrypt | — |
| DB Migrations + Docker deploy | ⬜ Next | — |
| Frontend shell (React + Vite) | ⬜ Next | — |
| **Total** | **Phase 1: 85%** | **266** |

## Monorepo Structure

```
├── apps/
│   ├── api-gateway/        # Fastify, auth/RBAC middleware (26 tests) ✅
│   ├── user-service/       # Register, login, refresh, profile (16 tests) ✅
│   └── frontend/           # React 18 + Vite (planned)
├── packages/
│   ├── shared-types/       # Zod schemas + types (55 tests) ✅
│   ├── shared-utils/       # Errors, hash, IP, dates (58 tests) ✅
│   ├── shared-cache/       # Redis client, TTLs (40 tests) ✅
│   └── shared-auth/        # JWT, RBAC, bcrypt, service JWT (71 tests) ✅
├── prisma/schema.prisma    # tenants, users, sessions, api_keys, audit_logs ✅
├── docker-compose.etip.yml # 8 infrastructure services
└── PROJECT_BRAIN.md        # Project state + roadmap
```

## API Endpoints (Phase 1)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/health` | GET | — | Health check |
| `/ready` | GET | — | Readiness probe |
| `/api/v1/auth/register` | POST | — | Create tenant + admin user |
| `/api/v1/auth/login` | POST | — | Email/password → JWT tokens |
| `/api/v1/auth/refresh` | POST | — | Rotate refresh token |
| `/api/v1/auth/logout` | POST | JWT | Invalidate session |
| `/api/v1/auth/me` | GET | JWT | Current user profile |

## Development

```bash
pnpm install
pnpm exec prisma generate --schema=prisma/schema.prisma
pnpm -r test    # 266 tests
```

## Security

- JWT access (15min) + refresh (7d) with single-use rotation and theft detection
- bcrypt cost 12 · RBAC 5 roles, 30+ perms · Service JWT 60s TTL
- PII redaction · Rate limiting · Zod validation · CORS + Helmet

## Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Foundation (infra, auth, gateway, schema) | 🟡 85% |
| 2 | Data Pipeline (ingestion, normalization, AI) | ⬜ |
| 3 | Core Intel (IOC, actors, malware, vulns) | ⬜ |
| 4 | Advanced (graph, correlation, hunting) | ⬜ |
| 5 | Platform (SIEM, SSO, MFA) | ⬜ |
| 6 | Growth (onboarding, billing) | ⬜ |
| 7 | Performance (caching, archival) | ⬜ |
| 8 | UI Polish (parallel) | ⬜ |

---

**Built with Claude** · [Architecture Details](PROJECT_BRAIN.md)
