# SKILL: DevOps, CI/CD & Deployment
**ID:** 03-devops | **Version:** 5.0
**Updated:** 2026-03-18

---

## VPS INFRASTRUCTURE

- **Provider**: Hostinger KVM2 (Ubuntu 24.04)
- **IP**: 72.61.227.64
- **RAM**: 8GB (5.2GB used by 10 containers)
- **Disk**: 96GB (26% used)
- **CPUs**: 2
- **SSH**: Port 22 filtered by provider for most IPs. Use GitHub Actions `vps-cmd.yml` or Cloudflare Tunnel.
- **Deploy path**: `/opt/intelwatch/`

### Two sites on same VPS
```
intelwatch.in      → ti-platform-* containers (NEVER TOUCH)
ti.intelwatch.in   → etip_* containers (our project)
```
**Rule**: NEVER modify non-etip_ containers, configs, or files.

---

## DOCKER ARCHITECTURE

### Image Rules (MANDATORY)
| Service | Base Image | Why |
|---------|-----------|-----|
| etip_api (deps+build) | `node:20-slim` | Debian glibc — Prisma, bcrypt, native deps. **NEVER Alpine** (RCA #7). |
| etip_api (production) | `node:20-slim` | curl installed via `apt-get`. No corepack needed at runtime. |
| etip_frontend (build) | `node:20-slim` | Consistent with API. **NEVER Alpine** for Node stages. |
| etip_frontend (serve) | `nginx:1.27-alpine` | Static files only, no Node native deps. |
| etip_nginx | `nginx:1.27-alpine` | Reverse proxy, no Node. |
| etip_postgres | `postgres:16-alpine` | No custom build needed. |
| etip_redis | `redis:7-alpine` | No custom build needed. |

### API Dockerfile (3-stage) — ACTUAL DEPLOYED STATE
```
Stage 1 (deps):
  FROM node:20-slim
  COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.build.json
  COPY every workspace member's package.json + tsconfig.json
  RUN pnpm install --frozen-lockfile --ignore-scripts  ← NO FALLBACK

Stage 2 (build):
  COPY packages/ apps/ prisma/
  RUN pnpm exec prisma generate --schema=prisma/schema.prisma
  RUN pnpm exec tsc -b --force tsconfig.build.json  ← PROJECT REFERENCES, STRICT ORDER

Stage 3 (production):
  FROM node:20-slim
  RUN apt-get install curl
  COPY --from=build /app/ ./  ← Full copy (lean selective copy deferred — RCA #23)
  CMD ["node", "apps/api-gateway/dist/index.js"]
```

### Frontend Dockerfile (2-stage) — ACTUAL DEPLOYED STATE
```
Stage 1 (build):
  FROM node:20-slim
  COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json
  COPY apps/frontend/package.json + packages/shared-ui/package.json
  RUN pnpm install --frozen-lockfile  ← NO FALLBACK
  COPY apps/frontend/ + packages/shared-ui/
  RUN cd apps/frontend && npx vite build

Stage 2 (serve):
  FROM nginx:1.27-alpine
  COPY --from=build dist → /usr/share/nginx/html
  Healthcheck: wget -q -O /dev/null http://127.0.0.1/
```

### TypeScript Build Mode (tsc -b) — CRITICAL
All backend packages use `composite: true` in tsconfig.json with explicit `references`.
Root `tsconfig.build.json` orchestrates the build.

**Why tsc -b, not pnpm -r build:**
- `pnpm -r run build` executes packages in parallel → race condition where shared-auth starts before shared-types/shared-utils produce .d.ts → TS2307 errors (RCA #19-#21)
- `tsc -b` guarantees strict topological order via project references
- `--force` flag required in Docker to ensure full rebuild (RCA #22)

**tsconfig.build.json references (must match dependency graph):**
```
shared-types (no deps)
shared-utils (no deps)
shared-cache (no deps)
shared-auth → [shared-types, shared-utils]
shared-audit → [shared-utils]
shared-normalization → [shared-utils]
shared-enrichment → [shared-utils]
user-service → [shared-types, shared-utils, shared-auth]
api-gateway → [shared-types, shared-utils, shared-auth, user-service]
```

**When adding a new package:**
1. Add `"composite": true` to its tsconfig.json
2. Add `"references"` to tsconfig.json for any workspace deps
3. Add the package to `tsconfig.build.json` references array
4. Add its `package.json + tsconfig.json` COPY line to `Dockerfile` deps stage
5. If it produces `dist/` needed at runtime, it's automatically included via `COPY --from=build /app/ ./`

### Build Rules (MANDATORY — 24 RCA issues documented)
- **tsc -b --force tsconfig.build.json**: Deterministic dependency-order compilation in Docker
- **NEVER** `pnpm -r build` in Dockerfiles (parallel execution causes race conditions)
- **ALWAYS** `--frozen-lockfile` — **NO fallback** to `--no-frozen-lockfile` (RCA #11, #16)
- **ALWAYS** include every workspace member's `package.json` in Dockerfile COPY stage
- **ALWAYS** copy `tsconfig.base.json` AND `tsconfig.build.json` in deps stage
- **ALWAYS** copy `tsconfig.base.json` in frontend Dockerfile (shared-ui extends it — RCA #24)
- **ALWAYS** `prisma generate` in Docker build stage (not at runtime)
- pnpm version locked to **9.15.0** via `packageManager` field — **NEVER** set `version` in CI `pnpm/action-setup@v4` (RCA #1, #17)
- Docker layer caching is safe — **do NOT use --no-cache** (root causes of stale cache were fixed: #2 frozen-lockfile, #15 piped output)

### Healthchecks (ACTUAL DEPLOYED)
| Container | Method | Why |
|-----------|--------|-----|
| etip_api (Dockerfile) | `curl -sf http://localhost:3001/health` | curl installed in slim |
| etip_api (compose) | `curl -sf http://localhost:3001/health` | Same as Dockerfile |
| etip_frontend (compose) | `wget -q -O /dev/null http://127.0.0.1/` | **Must use 127.0.0.1** — Alpine resolves `localhost` to `::1` IPv6, nginx only binds IPv4 (RCA #24) |
| etip_nginx (compose) | `nginx -t` | Config validation |
| etip_prometheus | `wget --spider -q http://localhost:9090/-/healthy` | wget available in prom image |
| etip_grafana | `wget --spider -q http://localhost:3000/api/health` | wget available in grafana image |

### Networking (ACTUAL DEPLOYED)
```yaml
# docker-compose.etip.yml
networks:
  etip_network:        # Internal: all etip containers
    name: etip_network
  caddy_network:       # External: Caddy → etip_nginx
    name: ti-platform_default
    external: true

# etip_nginx is on BOTH networks:
etip_nginx:
  networks:
    - etip_network
    - caddy_network    # Auto-joins ti-platform_default on compose up
```
- **NEVER** use manual `docker network connect` — compose handles it
- After nginx recreate: only `docker restart ti-platform-caddy-1` needed (may be removable — verify Caddyfile uses hostname not IP)

### .dockerignore
Must exclude: `node_modules`, `dist`, `.git`, `.github`, `*.md` (except README), `docker`, `infrastructure`, `skills`, `module-cards`, `docs`, `scripts`, `config`, `.env`, `.env.*`, tests, `__tests__`.

---

## CI/CD PIPELINE (ACTUAL DEPLOYED)

### GitHub Actions: `.github/workflows/deploy.yml`
```
Trigger: push to master, PR to master, workflow_dispatch

Job 1 — Test (runs on PR and push, skipped on workflow_dispatch):
  checkout (fetch-depth: 1)
  → pnpm/action-setup@v4 (reads version from packageManager, NEVER set version param)
  → setup-node (cache: pnpm)
  → pnpm install --frozen-lockfile
  → prisma generate
  → pnpm -r test
  → pnpm exec tsc -b --force tsconfig.build.json  ← BUILDS BEFORE TYPECHECK
  → pnpm --filter '!@etip/frontend' -r run typecheck
  → pnpm -r run lint
  → pnpm audit (continue-on-error)
  → docker build -f Dockerfile (validates API Docker image)
  → docker build -f Dockerfile.frontend (validates Frontend Docker image)

Job 2 — Deploy (runs on push to master or workflow_dispatch):
  Condition: always() && (test.success || test.skipped)  ← RCA #8
  SSH to VPS → git pull →
    docker compose build etip_api (with layer caching, no --no-cache) →
    docker compose build etip_frontend →
    docker compose up -d (infra services) →
    docker compose up -d --force-recreate etip_api etip_frontend etip_nginx →
    prisma migrate deploy → caddy restart → health checks
```

**Key CI rules:**
- **Build step before typecheck**: `tsc -b` produces `.d.ts` files cross-package imports need (RCA #18)
- **Frontend excluded from typecheck**: Vite path aliases not resolvable by `tsc --noEmit`
- **Docker build validation in CI**: Both Dockerfiles validated before deploy reaches VPS (catches RCA #11-16 class errors)
- **always() on deploy condition**: Without it, `workflow_dispatch` skips deploy because `test` is skipped (RCA #8, #21)
- **Force-recreate app containers**: Old containers may keep stale healthchecks even after image rebuild (RCA #23)

### VPS Command Runner: `.github/workflows/vps-cmd.yml`
```
Trigger: workflow_dispatch with `cmd` input
Runs arbitrary shell commands on VPS via SSH
Use for: diagnostics, container restarts, config checks
```

### ESLint
- ESLint **8** (classic config, `.eslintrc.json` at root)
- `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` v7
- Root config: TS recommended, no-unused-vars (args with _ ignored), no-console (warn/error allowed)

---

## LOCAL DEVELOPMENT WORKFLOW

### Makefile Targets (DEPLOYED — `Makefile` at repo root)
```bash
make install        # pnpm install + prisma generate
make test           # pnpm -r test
make typecheck      # tsc --noEmit (excl frontend)
make lint           # eslint (all packages)
make check          # test + typecheck + lint
make build          # Docker build API + frontend images
make docker-test    # build + start + wait-healthy (60s poll) + status
make pre-push       # check + docker-test (FULL gate — MANDATORY)
make push           # pre-push + git commit + push
make verify         # Production smoke test (ti.intelwatch.in)
make logs-errors    # Error logs from all containers (last 3 min)
make status         # docker compose ps
make stats          # Container CPU/memory usage
make clean          # Remove dist + caches
```

### Pre-Push Gate (MANDATORY)
```bash
make docker-test    # at minimum before every push
make pre-push       # ideally (runs test + typecheck + lint + docker-test)
```

### Post-Deploy Checklist (MANDATORY — run after CI confirms containers healthy)
After every successful deploy (GitHub Actions green + VPS health checks pass):
1. **Update `docs/ETIP_Project_Stats.html`** — session #, test counts, container count, module statuses, next-action section. This is the live dashboard — stale = wrong stakeholder view.
2. **Update `docs/PROJECT_STATE.md`** — Deployment Log table row + container status rows
3. **Update `docs/DEPLOYMENT_RCA.md`** — append "No new issues" row or new RCA entry
4. **Commit docs**: `git add docs/ && git commit -m "docs: post-deploy stats update — session N"`

**Rule:** NEVER close a deploy session without completing this checklist.
**Trigger:** CI green + `docker compose ps` all healthy → run checklist immediately.

---

## ENV VARS

All env vars prefixed with `TI_`. Required vars in `.env`:
```
TI_POSTGRES_PASSWORD    TI_REDIS_PASSWORD       TI_ELASTICSEARCH_PASSWORD
TI_NEO4J_PASSWORD       TI_MINIO_SECRET_KEY     TI_JWT_SECRET
TI_SERVICE_JWT_SECRET   TI_GRAFANA_PASSWORD
```

Optional with defaults:
```
TI_NODE_ENV=production  TI_API_PORT=3001        TI_API_HOST=0.0.0.0
TI_JWT_ISSUER=intelwatch-etip                   TI_JWT_ACCESS_EXPIRY=900
TI_JWT_REFRESH_EXPIRY=604800                    TI_CORS_ORIGINS=https://ti.intelwatch.in
TI_RATE_LIMIT_WINDOW_MS=60000                   TI_RATE_LIMIT_MAX_REQUESTS=100
TI_LOG_LEVEL=info
```

---

## MONITORING

- **Prometheus**: `etip_prometheus:9190` (internal, 30d retention)
- **Grafana**: `etip_grafana:3101` (internal, provisioned dashboards)
- **Health endpoint**: `GET /health` on API gateway (required, returns JSON with status + uptime)
- **Production smoke test**: `curl -sf https://ti.intelwatch.in/health`

---

## DEPLOYMENT RCA

All past deployment issues documented in `docs/DEPLOYMENT_RCA.md` (24 issues).
Before every push, check if your change matches a known issue pattern.
If a new issue occurs: fix first, then add RCA entry with:
`{ title, exact_error, root_cause, fix, prevention, commit }`

---

## DEFERRED OPTIMIZATIONS

These were planned but deferred due to compatibility issues:

| Optimization | Why Deferred | When to Revisit |
|---|---|---|
| **Lean production stage** (selective COPY dist/ per package) | pnpm workspace symlinks break when node_modules is partially copied — external deps like zod, fastify can't resolve (RCA #23) | When migrating to `pnpm deploy` for production pruning, or image-based deploys |
| **Docker Buildx + GHA layer cache** | Buildx uses separate builder with different filesystem behavior — pnpm workspace symlinks don't resolve correctly inside buildx (RCA #20) | When moving to image-based deploy (CI builds → GHCR → VPS pulls) |
| **Scoped --filter @etip/api-gateway... builds** | Same workspace symlink resolution issues as buildx — tsc inside Docker can't find @etip/* types via --filter (RCA #19) | Resolved by using tsc -b instead — no longer needed |
| **Remove Caddy restart from deploy** | Requires verifying Caddyfile uses hostname (not IP) for etip_nginx | Next session — check `docker exec ti-platform-caddy-1 cat /etc/caddy/Caddyfile` |
| **Image-based deploy** (CI → GHCR → VPS pull) | Bigger architectural change, deploy to separate task | After current pipeline is stable for 2-3 deploys |
