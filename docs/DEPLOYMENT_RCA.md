# ETIP Deployment RCA — VPS Deployment Issues

**Date**: 2026-03-17
**Sessions**: 2 (initial deploy) + 3 (frontend + shared packages)
**Final Status**: ✅ 10 containers running, React frontend live, 365 tests passing

---

## Issue Timeline

### Issue 1: CI pnpm version conflict
**Error**: `Multiple versions of pnpm specified`
**Root Cause**: `pnpm/action-setup@v4` errors when both `version` param AND `package.json` `packageManager` field are set.
**Fix**: Removed `version` param from `pnpm/action-setup@v4` step.
**Commit**: `542b6a2`
**Prevention**: Never set `version` in pnpm/action-setup when `packageManager` exists in package.json.

### Issue 2: CI prisma CLI not found
**Error**: `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "prisma" not found`
**Root Cause**: `prisma` was only a devDependency of `apps/api-gateway`, not the workspace root.
**Fix**: Added `prisma` and `@prisma/client` as root devDependencies.
**Commit**: `b15b146`
**Prevention**: Any CLI tool used in root `pnpm exec` commands must be a root devDependency.

### Issue 3: CI lockfile stale
**Error**: `pnpm install --frozen-lockfile` failed — lockfile was from Session 1.
**Root Cause**: Session 2 packages were committed but lockfile was never regenerated.
**Fix**: Ran `pnpm install --no-frozen-lockfile` to regenerate `pnpm-lock.yaml`.
**Commit**: `99ad206`
**Prevention**: Always commit updated `pnpm-lock.yaml` when adding new workspace packages.

### Issue 4: Container crash — MODULE_NOT_FOUND
**Error**: `Cannot find module '@etip/shared-utils/dist/index.js'`
**Root Cause**: Dockerfile used `tsx` runtime without building TypeScript first. `dist/` directories didn't exist.
**Fix**: Changed Dockerfile to build all TypeScript packages before running. Changed CMD to `node dist/index.js`.
**Commit**: `9cf8b1a`
**Prevention**: Always build TypeScript in Docker. Never rely on tsx/ts-node in production.

### Issue 5: Unused TypeScript imports blocking tsc
**Error**: `error TS6133: 'JwtConfig' is declared but its value is never read`
**Root Cause**: Unused imports with `noUnusedLocals: true` in tsconfig.
**Fix**: Removed unused imports.
**Commit**: `9cf8b1a`
**Prevention**: Run `pnpm -r typecheck` locally before committing. CI now catches this.

### Issue 6: SSH timeout during deploy
**Error**: `dial tcp ***:22: i/o timeout`
**Root Cause**: Transient VPS network issue.
**Fix**: Set `script_stop: false` in SSH action. Retried via `workflow_dispatch`.
**Commit**: `e020a4f`
**Prevention**: Use `workflow_dispatch` to manually retry on transient failures.

### Issue 7: Prisma DB push failed — OpenSSL missing
**Error**: `Could not parse schema engine response`
**Root Cause**: Prisma's schema engine requires OpenSSL. Alpine Linux doesn't include it.
**Fix**: Added `apk add --no-cache openssl openssl-dev` to Dockerfile.
**Commit**: `4c457a8`
**Prevention**: Always install `openssl` in Alpine-based Docker images when using Prisma.

### Issue 8: workflow_dispatch skipping deploy
**Error**: Deploy job was `skipped` when triggered via `workflow_dispatch`.
**Root Cause**: Deploy job had `needs: [test]` but test job skips on workflow_dispatch.
**Fix**: Changed deploy `if` to handle skipped test dependency.
**Commit**: `030354d`
**Prevention**: Use `always()` condition when a job needs to run even if dependencies are skipped.

### Issue 9: Landing page UI regression
**Error**: Futuristic landing page replaced with minimal inline HTML.
**Root Cause**: Nginx `location /` block was changed from file-based serving to inline `return 200`.
**Fix**: Restored file-based serving with volume mount for `landing.html`.
**Commit**: `48e288d`
**Prevention**: Landing page is ALWAYS file-based. NEVER use inline HTML in nginx config.
**NOTE**: As of Session 3, the landing page is superseded by the React frontend. `location /` now proxies to `etip_frontend:80`.

---

## Session 3 Issues (Frontend + Shared Packages Deploy)

### Issue 10: docker-compose — etip_frontend service missing, bad dependency
**Error**: `service "etip_api" depends on undefined service "etip_frontend": invalid compose project`
**Root Cause**: Python `str.replace()` was used to modify `docker-compose.etip.yml`. The target `depends_on` pattern appeared in multiple service blocks (both `etip_api` and `etip_nginx`). `str.replace` matched **all** occurrences, so `etip_frontend` was added as a dependency of `etip_api` (wrong) instead of `etip_nginx` (correct). Additionally, the `etip_frontend` service definition block was never inserted because the insertion point was miscalculated.
**Fix**: Rewrote `docker-compose.etip.yml` from scratch for the three affected services. Validated with `yaml.safe_load()` before committing.
**Commit**: `dd8e5b4`
**Prevention**:
- **RULE**: Never use `str.replace()` on YAML files where the target pattern appears in multiple locations. Use a YAML parser or rewrite the section entirely.
- Always validate compose files with `docker compose config --services` or `yaml.safe_load()` before committing.
- Dependency graph: `etip_api → [postgres, redis]`, `etip_nginx → [api, frontend]`, `etip_frontend → []`.

### Issue 11: API crash — MODULE_NOT_FOUND after adding frontend to workspace
**Error**: `Error: Cannot find module '@etip/shared-utils'` — `etip_api` container exits with code 1, enters restart loop.
**Root Cause**: When `apps/frontend/` was added to the pnpm workspace, `pnpm install` regenerated `pnpm-lock.yaml` to include frontend dependencies. However, the API `Dockerfile` did not COPY `apps/frontend/package.json` in the deps stage. This caused `pnpm install --frozen-lockfile` to fail inside Docker (lockfile references a workspace package whose `package.json` doesn't exist). The fallback `--no-frozen-lockfile` resolved dependencies differently, breaking workspace symlinks for `@etip/shared-utils`.
**Fix**: Added `COPY apps/frontend/package.json apps/frontend/` to the API Dockerfile deps stage.
**Commit**: `1853aff`
**Prevention**:
- **RULE**: When adding a new workspace package, ALWAYS add its `package.json` to the API Dockerfile COPY lines. The deps stage must mirror the complete `pnpm-workspace.yaml` membership.
- Test Docker build locally before pushing: `docker build -t etip-test .`

### Issue 12: 502 Bad Gateway — race condition in docker compose up
**Error**: `https://ti.intelwatch.in/` returned HTTP 502. Nginx couldn't connect to backend containers.
**Root Cause**: `docker compose up -d` starts all services simultaneously. `etip_nginx` started before `etip_api` and `etip_frontend` were healthy. Nginx upstream resolution failed because backends hadn't bound to their ports yet. Caddy network reconnection also happened before nginx was operational.
**Fix**: Rewrote deploy script with sequential startup: (1) postgres + redis, wait 10s, (2) API, wait for `/health` (12 retries × 10s), (3) frontend, wait 5s, (4) nginx, (5) Caddy reconnect, (6) remaining services.
**Commit**: `160ec6b`
**Prevention**:
- **RULE**: Never use `docker compose up -d` to start ALL services at once. Start infrastructure first, then app services, then reverse proxy last.
- Add explicit health-check polling in the deploy script (don't rely on `sleep` alone).
- Startup order: `postgres + redis → API (wait healthy) → frontend → nginx → Caddy reconnect → remaining`.

---


### Issue 15: Vite build silently failed — shared-ui imported @tanstack/react-query across package boundary
**Error**: Live site bundle unchanged after two deploys. `docker compose build etip_frontend` exit code 1 was silently swallowed by `| tail -20` pipe in deploy.yml. Vite output: `Rollup failed to resolve import "@tanstack/react-query" from packages/shared-ui/src/components/TopStatsBar.tsx` (and GlobalSearch.tsx).
**Root Cause**: `TopStatsBar` and `GlobalSearch` in `packages/shared-ui` imported `useQuery` from `@tanstack/react-query`. That package is not in `shared-ui`'s own `package.json`. When Vite resolves the `@etip/shared-ui` path alias, Rollup treats cross-package-boundary imports as unresolvable and errors. The build failure was invisible because `docker compose build | tail -20` in deploy.yml caused bash to ignore the non-zero exit code (pipe breaks pipefail).
**Fix**:
1. Removed `@tanstack/react-query` from all `packages/shared-ui` components. `TopStatsBar` now accepts stats as props (`TopStatsBarProps` interface). `GlobalSearch` now accepts `results` and `onQueryChange` as props.
2. `DashboardLayout` (in `apps/frontend`) now owns both `useQuery` calls and passes data down to the presentational components.
3. Removed `| tail -20` pipe from deploy.yml build steps so Docker build failures fail the deploy correctly.
**Commit**: fix: move @tanstack/react-query out of shared-ui into DashboardLayout
**Prevention**:
- **RULE**: `packages/shared-ui` must be pure presentational — zero data fetching, zero API calls. Only `lucide-react`, `framer-motion`, `@floating-ui/react`, `clsx`, `tailwind-merge` are allowed deps.
- **RULE**: Never pipe `docker compose build` output to `tail` or any filter. Build failures must propagate.
- Test `vite build` locally before every push that touches `packages/shared-ui`.

---

## Deployment Checklist (Updated for Session 3)

```
Pre-Push:
- [ ] All tests pass (pnpm -r test) — currently 365 tests
- [ ] TypeScript compiles (pnpm -r typecheck)
- [ ] pnpm-lock.yaml up to date (pnpm install)
- [ ] Dockerfile builds (docker build -t test .)
- [ ] Dockerfile.frontend builds (docker build -f Dockerfile.frontend -t test-fe .)
- [ ] docker-compose validates (docker compose config --services)
- [ ] All workspace package.json files listed in Dockerfile COPY
- [ ] No hardcoded secrets

Post-Deploy Verification:
- [ ] curl https://ti.intelwatch.in/health → 200 (API)
- [ ] curl https://ti.intelwatch.in/login → React HTML (contains "vite", "module")
- [ ] Register + Login + Dashboard flow works
- [ ] All 10 containers healthy (docker compose ps)
```

## Network Architecture (Updated Session 3)

```
Internet → Caddy (ti-platform-caddy-1, ports 80/443)
  ├── intelwatch.in     → ti-platform-* containers (NEVER TOUCH)
  └── ti.intelwatch.in  → etip_nginx:80
        ├── /health, /ready     → etip_api:3001
        ├── /api/v1/*           → etip_api:3001
        ├── /ws/                → etip_api:3001 (upgrade)
        └── /                   → etip_frontend:80 (React SPA)

Deploy startup order:
  1. etip_postgres + etip_redis (wait healthy)
  2. etip_api (wait for /health 200)
  3. etip_frontend (wait 5s)
  4. etip_nginx (start + reconnect to Caddy)
  5. etip_elasticsearch, etip_neo4j, etip_minio, etip_prometheus, etip_grafana

⚠️ After every etip_nginx recreate:
  docker network connect ti-platform_default etip_nginx
  docker restart ti-platform-caddy-1
```

---

### Issue 13: Frontend container built without `packages/shared-ui/` — stale image served
**Error**: Live site shows old landing page with no CTA buttons; DashboardPage imports fail silently.
**Root Cause**: `Dockerfile.frontend` only copied `apps/frontend/` but never `packages/shared-ui/`.
Vite alias `'@etip/shared-ui' → '../../packages/shared-ui/src'` pointed to a path that didn't
exist in the Docker build context. The live container ran a stale pre-shared-ui image.
**Fix**: Added `COPY packages/shared-ui/package.json packages/shared-ui/` before `pnpm install`,
and `COPY packages/shared-ui/ packages/shared-ui/` before `vite build`.
**Commit**: fix: copy shared-ui into frontend Docker build context — ref DEPLOYMENT_RCA.md
**Prevention**:
- RULE: When a frontend Vite alias points into packages/*, that package MUST be COPY'd in Dockerfile.frontend.
- Mirror Issue 11 rule: every workspace member referenced by vite aliases must appear in Dockerfile.frontend.

### Issue 14: Radar rings rendered at top-left corner instead of center
**Error**: Radar rings (4 pulsing concentric circles) appeared at top-left of the landing page.
**Root Cause**: In landing.html the `.radar-container` was a flex child of body (flex centered).
In React `.lp-radar` uses `position: absolute` inside a fixed root with no explicit left/top.
An absolute element without explicit positioning defaults to its static flow position (top-left).
**Fix**: Added `left: 50%; top: 50%; transform: translate(-50%, -50%)` to `.lp-radar`.
**Commit**: fix: center radar rings in React LandingPage — ref DEPLOYMENT_RCA.md
**Prevention**: When porting HTML flex-centered layouts to React, verify that absolutely positioned
elements don't rely on implicit flex centering — add explicit centering if they use position:absolute.
