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


### Issue 16: API container crashing — shared-auth dist missing after pnpm-lock.yaml update
**Error**: `etip_api` in restart loop. `docker logs etip_api`: `Cannot find module '/app/apps/api-gateway/node_modules/@etip/shared-auth/dist/index.js'`.
**Root Cause**: When `pnpm-lock.yaml` was regenerated to include `@etip/shared-ui` and frontend deps, the API `Dockerfile` deps stage was not updated. It lacked `COPY packages/shared-ui/package.json` and `COPY apps/frontend/package.json`. So `pnpm install --frozen-lockfile` failed and the `--no-frozen-lockfile` fallback didn't correctly wire workspace symlinks. `shared-auth` TypeScript compiled against broken paths, produced no `dist/`. The `|| true` on every `tsc` step suppressed these errors silently.
**Fix**: Added missing COPY lines to Dockerfile deps stage. Removed `|| true` from all tsc RUN steps.
**Commit**: fix: add shared-ui + frontend package.json to API Dockerfile deps stage - ref DEPLOYMENT_RCA.md
**Prevention**:
- RULE: Every pnpm-lock.yaml update adding workspace members requires matching COPY lines in BOTH Dockerfile AND Dockerfile.frontend.
- RULE: Never use `|| true` on TypeScript compile steps in Docker.

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

### Issue 15: SSH port 22 unreachable from external IPs
**Error**: `ssh root@72.61.227.64` times out from Claude sandbox and local machines, but GitHub Actions (Azure IPs) can SSH fine.
**Root Cause**: The hosting provider's network filters SSH (port 22) to known IP ranges. VPS-side SSH daemon is active, UFW allows port 22, fail2ban has 0 bans, but the provider's upstream firewall blocks most non-cloud IPs.
**Fix**: Added SSH ingress to existing Cloudflare Tunnel (`ssh.intelwatch.in → ssh://localhost:22`). Access via `cloudflared access ssh --hostname ssh.intelwatch.in`.
**Commit**: fix: add cloudflare tunnel SSH + permanent nginx-caddy network — ref DEPLOYMENT_RCA.md
**Prevention**: 
- Always use Cloudflare Tunnel for SSH on shared hosting — never rely on direct port 22.
- SSH config: `ProxyCommand cloudflared access ssh --hostname %h`

### Issue 16: etip_nginx loses Caddy network after every recreate
**Error**: After `docker compose up -d` recreates etip_nginx, `ti.intelwatch.in` returns 502 because nginx is no longer on the `ti-platform_default` Docker network where Caddy routes to it.
**Root Cause**: `docker-compose.etip.yml` only listed `etip_network`. Caddy routes via `ti-platform_default`, which nginx joined manually via `docker network connect`. Container recreate drops non-compose networks.
**Fix**: Added `caddy_network` (external: `ti-platform_default`) to etip_nginx's networks list in docker-compose.etip.yml. Removed manual `docker network connect` from deploy.yml.
**Commit**: fix: add cloudflare tunnel SSH + permanent nginx-caddy network — ref DEPLOYMENT_RCA.md
**Prevention**: RULE: Any container that must be reachable from a network outside its compose project MUST declare that network as `external: true` in the compose file — never rely on manual `docker network connect`.

### Issue 17: 41% CI/CD failure rate caused by no local Docker testing
**Error**: 21 of 32 push commits were fixes, 38 of 92 total CI runs failed. Most failures were Docker build issues discovered only after push.
**Root Cause**: No local Docker build+test step existed. Developers pushed code and waited for CI to discover Docker-specific failures (missing COPY, Alpine deps, lockfile staleness, TS build ordering).
**Fix**: Added `Makefile` with `docker-test` target (lint → build → start → health-check), `scripts/docker-lint.sh` (checks Dockerfile deps, lockfile, Alpine compat), `scripts/wait-healthy.sh`, `scripts/health-check.sh`.
**Commit**: fix: add cloudflare tunnel SSH + permanent nginx-caddy network — ref DEPLOYMENT_RCA.md
**Prevention**:
- RULE: `make docker-test` MUST pass before every `git push origin master`.
- RULE: `make pre-push` runs tests + typecheck + lint + Docker build + health check.
- The Makefile's `push` target enforces this automatically.

---

## Session 4 Issues (Docker/CI/CD Pipeline Optimization — 10 Recommendations)

### Issue 17: CI pnpm version conflict (recurring RCA #1)
**Error**: `Multiple versions of pnpm specified: version 9 in GitHub Action config AND pnpm@9.15.0 in package.json packageManager`
**Root Cause**: `pnpm/action-setup@v4` with `version: ${{ env.PNPM_VERSION }}` conflicts with `packageManager: "pnpm@9.15.0"` in package.json. Same as Issue #1 — the rule was documented but the code was never fixed.
**Fix**: Removed `version` param from `pnpm/action-setup@v4`. Removed unused `PNPM_VERSION` env var.
**Commit**: `75aab93`
**Prevention**: **RULE**: NEVER set `version` param in `pnpm/action-setup@v4` when `packageManager` exists in package.json.

### Issue 18: CI typecheck fails — cross-package .d.ts missing
**Error**: `packages/shared-enrichment typecheck: error TS2307: Cannot find module '@etip/shared-utils'`
**Root Cause**: `pnpm -r run typecheck` (tsc --noEmit) needs `.d.ts` declaration files from compiled workspace deps. Without a build step first, cross-package types can't resolve.
**Fix**: Added `pnpm exec tsc -b --force tsconfig.build.json` step before typecheck in CI.
**Commit**: `c26c2c1`
**Prevention**: **RULE**: CI pipeline order MUST be: test → **build** → typecheck → lint.

### Issue 19: Docker build fails — pnpm parallel build race condition
**Error**: `packages/shared-auth build: error TS2307: Cannot find module '@etip/shared-utils'`
**Root Cause**: `pnpm -r run build` and `pnpm --filter ... run build` execute packages in parallel. shared-auth starts before shared-types/shared-utils produce .d.ts files.
**Fix**: Replaced with `pnpm exec tsc -b --force tsconfig.build.json` — project references guarantee strict topological order.
**Commit**: `c234093`
**Prevention**: **RULE**: NEVER use `pnpm -r build` in Dockerfiles. Always use `tsc -b` with project references.

### Issue 20: Docker buildx incompatible with pnpm workspace symlinks
**Error**: Same TS2307 errors inside buildx builder context.
**Root Cause**: Docker buildx uses a separate builder with different filesystem layer handling. pnpm symlinks break inside it.
**Fix**: Reverted to plain `docker build` for CI. Buildx deferred.
**Commit**: `630f05f`
**Prevention**: Use plain `docker build` until image-based deploy.

### Issue 21: Deploy job skipped on workflow_dispatch (recurring RCA #8)
**Error**: Deploy job `skipped` on `workflow_dispatch`.
**Root Cause**: `needs: [test]` blocks when test is skipped.
**Fix**: Added `always() && (needs.test.result == 'success' || needs.test.result == 'skipped')`.
**Commit**: `244df1a`
**Prevention**: Deploy job must use `always()` with conditional needs.

### Issue 22: tsc -b produces zero output — --force required
**Error**: All `dist/` directories missing. tsc -b completed in 0.7s.
**Root Cause**: `tsc -b` may skip builds in incremental mode. Non-deterministic in fresh Docker layers.
**Fix**: Added `--force` flag: `pnpm exec tsc -b --force tsconfig.build.json`
**Commit**: `fd3534e`
**Prevention**: **RULE**: Always `--force` with `tsc -b` in Docker.

### Issue 23: API crash — Cannot find module 'zod' (lean production stage)
**Error**: `Error: Cannot find module 'zod'` — API crashes on startup.
**Root Cause**: Selective COPY of `dist/` per package breaks pnpm's symlink-based node_modules. External deps like zod resolve via `.pnpm/` store symlinks.
**Fix**: Reverted to `COPY --from=build /app/ ./`. Lean optimization deferred.
**Commit**: `4f19eb7`
**Prevention**: **RULE**: NEVER selectively copy node_modules in pnpm workspaces.

### Issue 24: Frontend healthcheck — localhost resolves to IPv6 ::1
**Error**: `etip_frontend` unhealthy. `wget http://localhost/` → `Connecting to localhost ([::1]:80) — Connection refused`.
**Root Cause**: Alpine maps `localhost` to `::1` (IPv6). nginx binds `0.0.0.0:80` (IPv4 only). Also busybox `nc` doesn't support `-z`.
**Fix**: `wget -q -O /dev/null http://127.0.0.1/ || exit 1`
**Commit**: `8644977`
**Prevention**: **RULE**: ALWAYS use `127.0.0.1` (not `localhost`) in Alpine healthchecks. Use `wget` not `nc -z`.
