# IntelWatch ETIP — Enterprise Threat Intelligence Platform

[![CI/CD](https://github.com/manishjnv/intelwatch/actions/workflows/deploy.yml/badge.svg)](https://github.com/manishjnv/intelwatch/actions/workflows/deploy.yml)
![Version](https://img.shields.io/badge/version-4.0.0-00ff88)
![Phase](https://img.shields.io/badge/phase-1%20foundation-00aaff)

**Live**: https://ti.intelwatch.in

---

## What is ETIP?

An enterprise-grade threat intelligence platform combining automated ingestion, AI-powered enrichment (Claude), Neo4j graph analysis, and real-time alerting. It consolidates feeds (STIX/TAXII, MISP, NVD, dark web, OSINT) with enterprise integrations (15+ SIEMs, case management, ticketing) and provides hunting, digital risk protection, and compliance reporting.

## Current Status

| Component | Status |
|-----------|--------|
| Shared packages (types, utils, cache) | ✅ 153 tests passing |
| Infrastructure (8 Docker containers) | ✅ Running on VPS |
| CI/CD (GitHub Actions → VPS) | ✅ Auto-deploy on merge |
| SSL + Domain (ti.intelwatch.in) | ✅ Caddy + Let's Encrypt |
| Landing page | ✅ Live |
| Auth + API Gateway | ⬜ Next |

## Tech Stack

```
Backend:    Node.js 20 · Fastify · Prisma · TypeScript (strict)
Database:   PostgreSQL 16 · Redis 7 · Elasticsearch 8 · Neo4j 5
Storage:    MinIO (S3-compatible)
AI:         Anthropic Claude (Sonnet/Haiku/Opus — configurable per module)
Queue:      BullMQ (Redis-backed)
Frontend:   React 18 · Vite · shadcn/ui · Tailwind · Framer Motion
Auth:       Google OAuth2 · Magic Code · SAML2 · OIDC · TOTP MFA · API Keys
Monitoring: Prometheus · Grafana
Deploy:     GitHub Actions → SSH → Docker Compose on VPS
```

## Architecture

```
Internet → Caddy (SSL) → etip_nginx → ETIP services
                                        ├── api-gateway (Fastify)
                                        ├── user-service
                                        ├── ingestion-service
                                        ├── normalization-service
                                        ├── enrichment-service (Claude AI)
                                        ├── ioc-service
                                        └── ... (16 microservices total)

Data stores:
  PostgreSQL (primary) · Redis (cache/queue) · Elasticsearch (search)
  Neo4j (graph) · MinIO (archival)
```

## Monorepo Structure

```
├── apps/                   # Microservices (api-gateway, user-service, etc.)
├── packages/
│   ├── shared-types/       # Zod schemas + TypeScript types (55 tests)
│   ├── shared-utils/       # Helpers: errors, hash, IP, dates (58 tests)
│   └── shared-cache/       # Redis client, TTLs, key patterns (40 tests)
├── docker/                 # Nginx, Postgres, Prometheus, Grafana configs
├── infrastructure/         # VPS setup scripts, Nginx server blocks
├── prisma/                 # Schema + migrations
├── .github/workflows/      # CI/CD pipeline
├── docker-compose.etip.yml # 8 infrastructure services
└── PROJECT_BRAIN.md        # Complete project state + roadmap
```

## Infrastructure (Docker)

| Service | Container | Port |
|---------|-----------|------|
| PostgreSQL 16 | etip_postgres | 5433 |
| Redis 7 | etip_redis | 6380 |
| Elasticsearch 8 | etip_elasticsearch | 9201 |
| Neo4j 5 | etip_neo4j | 7475/7688 |
| MinIO | etip_minio | 9001/9002 |
| Prometheus | etip_prometheus | 9190 |
| Grafana | etip_grafana | 3101 |
| Nginx | etip_nginx | 8080 |

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm -r test

# Type-check
pnpm -r typecheck

# Start infrastructure
docker compose -p etip -f docker-compose.etip.yml up -d
```

## Deployment

Merging to `master` auto-deploys to VPS via GitHub Actions. Manual triggers available:

```bash
# Manual deploy
gh workflow run deploy.yml -f action=deploy

# Check VPS status
gh workflow run deploy.yml -f action=status

# Run custom command
gh workflow run deploy.yml -f action=command -f command="docker compose -p etip ps"
```

## Roadmap (8 Phases)

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Foundation (infra, auth, API gateway) | 🟡 60% |
| 2 | Data Pipeline (ingestion, normalization, AI enrichment) | ⬜ |
| 3 | Core Intelligence (IOC, actors, malware, vulns) | ⬜ |
| 4 | Advanced Intel (graph, correlation, hunting) | ⬜ |
| 5 | Platform (SIEM integration, RBAC, SSO) | ⬜ |
| 6 | Growth (onboarding, billing, admin) | ⬜ |
| 7 | Performance (caching, archival, load testing) | ⬜ |
| 8 | UI Polish (parallel with all phases) | ⬜ |

---

**Built with Claude** · [Architecture Details](PROJECT_BRAIN.md)
