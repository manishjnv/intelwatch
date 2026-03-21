# PROJECT BRAIN — DEPRECATED

> **⚠️ DEPRECATED as of Session 13 (2026-03-21).**
> This file is no longer maintained. Use these authoritative sources instead:
>
> | What you need | Read this |
> |--------------|-----------|
> | Module statuses, phase, WIP, next tasks | `docs/PROJECT_STATE.md` |
> | Coding rules, Docker rules, constants | `CLAUDE.md` |
> | Architectural decisions | `docs/DECISIONS_LOG.md` |
> | Deployment failure patterns | `docs/DEPLOYMENT_RCA.md` |
> | Last session's changes + resume prompt | `docs/SESSION_HANDOFF.md` |
> | Session start | Run `/session-start` (reads all of the above automatically) |
>
> **Do NOT read this file for session context. It was last accurate on 2026-03-17 (Phase 1).**
> **Current state: Phase 2 COMPLETE, 851 tests, 14 containers.**

---

## HISTORICAL CONTENT BELOW (frozen — not updated)

---

## PROJECT OVERVIEW

**IntelWatch ETIP v4.0** is an enterprise-grade threat intelligence platform combining automated ingestion, AI-powered enrichment, Neo4j graph analysis, and real-time alerting.

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
        └── /                   → etip_frontend:80 (React SPA)
```

### ⚠️ CRITICAL RULES:
```bash
# Networking: etip_nginx auto-joins caddy_network (ti-platform_default) via docker-compose.
# NEVER use: docker network connect ti-platform_default etip_nginx
# After nginx recreate: only docker restart ti-platform-caddy-1 needed.

# Build: tsc -b --force tsconfig.build.json (project references, strict dependency order)
# NEVER: pnpm -r build (parallel race condition breaks cross-package .d.ts resolution)

# Healthchecks: ALWAYS use 127.0.0.1 (not localhost) in Alpine containers (IPv6 issue)
# Frontend: wget -q -O /dev/null http://127.0.0.1/

# Frontend: React SPA served from etip_frontend container via nginx
# All SPA routes handled by try_files → /index.html inside etip_frontend
```

### VPS Containers (10 total, all healthy)

| Container | Image | Port | Status |
|-----------|-------|------|--------|
| etip_api | etip-etip_api (custom) | 3001 | ✅ Healthy |
| etip_frontend | etip-etip_frontend (custom) | 80 | ✅ Healthy |
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
| — | api-gateway | ✅ Deployed | `/apps/api-gateway` | ~45 |
| 16 | user-service | ✅ Deployed | `/apps/user-service` | 21 |
| — | frontend | ✅ Deployed | `/apps/frontend` | — |
| — | shared-auth | ✅ Complete | `/packages/shared-auth` | 71 |
| — | shared-types | ✅ Complete | `/packages/shared-types` | 55 |
| — | shared-utils | ✅ Complete | `/packages/shared-utils` | 58 |
| — | shared-cache | ✅ Complete | `/packages/shared-cache` | 40 |
| — | shared-audit | ✅ Complete | `/packages/shared-audit` | ~22 |
| — | shared-normalization | ✅ Complete | `/packages/shared-normalization` | ~30 |
| — | shared-enrichment | ✅ Complete | `/packages/shared-enrichment` | ~30 |
| — | shared-ui | ✅ Scaffolded | `/packages/shared-ui` | — |
| — | prisma schema | ✅ Applied to VPS | `/prisma/schema.prisma` | — |
| 04-22 | Remaining modules | Planned | Phase 2-8 | — |

---

## Phase 1 — Foundation — ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| Docker Compose (10 services) | ✅ | PG, Redis, ES, Neo4j, MinIO, Prometheus, Grafana, Nginx, API, Frontend |
| Shared packages (types, utils, cache) | ✅ | 153 tests |
| Shared packages (auth) | ✅ | 71 tests. JWT, RBAC, bcrypt, service JWT |
| Shared packages (audit) | ✅ | ~22 tests. SOC2AuditWriter, AuditEntrySchema, mandatory actions |
| Shared packages (normalization) | ✅ | ~30 tests. IOC detection, normalization, confidence scoring |
| Shared packages (enrichment) | ✅ | ~30 tests. LLM output validation, prompt injection sanitization |
| API Gateway | ✅ | ~45 tests. Fastify, CORS, Helmet, rate-limit, auth/RBAC, integration tests |
| User service | ✅ | 21 tests. Register, login, refresh (5 tests), logout, profile |
| refreshTokens() tests | ✅ | 5 tests: happy, theft detection, expired, replay, inactive |
| Integration tests | ✅ | 12 tests: full auth flow, duplicates, credentials, validation |
| CI/CD (test + typecheck + lint + audit) | ✅ | Full pipeline with security audit |
| Rate limit / CORS / config tests | ✅ | 7 tests: 429, CORS headers, config validation |
| Prisma schema | ✅ | 5 tables, 3 enums. Applied via `prisma db push` |
| Dockerfile + build pipeline | ✅ | Multi-stage: install → build TS → production (node) |
| Frontend shell | ✅ | React 18 + Vite + Tailwind + shadcn-style + Zustand + TanStack Query |
| Frontend pages | ✅ | Login, Register, Dashboard (with 12 feature cards), 404 |
| Frontend auth context | ✅ | JWT storage, auto-refresh, protected routes, Zustand store |
| Nginx proxy to API + Frontend | ✅ | /api/* → etip_api, / → etip_frontend |
| Landing page → Frontend transition | ✅ | SPA now serves as entry point |
| VPS production verified | ✅ | 17/17 prod tests (pre-frontend) |
| Pino logging + PII redaction | ✅ | Structured JSON, secrets redacted |

---

## Phase 2 — Data Pipeline — ⬜ PLANNED

| Task | Module | Priority |
|------|--------|----------|
| Ingestion service | 04-ingestion | P0 |
| Normalization engine | 05-normalization | P0 |
| AI Enrichment (Claude + VT + AbuseIPDB) | 06-ai-enrichment | P0 |
| BullMQ pipeline wiring | 21-module-integration | P0 |

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
| Token theft detection (revoke all) — TESTED | user-service |
| Refresh token replay detection — TESTED | user-service |
| bcrypt cost 12, RBAC 5 roles 30+ perms | shared-auth |
| Service JWT (60s TTL), PII redaction | shared-auth, api-gateway |
| Rate limiting (100/min) — TESTED | api-gateway |
| CORS + Helmet — TESTED | api-gateway |
| Config validation — TESTED | api-gateway |
| Prompt injection defense | shared-enrichment (sanitizeLLMInput) |
| LLM output validation | shared-enrichment (validateLLMOutput) |
| SOC 2 immutable audit writer | shared-audit (SOC2AuditWriter) |

---

## FRONTEND ARCHITECTURE

```
apps/frontend/
├── src/
│   ├── main.tsx              — React 18 entry, QueryClient, BrowserRouter
│   ├── App.tsx               — Route config (login, register, dashboard, 404)
│   ├── globals.css           — Tailwind + CSS vars (dark mode colors, 3D effects)
│   ├── vite-env.d.ts         — Vite types
│   ├── components/
│   │   ├── layout/
│   │   │   ├── DashboardLayout.tsx  — Sidebar nav + top stats bar
│   │   │   └── ProtectedRoute.tsx   — Auth guard → redirect to /login
│   │   └── ui/               — shadcn-style components (Phase 2)
│   ├── pages/
│   │   ├── LoginPage.tsx     — Email + password form
│   │   ├── RegisterPage.tsx  — Full registration with auto-slug
│   │   ├── DashboardPage.tsx — 12 feature cards, mini stats, phase indicator
│   │   └── NotFoundPage.tsx  — 404 with navigation
│   ├── stores/
│   │   └── auth-store.ts     — Zustand: tokens, user, tenant, localStorage persist
│   ├── hooks/
│   │   └── use-auth.ts       — TanStack Query mutations for login/register/logout
│   └── lib/
│       ├── api.ts            — Fetch wrapper with auto-refresh and error handling
│       └── utils.ts          — cn() helper (clsx + tailwind-merge)
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

---

## DEPLOYMENT RCA (24 issues resolved)

See `docs/DEPLOYMENT_RCA.md` for full root cause analysis.

**Session 1-3** (Issues #1-#16): pnpm conflicts, Prisma/Alpine, SSH timeouts, MODULE_NOT_FOUND, frontend Docker chain.

**Session 4** (Issues #17-#24 — Pipeline Optimization):
- #17: CI pnpm version param conflict (recurring #1)
- #18: Cross-package .d.ts missing — build step before typecheck
- #19: pnpm parallel build race condition → tsc -b fix
- #20: Docker buildx incompatible with pnpm symlinks
- #21: workflow_dispatch deploy skip (recurring #8) → always()
- #22: tsc -b --force required in Docker
- #23: Lean production stage breaks pnpm symlinks → reverted
- #24: Alpine localhost → ::1 IPv6 → use 127.0.0.1

---

## CHANGE LOG

| Date | Entry |
|------|-------|
| 2026-03-15 | v3 Migration: 26 skill files, docker-compose, folder structure. |
| 2026-03-17 | Session 1: shared-types (55), shared-utils (58), shared-cache (40). 153 tests. |
| 2026-03-17 | VPS Infra: 8 containers, Caddy proxy, SSL, landing page, CI/CD. |
| 2026-03-17 | Session 2 Code: shared-auth (71), api-gateway (26), user-service (16), prisma. 113 tests. |
| 2026-03-17 | Session 2 Deploy: Dockerfile, etip_api, nginx proxy, CI/CD. 9 issues resolved (RCA). |
| 2026-03-17 | **VPS LIVE**: 9 containers healthy. 17/17 prod tests. Full auth flow verified. |
| 2026-03-17 | **Landing page fix**: Restored futuristic design. File-based serving rule established. |
| 2026-03-17 | **Session 3 Block 1**: 5 refreshTokens tests, 12 integration tests, CI typecheck+lint+audit, 7 gateway tests (rate limit, CORS, config). |
| 2026-03-17 | **Session 3 Block 2**: shared-audit (~22 tests), shared-normalization (~30 tests), shared-enrichment (~30 tests). |
| 2026-03-17 | **Session 3 Block 3**: Frontend shell (React 18 + Vite + Tailwind). Login, Register, Dashboard with 12 feature cards. Auth context with JWT auto-refresh. Zustand + TanStack Query. |
| 2026-03-17 | **Session 3 Deploy**: etip_frontend container added. Nginx routes / → frontend SPA. 10 containers total. |
| 2026-03-18 | **UI Design Lock**: shared-ui package scaffolded (7 locked components). UI_DESIGN_LOCK.md created. 00-CLAUDE-INSTRUCTIONS.md updated with [DESIGN-APPROVED] gate. |
| 2026-03-18 | **Session 4: Docker/CI/CD Pipeline Optimization** — 10 recommendations implemented. node:20-slim (not Alpine), strict --frozen-lockfile, tsc -b with project references (composite:true), caddy_network external, removed --no-cache, Makefile, Docker build validation in CI, frontend healthcheck (wget 127.0.0.1), force-recreate on deploy, always() for workflow_dispatch. 8 new RCA issues (#17-#24). CI fully green: test → build → typecheck → lint → audit → Docker API → Docker Frontend. VPS production verified: /health 200, /login 200. |
| 2026-03-18 | **UI Gap Audit + Fix**: Full shared-ui audit confirmed all 9 gaps from the gap analysis were already resolved (TopStatsBar, GlobalSearch, shadow/TLP tokens, IntelCard, PageStatsBar, popover primitive, TooltipHelp, InlineHelp, live indicator). Fixed one genuine remaining gap: TopStatsBar was `hidden lg:block` violating the design lock's "always-visible" contract. Fixed to `overflow-x-auto shrink-0 scrollbar-hide` wrapper. Added `.scrollbar-hide` utility to globals.css. |
| 2026-03-18 | **Frontend Deploy Fix (6-issue chain)**: Diagnosed and fixed a chain of 6 deployment failures (Issues 11-16 in DEPLOYMENT_RCA.md). Root causes: (1) shared-ui never committed to remote, (2) pnpm-lock.yaml missing new deps, (3) Vite build failing silently due to @tanstack/react-query in shared-ui across package boundary, (4) Docker layer cache reusing broken images, (5) API Dockerfile missing shared-ui/frontend COPY entries causing shared-auth dist to not build, (6) `pnpm -r build` building apps/frontend inside API Docker context. All fixed. SSH access established via vps-cmd.yml GitHub Actions workflow (Claude sandbox blocks raw TCP:22). Final VPS state: etip_api healthy, all 10 containers running, 17/17 smoke tests passing. |

---

## NEXT ACTIONS

### Session 3 — COMPLETE ✅
All audit gaps closed. 3 shared packages implemented. Frontend shell deployed.

### UI Design Lock System — ✅ COMPLETE

All approved futuristic UI components are now protected from accidental modification.

| Asset | Location | Purpose |
|-------|----------|---------|
| `UI_DESIGN_LOCK.md` | `skills/UI_DESIGN_LOCK.md` | Frozen specs + [DESIGN-APPROVED] gate |
| Lock rule | `skills/00-CLAUDE-INSTRUCTIONS.md` | Claude refuses changes without [DESIGN-APPROVED] |
| `shared-ui` package | `packages/shared-ui/` | All locked components live here |
| Color tokens | `packages/shared-ui/src/tokens/colors.ts` | Single source of truth for all CSS vars |
| EntityChip | `packages/shared-ui/src/components/EntityChip.tsx` | 15 types, frozen colors + 6 hover actions |
| InvestigationPanel | `packages/shared-ui/src/components/InvestigationPanel.tsx` | 480px, z-50, 8 action buttons |
| TopStatsBar | `packages/shared-ui/src/components/TopStatsBar.tsx` | h-9, live indicator rightmost |
| IntelCard | `packages/shared-ui/src/components/IntelCard.tsx` | 3D rotateX:2 rotateY:-2 scale:1.01 |
| SeverityBadge | `packages/shared-ui/src/components/SeverityBadge.tsx` | Safety-critical severity colour map |
| GlobalSearch | `packages/shared-ui/src/components/GlobalSearch.tsx` | Cmd+K, frozen category + online fallback order |
| PageStatsBar | `packages/shared-ui/src/components/PageStatsBar.tsx` | py-2 compact stats pattern |

**The boundary rule:** `packages/shared-ui/` = LOCKED · `apps/frontend/src/` = FREE

**To override any locked component:** include `[DESIGN-APPROVED]` in your Claude prompt.

---

### Next — Phase 2 (Data Pipeline)
1. **Ingestion service** — STIX, MISP, CSV, JSON, REST feed ingestion
2. **Normalization engine** — Transform all incoming data to unified schema
3. **AI Enrichment** — Claude + VirusTotal + AbuseIPDB correlation
4. **BullMQ pipeline** — normalize → enrich → store → index → graph

### Phase 1 Gate Check — PASSED ✅
- [x] Prisma applied · [x] API healthy · [x] Nginx proxy · [x] /health → 200
- [x] Register → 201 · [x] Login → 200 · [x] Refresh → 200 · [x] /me → 200 · [x] Logout → 204
- [x] ~372 unit tests (266 original + ~106 new)
- [x] Integration tests exist (12 tests)
- [x] CI runs typecheck + lint + audit
- [x] Frontend shell deployed (Login, Register, Dashboard)
- [x] refreshTokens fully tested (5 tests)
- [x] Rate limit, CORS, config validation tested
- [x] shared-audit, shared-normalization, shared-enrichment implemented
- [x] Phase 1 EXIT → READY FOR PHASE 2

---

## PIPELINE ARCHITECTURE (Deployed Session 4)

```
CI Pipeline (deploy.yml):
  checkout (depth:1) → pnpm setup (auto version) → install --frozen-lockfile
  → prisma generate → test → tsc -b --force → typecheck → lint → audit
  → docker build API → docker build Frontend
  → SSH deploy: build images → infra up → force-recreate apps → health checks

Docker Build (tsc -b project references):
  tsconfig.build.json orchestrates:
    shared-types → shared-utils → shared-cache
    shared-auth (→types,utils) → shared-audit,norm,enrichment (→utils)
    user-service (→types,utils,auth) → api-gateway (→types,utils,auth,user-service)

Makefile:
  make pre-push = test + typecheck + lint + docker-test (MANDATORY before push)
  make docker-test = build + start + health poll + status
```

---

**Version**: 6.0 · **Last Updated**: 2026-03-18
