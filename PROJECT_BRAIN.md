# PROJECT BRAIN — ETIP v4.0 Enterprise Threat Intelligence Platform

**Last Updated**: 2026-03-18
**Current Phase**: 1 (Foundation) — COMPLETE ✅
**Skill System**: v3 (26 numbered skill files)
**Status**: Docker ✅ · 9 shared packages ✅ · Auth+Gateway+UserService ✅ · Prisma ✅ · Frontend Shell ✅ · CI/CD ✅ · ESLint ✅ · **~372 unit tests + 17 prod tests**

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
- **SSH**: port 22 filtered by hosting provider — use GitHub Actions `vps-cmd.yml` or Cloudflare Tunnel (pending DNS setup for ssh.intelwatch.in)

---

## ⚠️ DOCKER & BUILD RULES (MANDATORY — learned from 17 RCA issues)

These rules are **non-negotiable**. Breaking any of them will cause CI/deploy failures.

### Image Rules
- **ALWAYS** use `node:20-slim` for Node.js images — **NEVER Alpine** (musl breaks Prisma, bcrypt, native deps)
- **ALWAYS** use `nginx:1.27-alpine` only for static file serving (no Node.js in it)

### Build Rules
- **ALWAYS** use scoped builds: `pnpm --filter @etip/api-gateway... run build` — **NEVER** `pnpm -r build` in Dockerfiles
- **ALWAYS** use `--frozen-lockfile` — **NEVER** fallback to `--no-frozen-lockfile`
- **ALWAYS** run `prisma generate` inside the Docker build stage
- **ALWAYS** include every workspace member's `package.json` in Dockerfile COPY, even if unused (pnpm lockfile resolution requires it)
- **ALWAYS** copy only `dist/` + `package.json` to the production stage — never the full workspace

### pnpm Version
- Locked to **9.15.0** everywhere: `package.json` (packageManager), `corepack prepare`, CI workflow
- **NEVER** use `>=9.0.0` or any range — exact version only

### Healthchecks
- API (node:20-slim): use `node -e "fetch(...)"` — no curl/wget needed
- Frontend (nginx:alpine): use `printf ... | nc -w2 localhost 80` — no wget available
- **NEVER** use `wget` in Alpine images

### Networking
- `etip_nginx` is permanently on both `etip_network` and `caddy_network` (external: `ti-platform_default`) via docker-compose
- After nginx recreate: only `docker restart ti-platform-caddy-1` needed — **NO** manual `docker network connect`

### CI Pipeline Order
```
pnpm install --frozen-lockfile → prisma generate → test → build (excl frontend) → typecheck (excl frontend) → lint
```
- Frontend excluded from typecheck because Vite path aliases (`@etip/shared-ui/components/...`) are not resolvable by `tsc --noEmit`

### Pre-Push Gate
```bash
make docker-test   # builds images + starts containers + health checks
make pre-push      # tests + typecheck + lint + Docker build + health
make push           # runs pre-push then commits and pushes
```

---

## INFRASTRUCTURE

### Deployment Architecture
```
Internet → Caddy (ti-platform-caddy-1, ports 80/443)
  ├── intelwatch.in     → ti-platform-* containers (NEVER TOUCH)
  └── ti.intelwatch.in  → etip_nginx:80 (via caddy_network / ti-platform_default)
        ├── /health, /ready     → etip_api:3001
        ├── /api/v1/*           → etip_api:3001
        └── /                   → etip_frontend:80 (React SPA)
```

### VPS Containers (10 total)

| Container | Image | Port | Notes |
|-----------|-------|------|-------|
| etip_api | node:20-slim (custom) | 3001 | Fastify API gateway |
| etip_frontend | nginx:alpine (custom) | 80 | React SPA |
| etip_postgres | postgres:16-alpine | 5433 | Primary DB |
| etip_redis | redis:7-alpine | 6380 | Cache + sessions |
| etip_elasticsearch | elasticsearch:8.15.0 | 9201 | Search index |
| etip_neo4j | neo4j:5-community | 7475/7688 | Graph DB |
| etip_minio | minio/minio:latest | 9001/9002 | Object storage |
| etip_prometheus | prom/prometheus:v2.53.0 | 9190 | Metrics |
| etip_grafana | grafana/grafana:11.1.0 | 3101 | Dashboards |
| etip_nginx | nginx:1.27-alpine | 8080 | Reverse proxy |

---

## MODULE REGISTRY

| # | Module | Status | Path | Tests |
|---|--------|--------|------|-------|
| — | api-gateway | ✅ Deployed | `/apps/api-gateway` | ~45 |
| 16 | user-service | ✅ Deployed | `/apps/user-service` | 21 |
| — | frontend | ✅ Deployed | `/apps/frontend` | — |
| — | shared-auth | ✅ Complete | `/packages/shared-auth` | 71 |
| — | shared-types | ✅ Complete | `/packages/shared-types` | 55 |
| — | shared-utils | ✅ Complete | `/packages/shared-utils` | 58 |
| — | shared-cache | ✅ Complete | `/packages/shared-cache` | 40 |
| — | shared-audit | ✅ Complete | `/packages/shared-audit` | ~23 |
| — | shared-normalization | ✅ Complete | `/packages/shared-normalization` | ~28 |
| — | shared-enrichment | ✅ Complete | `/packages/shared-enrichment` | ~24 |
| — | shared-ui | ✅ Design-locked | `/packages/shared-ui` | — |
| — | prisma schema | ✅ Applied | `/prisma/schema.prisma` | — |
| 04-22 | Remaining modules | Planned | Phase 2-8 | — |

---

## CHANGE LOG

| Date | Entry |
|------|-------|
| 2026-03-15 | v3 Migration: 26 skill files, docker-compose, folder structure. |
| 2026-03-17 | Session 1: shared-types/utils/cache. 153 tests. |
| 2026-03-17 | Session 2: shared-auth, api-gateway, user-service, prisma. VPS live. |
| 2026-03-17 | Session 3: audit gaps, shared-audit/norm/enrichment, frontend shell. ~372 tests. |
| 2026-03-18 | UI Design Lock: shared-ui scaffold, 10 locked components. |
| 2026-03-18 | **Docker refactor**: node:20-slim, scoped --filter builds, 3-stage Dockerfile, strict frozen-lockfile, caddy_network permanent. |
| 2026-03-18 | **CI fix**: ESLint 8 + .eslintrc.json, shared-ui tsconfig, unused imports fixed. CI fully green. |
| 2026-03-18 | **Tooling**: Makefile (docker-test, pre-push), docker-lint.sh, health-check.sh, wait-healthy.sh. |

---

## NEXT ACTIONS

### Phase 1 — COMPLETE ✅
All foundation work done. ~372 tests. CI green. Production stable.

### Next — Phase 2 (Data Pipeline)
1. **Ingestion service** — STIX, MISP, CSV, JSON, REST feed ingestion
2. **Normalization engine** — Transform all incoming data to unified schema
3. **AI Enrichment** — Claude + VirusTotal + AbuseIPDB correlation
4. **BullMQ pipeline** — normalize → enrich → store → index → graph

---

**Version**: 6.0 · **Last Updated**: 2026-03-18
