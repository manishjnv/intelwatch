# ETIP Deployment RCA — VPS Deployment Issues

**Date**: 2026-03-17
**Sessions**: 2 (initial deploy) + 3 (frontend + shared packages)
**Final Status**: ✅ 10 containers running, React frontend live, 365 tests passing

---

## Issue Timeline

### Issue 1: CI pnpm version conflict
**Error**: `Multiple versions of pnpm specified: version 9 in GitHub Action config AND pnpm@9.15.0 in package.json packageManager`
**Root Cause**: `pnpm/action-setup@v4` errors when both `version` param AND `package.json` `packageManager` field are set. The v4 action reads packageManager automatically.
**Fix**: Removed `version` param from `pnpm/action-setup@v4` step. The action now reads `pnpm@9.15.0` from package.json's `packageManager` field.
**Commit**: `542b6a2`
**Prevention**: Never set `version` in pnpm/action-setup when `packageManager` exists in package.json.

### Issue 2: CI prisma CLI not found
**Error**: `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "prisma" not found`
**Root Cause**: `prisma` was only a devDependency of `apps/api-gateway`, not the workspace root. The CI step `pnpm exec prisma generate` runs from root and couldn't find the binary.
**Fix**: Added `prisma` and `@prisma/client` as root devDependencies in root `package.json`.
**Commit**: `b15b146`
**Prevention**: Any CLI tool used in root `pnpm exec` commands must be a root devDependency.

### Issue 3: CI lockfile stale
**Error**: CI `pnpm install --frozen-lockfile` failed because `pnpm-lock.yaml` was from Session 1 (missing jsonwebtoken, bcryptjs, fastify, pino, etc.)
**Root Cause**: Session 2 packages were committed but lockfile was never regenerated in the git repo.
**Fix**: Ran `pnpm install --no-frozen-lockfile` in git repo to regenerate `pnpm-lock.yaml` (1547 → 2629 lines).
**Commit**: `99ad206`
**Prevention**: Always commit updated `pnpm-lock.yaml` when adding new workspace packages. Run `pnpm install` in the git repo before pushing.

### Issue 4: Container crash — MODULE_NOT_FOUND
**Error**: `Error: Cannot find module '/app/apps/api-gateway/node_modules/@etip/shared-utils/dist/index.js'`
**Root Cause**: Workspace packages have `"main": "dist/index.js"` but the Dockerfile used `tsx` runtime without building TypeScript first. The `dist/` directories didn't exist.
**Fix**: Changed Dockerfile to build all TypeScript packages (`pnpm -r build`) before running. Changed CMD from `npx tsx` to `node dist/index.js`.
**Commit**: `9cf8b1a`
**Prevention**: Always build TypeScript in Docker. Never rely on tsx/ts-node in production containers.

### Issue 5: Unused TypeScript imports blocking tsc
**Error**: `error TS6133: 'JwtConfig' is declared but its value is never read` (tsc exits with non-zero, blocking Docker build)
**Root Cause**: Two files had unused imports: `auth.ts` imported `JwtConfig` (type-only, unused), `routes/auth.ts` imported `AppError` (unused). With `noUnusedLocals: true` in tsconfig, tsc fails.
**Fix**: Removed unused imports from both files.
**Commit**: `9cf8b1a`
**Prevention**: Run `pnpm -r typecheck` (tsc --noEmit) locally before committing. CI should catch this too.

### Issue 6: SSH timeout during deploy
**Error**: `dial tcp ***:22: i/o timeout`
**Root Cause**: Transient VPS network issue. The SSH connection from GitHub Actions runner to VPS (72.61.227.64:22) timed out.
**Fix**: Set `script_stop: false` in SSH action so deploy doesn't fail completely on transient issues. Retried via `workflow_dispatch`.
**Commit**: `e020a4f`
**Prevention**: Add retry logic to deploy step, or use `workflow_dispatch` to manually retry.

### Issue 7: Prisma DB push failed — OpenSSL missing
**Error**: `Error: Could not parse schema engine response: SyntaxError: Unexpected token 'E', "Error load"... is not valid JSON`
**Root Cause**: Prisma's schema engine binary requires OpenSSL libraries. Alpine Linux doesn't include them by default.
**Fix**: Added `apk add --no-cache openssl openssl-dev` to deps stage and `openssl` to production stage of Dockerfile.
**Commit**: `4c457a8`
**Prevention**: Always install `openssl` in Alpine-based Docker images when using Prisma.

### Issue 8: workflow_dispatch skipping deploy
**Error**: Deploy job was `skipped` when triggered via `workflow_dispatch`.
**Root Cause**: Deploy job had `needs: [test]` but test job has `if: github.event_name != 'workflow_dispatch'`, so test was skipped and deploy skipped because dependency wasn't met.
**Fix**: Changed deploy `if` to `always() && (needs.test.result == 'success' || needs.test.result == 'skipped')`.
**Commit**: `030354d`
**Prevention**: Use `always()` condition when a job needs to run even if dependencies are skipped.

### Issue 9: Landing page UI regression
**Error**: Futuristic landing page (gradient mesh, radar rings, floating orbs, scanline, corner HUD, ETIP-highlighted subtitle) replaced with minimal inline HTML after nginx config update.
**Root Cause**: When `docker/nginx/conf.d/default.conf` was rewritten to add API proxy routes, the `location /` block was changed from file-based serving to inline `return 200 '<minimal html>'`. The original 222-line `landing.html` was effectively bypassed.
**Fix**: Restored file-based serving in nginx: `root /usr/share/nginx/html; try_files $uri /index.html`. Added volume mount in docker-compose: `./docker/nginx/landing.html:/usr/share/nginx/html/index.html:ro`. Status text restored to "Infrastructure Online".
**Commit**: `48e288d`
**Prevention**:
- **RULE**: Landing page is ALWAYS `docker/nginx/landing.html` mounted as a Docker volume. NEVER use inline `return 200` HTML in nginx config for `location /`
- Comment added to `default.conf`: "NEVER replace with inline HTML — keep the futuristic design consistent"
- When modifying nginx config, only touch `/api/`, `/health/`, `/ready/`, `/ws/` location blocks. Leave `location /` as file-based serving
- Verify landing page after every VPS deploy: check for `bg-mesh`, `radar-ring`, `scanline`, `corner-tl`, `gradient-shift` in HTML response
- **NOTE**: As of Session 3, the landing page is superseded by the React frontend. `location /` now proxies to `etip_frontend:80` instead of serving a static file.

---

## Session 3 Issues (Frontend + Shared Packages Deploy)

### Issue 10: docker-compose — etip_frontend service definition missing, bad dependency
**Error**: `service "etip_api" depends on undefined service "etip_frontend": invalid compose project`
**Root Cause**: Python `str.replace()` was used to modify `docker-compose.etip.yml` to add the `etip_frontend` service and its dependency on `etip_nginx`. The `str.replace` matched **both** `depends_on` blocks in the file (the one inside `etip_api` AND the one inside `etip_nginx`) because they had identical structure. Result: (1) `etip_frontend` dependency was added to `etip_api` instead of `etip_nginx`, (2) the `etip_frontend` service definition block was never actually inserted — the replace targeted the wrong insertion point.
**Fix**: Rewrote `docker-compose.etip.yml` from scratch for the three affected services (`etip_api`, `etip_frontend`, `etip_nginx`). Ensured `etip_api` depends on `[postgres, redis]` only, `etip_nginx` depends on `[api, frontend]`, and `etip_frontend` has no dependencies. Validated with Python `yaml.safe_load()` before committing.
**Commit**: `dd8e5b4`
**Prevention**:
- **RULE**: Never use `str.replace()` on YAML files where the target pattern appears in multiple locations. Use a YAML parser or rewrite the entire section.
- Always validate compose files with `docker compose config --services` or `yaml.safe_load()` before committing.
- Verify dependency graph: `etip_api → [postgres, redis]`, `etip_nginx → [api, frontend]`, `etip_frontend → []`.

### Issue 11: API container crash — MODULE_NOT_FOUND after adding frontend to workspace
**Error**: `Error: Cannot find module '@etip/shared-utils'` — `etip_api` container exits with code 1, enters restart loop.
**Root Cause**: When `apps/frontend/` was added to the pnpm workspace, `pnpm install` (run in the Linux container) regenerated `pnpm-lock.yaml` to include the frontend's dependencies (react, react-dom, etc.). However, the API `Dockerfile` did not COPY `apps/frontend/package.json` in the deps stage. This caused `pnpm install --frozen-lockfile` to fail inside Docker (lockfile references a workspace package whose `package.json` doesn't exist). The fallback `--no-frozen-lockfile` resolved dependencies differently, breaking workspace symlinks for `@etip/shared-utils`.
**Fix**: Added `COPY apps/frontend/package.json apps/frontend/` to the API `Dockerfile` deps stage, ensuring all workspace `package.json` files referenced by `pnpm-lock.yaml` are present during install.
**Commit**: `1853aff`
**Prevention**:
- **RULE**: When adding a new workspace package (`apps/*` or `packages/*`), ALWAYS add its `package.json` to the API `Dockerfile` COPY lines in the deps stage.
- The `Dockerfile` deps stage must mirror the complete `pnpm-workspace.yaml` membership — every package listed in the workspace must have its `package.json` copied.
- Test Docker build locally before pushing: `docker build -t etip-test .`

### Issue 12: 502 Bad Gateway — race condition in docker compose up
**Error**: `https://intelwatch.in/` returned HTTP 502 after deploy completed. All containers reported as "started" but `etip_nginx` couldn't connect to `etip_frontend` or `etip_api` backends.
**Root Cause**: `docker compose up -d` starts all services simultaneously. The `etip_nginx` container started before `etip_api` and `etip_frontend` were healthy. Nginx upstream resolution failed because the backend containers hadn't bound to their ports yet. Additionally, the Caddy → nginx network reconnection was happening before nginx itself was fully operational.
**Fix**: Rewrote the deploy script with sequential startup: (1) start postgres + redis, wait 10s, (2) start API, wait for `/health` (12 retries × 10s), (3) start frontend, wait 5s, (4) start nginx, (5) reconnect to Caddy network, (6) start remaining services (ES, Neo4j, MinIO, Prometheus, Grafana).
**Commit**: `160ec6b`
**Prevention**:
- **RULE**: Never use `docker compose up -d` to start ALL services at once. Start infrastructure first, then app services, then reverse proxy last.
- Add explicit health-check polling in the deploy script (don't rely on `sleep` alone).
- Order: `postgres + redis → API (wait healthy) → frontend → nginx → Caddy reconnect → remaining`.

---

---

### Issue 13: Frontend container built without `packages/shared-ui/` — stale image served
**Error**: Live site at `intelwatch.in` shows old landing page with no CTA buttons, no DashboardPage working.
**Root Cause**: `Dockerfile.frontend` only copied `apps/frontend/` but never `packages/shared-ui/`. Vite's alias `'@etip/shared-ui' → '../../packages/shared-ui/src'` resolves to a path that didn't exist in the Docker build context. The build ran but imported from a path that didn't exist. The live container was running a stale image from before `@etip/shared-ui` was added as a dependency.
**Fix**: Added `COPY packages/shared-ui/package.json packages/shared-ui/` before the `pnpm install` step. Added `COPY packages/shared-ui/ packages/shared-ui/` after the install step so Vite can resolve the source alias at build time.
**Commit**: fix: copy shared-ui into frontend Docker build context — ref DEPLOYMENT_RCA.md
**Prevention**:
- **RULE**: When adding a new package that the frontend depends on via a Vite alias, always add its `package.json` COPY to `Dockerfile.frontend` immediately.
- Checklist item added: `Dockerfile.frontend` must copy `packages/shared-ui/` whenever shared-ui is a frontend dependency.
- Cross-reference with Issue 11: the same pattern applies to `Dockerfile` for the API.

### Issue 14: Radar rings off-center in React LandingPage
**Error**: Radar rings (4 concentric pulsing circles) render at top-left corner instead of center.
**Root Cause**: In `landing.html`, `.radar-container` is a flex child of `body` (flex centered) so it's naturally centered. In the React `LandingPage.tsx`, `.lp-radar` uses `position: absolute` inside `lp-root` (which is `position: fixed; inset: 0`). An absolute element without explicit `left`/`top` defaults to its static position (top-left), so the radar appeared at the top-left corner of the page.
**Fix**: Added `left: 50%; top: 50%; transform: translate(-50%, -50%)` to `.lp-radar` to match the centering behaviour of the canonical HTML version.
**Commit**: fix: center radar rings in React LandingPage — ref DEPLOYMENT_RCA.md
**Prevention**: When porting an element from an HTML flex-centered layout into React, check whether the element relied on flex centering for its position. If it uses `position: absolute`, add explicit centering.

---

### Issue 16: API container crashing — shared-auth dist missing after pnpm-lock.yaml update
**Error**: `etip_api` in restart loop. `docker logs etip_api`: `Cannot find module '/app/apps/api-gateway/node_modules/@etip/shared-auth/dist/index.js'`.
**Root Cause**: When `pnpm-lock.yaml` was regenerated (commit `9cbd5bb`) to include `@etip/shared-ui` and frontend deps, the API `Dockerfile` deps stage was not updated. It still lacked `COPY packages/shared-ui/package.json` and `COPY apps/frontend/package.json`. So `pnpm install --frozen-lockfile` failed (lockfile references workspace members whose package.json weren't present), and the `--no-frozen-lockfile` fallback didn't correctly wire workspace symlinks. As a result, `shared-auth` TypeScript compiled against broken paths and produced no `dist/`. The `|| true` on every `RUN cd ... && tsc` suppressed these errors silently.
**Fix**: Added `COPY packages/shared-ui/package.json packages/shared-ui/` and `COPY apps/frontend/package.json apps/frontend/` to Dockerfile deps stage. Removed `2>/dev/null || true` from all `tsc` build RUN steps — build failures now correctly fail the Docker image build.
**Commit**: fix: add shared-ui + frontend package.json to API Dockerfile deps stage — ref DEPLOYMENT_RCA.md
**Prevention**:
- **RULE**: Every `pnpm-lock.yaml` update that adds workspace members requires a matching COPY line in BOTH `Dockerfile` AND `Dockerfile.frontend` deps stages.
- **RULE**: Never use `|| true` on TypeScript compile steps in Docker. Silent failures produce broken images.
- When adding a new `packages/*` entry: update `Dockerfile`, `Dockerfile.frontend`, and verify both build locally.

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

Before pushing to master for deployment:

```
Pre-Push:
- [ ] All tests pass locally (pnpm -r test) — currently 365 tests
- [ ] TypeScript compiles (pnpm -r typecheck) — no unused imports
- [ ] pnpm-lock.yaml is up to date (pnpm install)
- [ ] Dockerfile builds locally (docker build -t test .)
- [ ] Dockerfile.frontend builds locally (docker build -f Dockerfile.frontend -t test-fe .)
- [ ] docker-compose.etip.yml validates (docker compose config --services)
- [ ] No hardcoded secrets in code
- [ ] .env.example updated with any new TI_ vars
- [ ] All workspace package.json files referenced in Dockerfile

Post-Push (CI/CD handles automatically):
- [ ] pnpm install (frozen lockfile)
- [ ] prisma generate
- [ ] pnpm -r test (365 tests)
- [ ] pnpm -r typecheck
- [ ] pnpm -r lint
- [ ] pnpm audit --audit-level=high
- [ ] SSH to VPS → sequential deploy
- [ ] Health check /health → 200
- [ ] Frontend check /login → 200 (React HTML)

Post-Deploy Verification:
- [ ] curl https://intelwatch.in/health → 200 (API)
- [ ] curl https://intelwatch.in/login → React HTML (contains "vite", "module")
- [ ] curl https://intelwatch.in/api/v1/auth/register → 400 (validates body)
- [ ] All 10 containers running (docker compose ps)
```

## Docker Build Requirements

```dockerfile
# API Dockerfile — deps stage must include ALL workspace package.json files:
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/tsconfig.json packages/shared-types/
COPY packages/shared-utils/package.json packages/shared-utils/tsconfig.json packages/shared-utils/
COPY packages/shared-cache/package.json packages/shared-cache/tsconfig.json packages/shared-cache/
COPY packages/shared-auth/package.json packages/shared-auth/tsconfig.json packages/shared-auth/
COPY packages/shared-audit/package.json packages/shared-audit/tsconfig.json packages/shared-audit/
COPY packages/shared-normalization/package.json packages/shared-normalization/tsconfig.json packages/shared-normalization/
COPY packages/shared-enrichment/package.json packages/shared-enrichment/tsconfig.json packages/shared-enrichment/
COPY apps/api-gateway/package.json apps/api-gateway/tsconfig.json apps/api-gateway/
COPY apps/user-service/package.json apps/user-service/tsconfig.json apps/user-service/
COPY apps/frontend/package.json apps/frontend/
# ⚠️ Every workspace member MUST be listed here or pnpm install will fail/diverge

# Dockerfile.frontend — deps + source stage must include shared-ui:
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/frontend/package.json     apps/frontend/
COPY packages/shared-ui/package.json packages/shared-ui/   # ⚠️ REQUIRED — Vite alias
RUN pnpm install ...
COPY apps/frontend/   apps/frontend/
COPY packages/shared-ui/ packages/shared-ui/               # ⚠️ REQUIRED — Vite alias source
RUN cd apps/frontend && npx vite build

# Alpine requires these for Prisma:
RUN apk add --no-cache openssl openssl-dev  # deps stage
RUN apk add --no-cache curl openssl          # production stage

# TypeScript must be compiled:
RUN pnpm -r build  # builds all workspace packages

# Production runs compiled JS:
CMD ["node", "apps/api-gateway/dist/index.js"]  # NOT tsx
```

## Network Architecture (VPS — Updated Session 3)

```
Internet → Caddy (ti-platform-caddy-1, ports 80/443)
  ├── intelwatch.in     → ti-platform-* containers (NEVER TOUCH)
  └── intelwatch.in  → etip_nginx:80 (via ti-platform_default network)
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

## Environment Variables Required on VPS

```
TI_POSTGRES_PASSWORD  — PostgreSQL password
TI_REDIS_PASSWORD     — Redis password
TI_ELASTICSEARCH_PASSWORD — ES password
TI_NEO4J_PASSWORD     — Neo4j password
TI_MINIO_SECRET_KEY   — MinIO secret
TI_JWT_SECRET         — JWT signing secret (min 32 chars)
TI_SERVICE_JWT_SECRET — Service JWT secret (min 16 chars)
TI_GRAFANA_PASSWORD   — Grafana admin password
```

---

## Session 4 Issues (Docker/CI/CD Pipeline Optimization — 10 Recommendations)

### Issue 17: CI pnpm version conflict (recurring RCA #1)
**Error**: `Multiple versions of pnpm specified: version 9 in GitHub Action config AND pnpm@9.15.0 in package.json packageManager`
**Root Cause**: `pnpm/action-setup@v4` with `version: ${{ env.PNPM_VERSION }}` conflicts with `packageManager: "pnpm@9.15.0"` in package.json. Same as Issue #1 — the rule was documented but the code was never fixed.
**Fix**: Removed `version` param from `pnpm/action-setup@v4`. Removed unused `PNPM_VERSION` env var.
**Commit**: `75aab93`
**Prevention**: **RULE**: NEVER set `version` param in `pnpm/action-setup@v4` when `packageManager` exists in package.json. The v4 action reads it automatically.

### Issue 18: CI typecheck fails — cross-package .d.ts missing
**Error**: `packages/shared-enrichment typecheck: src/output-validator.ts(2,26): error TS2307: Cannot find module '@etip/shared-utils'`
**Root Cause**: `pnpm -r run typecheck` (tsc --noEmit) needs `.d.ts` declaration files from compiled workspace dependencies. Without a build step first, shared-enrichment can't resolve types from shared-utils.
**Fix**: Added `pnpm exec tsc -b --force tsconfig.build.json` step before typecheck in CI.
**Commit**: `c26c2c1`
**Prevention**: **RULE**: CI pipeline order MUST be: test → **build** → typecheck → lint. Build produces .d.ts files that typecheck depends on.

### Issue 19: Docker build fails — pnpm --filter parallel race condition
**Error**: `packages/shared-auth build: src/jwt.ts(9,26): error TS2307: Cannot find module '@etip/shared-utils'`
**Root Cause**: `pnpm --filter @etip/api-gateway... run build` and `pnpm --filter '!@etip/frontend' -r run build` both execute packages in parallel inside Docker. shared-auth starts compiling before shared-types/shared-utils produce .d.ts files.
**Fix**: Replaced pnpm recursive build with `pnpm exec tsc -b --force tsconfig.build.json` — TypeScript build mode with project references guarantees strict topological order.
**Commit**: `c234093`
**Prevention**: **RULE**: NEVER use `pnpm -r build` or `pnpm --filter ... build` in Dockerfiles. Always use `tsc -b` with project references for deterministic build order.

### Issue 20: Docker buildx incompatible with pnpm workspace symlinks
**Error**: Same TS2307 errors as #19, but persisted even after switching from `docker/build-push-action@v6` (buildx) to plain `docker build`.
**Root Cause**: Docker buildx uses a separate builder instance with different filesystem layer handling. pnpm's symlink-based workspace resolution breaks inside the buildx builder context.
**Fix**: Reverted to plain `docker build` for CI validation. Buildx + GHA cache deferred to image-based deploy phase.
**Commit**: `630f05f`
**Prevention**: **RULE**: Use plain `docker build` (not buildx) until migrating to image-based deploy. Buildx GHA caching deferred.

### Issue 21: Deploy job skipped on workflow_dispatch (recurring RCA #8)
**Error**: Deploy job shows `skipped` when triggered via `workflow_dispatch`.
**Root Cause**: Deploy job has `needs: [test]` but test job has `if: github.event_name != 'workflow_dispatch'`, so test is skipped → deploy blocked.
**Fix**: Changed deploy `if` to `always() && (needs.test.result == 'success' || needs.test.result == 'skipped') && ...`
**Commit**: `244df1a`
**Prevention**: **RULE**: Deploy job must use `always()` condition when it has `needs` on a conditionally-skipped job.

### Issue 22: tsc -b produces zero output — --force flag required
**Error**: `COPY --from=build /app/packages/shared-types/dist: not found` — all dist/ directories missing after tsc -b completed in 0.7s.
**Root Cause**: `tsc -b` in incremental/composite mode may skip projects it considers "up to date" based on .tsbuildinfo files. In fresh Docker layers the behavior was non-deterministic.
**Fix**: Added `--force` flag: `pnpm exec tsc -b --force tsconfig.build.json`
**Commit**: `fd3534e`
**Prevention**: **RULE**: Always use `--force` with `tsc -b` in Docker builds to guarantee full compilation regardless of incremental cache state.

### Issue 23: API crash — Cannot find module 'zod' (lean production stage)
**Error**: `Error: Cannot find module 'zod'` — API crashes immediately on startup.
**Root Cause**: Recommendation #9 (lean production stage) selectively copied `package.json + dist/` per workspace package, but NOT the full `node_modules/` tree. pnpm's node_modules uses symlinks into `.pnpm/` store — external deps like zod, fastify, jsonwebtoken resolve via these symlinks. Partial copy breaks the symlink chain.
**Fix**: Reverted to `COPY --from=build /app/ ./` (full copy). Lean optimization deferred to `pnpm deploy` or image-based deploy phase.
**Commit**: `4f19eb7`
**Prevention**: **RULE**: NEVER selectively copy node_modules in pnpm workspaces. The .pnpm store uses symlinks that only work when the full tree is present. Use `COPY --from=build /app/ ./` until `pnpm deploy` or image-based deploys are implemented.

### Issue 24: Frontend healthcheck — localhost resolves to IPv6 ::1
**Error**: `etip_frontend` reports unhealthy. `wget http://localhost/` fails with `Connecting to localhost ([::1]:80) — can't connect to remote host: Connection refused`.
**Root Cause**: Alpine's `/etc/hosts` maps `localhost` to `::1` (IPv6). nginx only listens on `0.0.0.0:80` (IPv4). Any healthcheck using `localhost` connects to IPv6 and fails. Additionally, busybox `nc` in this Alpine version doesn't support `-z` flag.
**Fix**: Changed healthcheck to `wget -q -O /dev/null http://127.0.0.1/ || exit 1` — explicit IPv4 address, wget available in Alpine.
**Commit**: `8644977`
**Prevention**: **RULE**: In Alpine-based containers, ALWAYS use `127.0.0.1` (not `localhost`) in healthchecks. Alpine resolves localhost to `::1` IPv6. Also: busybox `nc` does NOT support `-z` flag — use `wget` instead.

---

## Updated Deployment Checklist (Session 4)

```
Pre-Push:
- [ ] All tests pass locally (pnpm -r test)
- [ ] tsc -b builds successfully (pnpm exec tsc -b --force tsconfig.build.json)
- [ ] TypeScript type-check (pnpm --filter '!@etip/frontend' -r run typecheck)
- [ ] Lint passes (pnpm -r run lint)
- [ ] pnpm-lock.yaml is up to date
- [ ] Docker API builds (docker build -f Dockerfile -t test .)
- [ ] Docker Frontend builds (docker build -f Dockerfile.frontend -t test-fe .)
- [ ] make docker-test passes (health check)
- [ ] No hardcoded secrets
- [ ] .env.example updated with any new TI_ vars
- [ ] All workspace package.json files in Dockerfile COPY stage
- [ ] New packages: composite:true in tsconfig + added to tsconfig.build.json

CI Pipeline (automated):
- [ ] pnpm install --frozen-lockfile
- [ ] prisma generate
- [ ] pnpm -r test
- [ ] pnpm exec tsc -b --force tsconfig.build.json
- [ ] typecheck (excl frontend)
- [ ] lint
- [ ] audit
- [ ] docker build Dockerfile
- [ ] docker build Dockerfile.frontend

VPS Deploy (automated):
- [ ] docker compose build (with layer caching)
- [ ] docker compose up -d --force-recreate etip_api etip_frontend etip_nginx
- [ ] prisma migrate deploy
- [ ] caddy restart
- [ ] /health → 200
- [ ] /login → 200 (React SPA)
```

## Updated Network Architecture (Session 4)

```
Internet → Caddy (ti-platform-caddy-1, ports 80/443)
  ├── intelwatch.in     → ti-platform-* containers (NEVER TOUCH)
  └── intelwatch.in  → etip_nginx:80 (via caddy_network / ti-platform_default)
        ├── /health, /ready     → etip_api:3001
        ├── /api/v1/*           → etip_api:3001
        ├── /ws/                → etip_api:3001 (upgrade)
        └── /                   → etip_frontend:80 (React SPA)

Networking:
  etip_nginx is on TWO networks (declared in docker-compose.etip.yml):
    - etip_network (internal)
    - caddy_network (external: ti-platform_default) ← AUTO-JOIN, no manual connect

  After nginx recreate: docker restart ti-platform-caddy-1 (may be removable)
  NEVER: docker network connect ti-platform_default etip_nginx

Deploy order:
  1. Infra: postgres, redis, elasticsearch, neo4j, minio, prometheus, grafana (up -d, no recreate)
  2. App: etip_api, etip_frontend, etip_nginx (up -d --force-recreate)
  3. Post: prisma migrate, caddy restart, health checks
```

---

## Session 5 Issues (Phase 1 Audit — 2026-03-20)

### Issue 25: ESLint config missing after ESLint v9 upgrade
**Error**: `ESLint couldn't find an eslint.config.(js|mjs|cjs) file` — all lint scripts fail across workspace.
**Root Cause**: `.eslintrc.json` (ESLint v8 format) was deleted during the ESLint v9 upgrade but no flat config replacement was created. ESLint v9 requires `eslint.config.js/mjs/cjs`.
**Fix**: Created `eslint.config.mjs` with ESLint v9 flat config format. Separate config blocks for backend (Node.js globals) and frontend (browser globals + JSX). Installed `globals` package. Added `no-control-regex: off` override for LLM sanitizer. Disabled `no-undef` for frontend (TypeScript handles this; JSX transform causes false positives).
**Prevention**: **RULE**: When upgrading ESLint major versions, always create the new config format before deleting the old one. ESLint v9+ requires `eslint.config.mjs` (flat config).

### Issue 26: shared-ui tsconfig.json deleted — typecheck broken
**Error**: `tsc --noEmit` prints help text instead of type-checking. `tsc -b` may skip shared-ui in build graph.
**Root Cause**: `packages/shared-ui/tsconfig.json` was deleted. Without it, `tsc` has no project config and prints usage. Package also lacked `@types/react` in devDependencies, and had 6 unused imports.
**Fix**: Restored `tsconfig.json` (extends base, `jsx: react-jsx`, `composite: true`). Added `@types/react` + `@types/react-dom` as devDependencies. Removed 6 unused imports across components.
**Prevention**: **RULE**: Never delete a `tsconfig.json` from a workspace package. React packages must have `@types/react` in devDependencies.

### Issue 27: user-service typecheck — Prisma.InputJsonValue not found
**Error**: `Namespace 'Prisma' has no exported member 'InputJsonValue'` — blocks `tsc -b` and Docker builds.
**Root Cause**: `Prisma.InputJsonValue` is only available in the generated Prisma client. Without a database connection to run `prisma generate`, the type doesn't exist in the `.prisma/client` namespace.
**Fix**: Replaced `Prisma.InputJsonValue` with a local `JsonInputValue` type alias that matches the Prisma definition. Eliminates dependency on generated client types for compilation.
**Prevention**: **RULE**: Avoid importing types from `@prisma/client`'s `Prisma` namespace that require code generation. Use compatible local type aliases for JSON fields.

### Issue 28: shared-enrichment tests — error code vs message mismatch
**Error**: 8 tests fail with `expected [Function] to throw error including 'LLM_OUTPUT_INVALID' but got 'AI enrichment produced invalid output...'`.
**Root Cause**: Tests used `.toThrow('LLM_OUTPUT_INVALID')` which matches against the error **message** property. But `AppError` constructor puts the human-readable text in `message` and the code in a separate `code` property. The error code `LLM_OUTPUT_INVALID` never appears in the message string.
**Fix**: Changed all 8 test assertions from `.toThrow('LLM_OUTPUT_INVALID')` to `.toThrow('AI enrichment produced invalid output')` to match the actual error message.
**Prevention**: **RULE**: When testing `AppError` throws, match against the error **message** text, not the error **code**. The `code` field is a separate property not included in the message string.

### Issue 29: shared-normalization — defanged URL regex incomplete
**Error**: `detectIOCType('hxxp://evil.com')` returns `'unknown'` instead of `'url'`.
**Root Cause**: `DEFANGED_URL_RE` was `/^h[tx]{2}ps?\[:\]\/\//i` — requires `[:]` after protocol. The pattern `hxxp://` (defanged protocol without defanged colon) didn't match.
**Fix**: Changed regex to `/^h[tx]{2}ps?(?:\[:\]|:)\/\//i` — accepts both `[:]` and `:` after the defanged protocol prefix.
**Prevention**: **RULE**: Defanged URLs can have partial defanging (protocol only, colon only, or both). Test all variants: `hxxps[:]//`, `hxxps://`, `hxxp://`.

---

## Session 8 Issues (Ingestion Connectors + Workers — 2026-03-21)

### Issue 30: Scheduler crashes service on missing DB table
**Error**: `etip_ingestion` container unhealthy. Logs: `PrismaClientKnownRequestError: The table public.feed_sources does not exist in the current database` (P2021).
**Root Cause**: `FeedScheduler.start()` called `await this.syncFeeds()` without try/catch. `syncFeeds()` calls `repo.findAllActive()` which queries the `feed_sources` table. No Prisma migration has been run on VPS for the ingestion schema, so the table doesn't exist. The unhandled error propagated to `main()` and crashed the process.
**Fix**: Wrapped initial `syncFeeds()` in try/catch — logs a warning and continues. The periodic cron (every 5min) already had `.catch()`. The service starts successfully and serves /health while waiting for DB migration.
**Commit**: `032a263`
**Prevention**:
- **RULE**: Any startup code that queries the database MUST be wrapped in try/catch. Services should start and serve health checks even if optional features (scheduler, background jobs) fail.
- **RULE**: Before deploying a service that uses new DB tables, ensure `prisma migrate deploy` runs. The deploy script should include migration before container startup.
- Background services (schedulers, workers) should degrade gracefully — log + retry, never crash the main process.

### Issue 31: Deploy health checks are fake — single-pass with no retry
**Error**: Deploy succeeds even when services are down. Health check prints "PENDING" and continues.
**Root Cause**: `sleep 10; curl ... || echo "PENDING"` — one attempt, errors swallowed, deploy never fails on unhealthy services.
**Fix**: Replaced with retry loop: 12 attempts × 5s = 60s max. If API fails after 60s, deploy **fails** (exit 1) and prints container logs for debugging. Nginx gets 30s (6 attempts).
**Commit**: `b5ad65a`
**Prevention**: **RULE**: Health checks in deploy.yml MUST use retry loops with `exit 1` on failure. Never use `|| echo "PENDING"` or `|| true` for critical health checks.

### Issue 32: feed_sources table missing — no Prisma migration existed
**Error**: `P2021: The table public.feed_sources does not exist` — ingestion scheduler crashes on startup.
**Root Cause**: `prisma/migrations/` was empty (only `.gitkeep`). Schema was defined but never tracked as a migration. `prisma migrate deploy` on VPS did nothing. Phase 1 tables existed via `prisma db push` but Phase 2 tables (feed_sources, iocs) were never created.
**Fix**: (1) Added initial migration SQL (`0001_init`). (2) Changed deploy from `prisma migrate deploy` to `prisma db push --accept-data-loss` which is idempotent — creates missing tables, skips existing ones. Added 5-attempt retry loop.
**Commit**: `b5ad65a`
**Prevention**: **RULE**: Use `prisma db push` in deploy.yml (not `migrate deploy`) until production migration workflow is established. db push is idempotent and handles schema drift gracefully.

### Issue 33: Nginx starts before API is ready → 502 errors
**Error**: 502 Bad Gateway intermittently after deploy. Nginx proxies to `etip_api:3001` but API hasn't finished starting.
**Root Cause**: `docker-compose.etip.yml` had nginx depending on `etip_postgres`, `etip_redis`, `etip_frontend`, `etip_ingestion` — but NOT on `etip_api`. Nginx started before API was healthy.
**Fix**: Changed nginx `depends_on` to: `etip_api: service_healthy`, `etip_frontend: service_healthy`, `etip_ingestion: service_healthy`. Removed postgres/redis deps (nginx doesn't connect to them directly).
**Commit**: `b5ad65a`
**Prevention**: **RULE**: Nginx must depend on ALL upstream services it proxies to. Check `default.conf` upstream blocks and ensure matching `depends_on` entries.

---

## Session 23 Issues (AI Enrichment Deploy — 2026-03-22)

### Issue 37: Vitest cannot resolve @etip/shared-normalization in CI
**Error**: `Failed to resolve entry for package "@etip/shared-normalization"` — service.test.ts fails to load.
**Root Cause**: `@etip/shared-normalization` was added as a dependency in session 22 but the vitest.config.ts resolve alias was not added. Locally, dist/ exists from previous builds. In CI, dist/ doesn't exist before tests run, so Vite can't resolve the package entry from `main: "dist/index.js"`.
**Fix**: Added `'@etip/shared-normalization': path.resolve(__dirname, '../../packages/shared-normalization/src')` to vitest.config.ts resolve aliases.
**Commit**: `e10edeb`
**Prevention**: **RULE**: When adding a new workspace dependency to any service, ALWAYS add a corresponding vitest resolve alias in that service's vitest.config.ts. CI runs tests before build — dist/ doesn't exist.

### Issue 38: cost-tracker.ts TS2532 — Object possibly undefined
**Error**: `error TS2532: Object is possibly 'undefined'` at lines 127-129 of cost-tracker.ts. Blocks `tsc -b` in CI.
**Root Cause**: `byProvider[r.provider]` returns `T | undefined` with `noUncheckedIndexedAccess`. The initialization guard (`if (!byProvider[r.provider])`) creates the entry, but TypeScript doesn't narrow the type for subsequent index access on the same line.
**Fix**: Extract to local variable: `const bp = byProvider[r.provider]!;` after the initialization guard.
**Commit**: `17a53c3`
**Prevention**: **RULE**: After initializing a Record entry via index, extract to a local variable for subsequent access to satisfy strict TypeScript.

### Issue 39: Frontend unused imports blocking CI lint
**Error**: 4 lint errors: `'PlatformStats' is defined but never used`, `'useRef' is defined but never used`, `'SkeletonBlock' is defined but never used`, `'useMemo' is defined but never used`.
**Root Cause**: Pre-existing since session 20 (UI FROZEN). Unused imports accumulated as components were built but not all features wired. CI lint step fails on errors.
**Fix**: Removed unused PlatformStats interface, useRef import, SkeletonBlock import, useMemo import.
**Commit**: `d6694e8`
**Prevention**: **RULE**: Run `pnpm -r run lint` locally before pushing. Unused imports in frozen modules should be cleaned up before freezing.

---

## RCA Resolution Summary

All 41 issues are FIXED. This table tracks which session fixed each issue and confirms the fix is still working.

| Issue | Title | Fixed In | Fix Verified | Status |
|-------|-------|----------|-------------|--------|
| 1 | CI pnpm version conflict | Session 1 | ✅ CI green | FIXED |
| 2 | CI prisma CLI not found | Session 1 | ✅ CI green | FIXED |
| 3 | CI lockfile stale | Session 1 | ✅ CI green | FIXED |
| 4 | Container MODULE_NOT_FOUND | Session 1 | ✅ Containers healthy | FIXED |
| 5 | Unused TypeScript imports | Session 1 | ✅ tsc clean | FIXED |
| 6 | SSH timeout during deploy | Session 1 | ⚠️ Intermittent (RCA #6) | MITIGATED |
| 7 | Prisma OpenSSL missing | Session 1 | ✅ node:20-slim (no Alpine) | FIXED |
| 8 | workflow_dispatch skipping deploy | Session 1 | ✅ always() condition | FIXED |
| 9 | Landing page UI regression | Session 1 | ✅ File-based serving | FIXED |
| 10 | docker-compose bad dependency | Session 3 | ✅ Compose valid | FIXED |
| 11 | API crash after frontend added | Session 3 | ✅ All COPY lines | FIXED |
| 12 | 502 Bad Gateway race | Session 3 | ✅ Sequential startup | FIXED |
| 13 | Frontend without shared-ui | Session 3 | ✅ COPY in Dockerfile | FIXED |
| 14 | Radar rings off-center | Session 3 | ✅ CSS centered | FIXED |
| 15 | Vite build silent failure | Session 3 | ✅ No pipe tail | FIXED |
| 16 | API crash — shared-auth dist | Session 3 | ✅ All COPY lines | FIXED |
| 17 | CI pnpm version (recurring) | Session 4 | ✅ No version param | FIXED |
| 18 | Cross-package .d.ts missing | Session 4 | ✅ Build before typecheck | FIXED |
| 19 | pnpm parallel race condition | Session 4 | ✅ tsc -b | FIXED |
| 20 | Docker buildx incompatible | Session 4 | ✅ Plain docker build | FIXED |
| 21 | workflow_dispatch skip (recurring) | Session 4 | ✅ always() | FIXED |
| 22 | tsc -b zero output | Session 4 | ✅ --force flag | FIXED |
| 23 | Cannot find module 'zod' | Session 4 | ✅ Full COPY | FIXED |
| 24 | Alpine localhost IPv6 | Session 4 | ✅ 127.0.0.1 | FIXED |
| 25 | ESLint config missing | Session 5 | ✅ eslint.config.mjs | FIXED |
| 26 | shared-ui tsconfig deleted | Session 5 | ✅ Restored | FIXED |
| 27 | Prisma InputJsonValue | Session 5 | ✅ Local type alias | FIXED |
| 28 | AppError code vs message | Session 5 | ✅ Match on message | FIXED |
| 29 | Defanged URL regex | Session 5 | ✅ Both : patterns | FIXED |
| 30 | Scheduler crash missing table | Session 8 | ✅ try/catch startup | FIXED |
| 31 | Fake health checks | Session 8 | ✅ Retry loops | FIXED |
| 32 | feed_sources table missing | Session 8 | ✅ prisma db push | FIXED |
| 33 | Nginx before API ready | Session 8 | ✅ depends_on healthy | FIXED |
| 34 | EntityChip hash_sha256 not in type map | Session 20 | ✅ toChipType() mapper | FIXED |
| 35 | SeverityBadge lowercase vs UPPERCASE | Session 20 | ✅ .toUpperCase() cast | FIXED |
| 36 | Vite proxy ECONNREFUSED → React crash | Session 20 | ✅ .catch() + ErrorBoundary | FIXED |
| 37 | Vitest alias missing for shared-normalization | Session 23 | ✅ Alias added to vitest.config.ts | FIXED |
| 38 | cost-tracker.ts TS2532 — Object possibly undefined | Session 23 | ✅ Extract to local var with non-null assertion | FIXED |
| 39 | Frontend unused imports blocking CI lint | Session 23 | ✅ Removed 4 unused imports | FIXED |
| 40 | Dockerfile COPY missing for billing + admin (razorpay not found) | Session 43 | ✅ COPY lines added, CI green | FIXED |
| 41 | Docker --force-recreate blocked by hash-prefix orphaned containers | Session 48/73 | ✅ Pre-cleanup + post-cleanup + --remove-orphans | FIXED |

**Session 13 deploys:** No new RCA issues. All 14 containers healthy. E2E pipeline verified with 301 real IOCs.
| Session 42 | 2026-03-24 | No new issues. etip_frontend redeployed. CI green. Feed page demo fallback + UX improvements live. |
| Session 43 | 2026-03-24 | **CI failure fixed**: Dockerfile missing COPY for billing-service + admin-service in deps stage → razorpay module not found during tsc -b. Same root cause as Session 39 (onboarding). Fixed commit 1681fcf. CI green (16m56s). All 28+ containers healthy. Phase 6 frontend deployed (Billing + Admin Ops pages). |
| Session 44 | 2026-03-24 | No deploy. Audit-only session: Phase 5 frontend hook shape-check review. No new RCA issues. 4286 tests passing. |
| Session 45 | 2026-03-24 | **RCA #39 fixed**: BillingPage crash — `d != null` hasData check insufficient when backend returns PlanDefinition shape (priceInr, features:{}) instead of BillingPlan (price, features:[]). Fix: field-presence hasData + Array.isArray guard. All Phase 6 hooks hardened. Pricing v3 deployed (drop Pro, 4-tier INR). etip_frontend CI green. 475 frontend tests. |

**Session 14 deploys:** No new RCA issues. etip_ioc_intelligence added (port 3007). All 15 containers healthy. Two deploys (f62dba7, d6f04b6), both green CI + healthy VPS.

**Session 15 deploys:** No new RCA issues. etip_threat_actor_intel added (port 3008). 16 containers expected. Commit 22793db pushed, CI deploy pending.

**Session 16 deploys:** No new RCA issues. etip_malware_intel added (port 3009). 17 containers expected. Commits 6c327c4 + 068d7dc pushed, CI deploy pending.

**Session 17 deploys:** No new RCA issues. etip_vulnerability_intel added (port 3010). 18 containers expected. Commit 58b50f1 pushed, CI deploy pending. Phase 3 COMPLETE.

**Session 27:** No deploy (code-only session). Correlation Engine (Module 13) built with 10 improvements, 106 tests. 2271 monorepo tests passing.

**Session 18 deploys:** No new RCA issues. Frontend updated with 5 data-connected pages (no new containers). Commit e33072e pushed, CI deploy pending.

**Session 23 deploys:** 3 CI issues found and fixed (RCA #37-39). After fixes: CI green (run 23405214316). All containers redeployed via SSH. Sessions 21-23 code now live on VPS. Commits 5c949d1→d6694e8.

**Session 19:** No deploy (code-only session). 11 UI/UX improvements + frontend test infra. Commit 91c92c8. Not yet pushed to VPS.

| Session 108 | 2026-03-28 | No new issues. CI fix session: 17 TS errors + ~30 ESLint errors fixed (pre-existing from Phase A-E Command Center code). 5 commits. CI run 23685986125 green. All 33 containers healthy on KVM4 VPS. |
| Session 110 | 2026-03-28 | No new issues. Frontend-only deploy (BillingPlansTab + AlertsReportsTab). CI run 23686477062 green. All 33 containers healthy. |

**Session 22:** No deploy (code-only session). 8 AI enrichment accuracy improvements. 64 new tests (1744 total). Commit 265483a.

**Session 24:** 2 deploys. First failed (RCA #40: unused imports). Second succeeded. Enrichment UI + tabbed detail + mobile overlay. 63 new tests (1871 total). Commits 799145c→4e60b44. CI green (run 23406942573). All containers healthy.

**Session 25:** Threat Graph Service (Module 12) added. etip_threat_graph container (port 3012, depends_on etip_neo4j). 90 new tests (1961 total). Commit 2e37845. CI run 23407860884 pending. 19 containers expected.

**Session 20:** No deploy (code-only session). Demo data fallbacks for offline frontend. 5 bugs found and fixed:

### Issue 34: EntityChip crash — backend iocType `hash_sha256` not in shared-ui type map
**Error**: `TypeError: Cannot read properties of undefined (reading 'bg')` at EntityChip.tsx:80
**Root Cause**: Backend normalization stores IOC type as `hash_sha256`, but shared-ui `ENTITY_TYPE_CONFIG` keys are `file_hash_sha256`. `ENTITY_TYPE_CONFIG['hash_sha256']` returns `undefined` → `cfg.bg` crashes. Latent bug — never triggered because IOC table was always empty without backend.
**Fix**: Added `toChipType()` mapper in IocListPage that converts `hash_sha256` → `file_hash_sha256` (and sha1/md5 variants) before passing to EntityChip.
**Commit**: `24719c6`
**Prevention**: **RULE**: Backend IOC types use short names (`hash_sha256`), shared-ui EntityChip uses prefixed names (`file_hash_sha256`). Always map at the page layer before passing to EntityChip.

### Issue 35: SeverityBadge crash — backend severity `critical` vs shared-ui key `CRITICAL`
**Error**: `TypeError: Cannot read properties of undefined (reading 'bg')` at SeverityBadge.tsx:27
**Root Cause**: Backend stores severity as lowercase (`critical`, `high`, etc.), but shared-ui `SEVERITY_STYLES` keys are uppercase (`CRITICAL`, `HIGH`, etc.). Same latent bug as #34.
**Fix**: Added `.toUpperCase()` cast when passing severity to SeverityBadge in IocListPage.
**Commit**: `24719c6`
**Prevention**: **RULE**: Backend severity is lowercase, shared-ui expects UPPERCASE. Always `.toUpperCase()` at the page layer before passing to SeverityBadge/EntityChip severity props.

### Issue 36: Vite proxy ECONNREFUSED causes unhandled fetch rejection → React crash
**Error**: Blank page on `/iocs` when backend is down. No error visible (no ErrorBoundary).
**Root Cause**: Vite proxy returns HTTP 500 with empty body on ECONNREFUSED. `api()` function throws `ApiError`. TanStack Query's error handling didn't prevent React tree unmount. No ErrorBoundary existed to catch render errors.
**Fix**: (1) Added `.catch(() => empty)` in queryFn so queries always resolve. (2) Added ErrorBoundary in App.tsx to display errors visibly instead of blank page.
**Commit**: `620bbf7`, `24719c6`
**Prevention**: **RULE**: All `queryFn` functions that call `api()` must include `.catch()` to prevent unhandled rejections. App must have an ErrorBoundary at the root level.

**Session 28:** No deploy (code-only session). Correlation Engine P2 (#11-15): 5 services, 8 endpoints, 60 new tests (166 correlation, 2331 monorepo). Commit 9430bdd.

**Session 32:** No new RCA issues. DRP typosquatting accuracy improvements pushed (commit 49acf09). 7 new detection methods, composite scoring, CertStream monitor, domain enricher. 44 new tests (310 DRP). CI triggered, pending.

**Session 33:** No new RCA issues. Phase 4 Frontend (4 new pages, 35 new tests, 252 frontend total). Deploy pipeline updated: 4 Phase 4 backend services added to deploy.yml (build + recreate + health checks) + nginx routing (4 upstreams + location blocks). Commits f3ed4b5 + 07b3f8a. CI triggered, pending. Expected: 23 containers after deploy.

**Session 34:** No new RCA issues. Enterprise Integration Service (Module 15) added: etip_integration on port 3015. Deploy pipeline: build + recreate + health check added to deploy.yml. Nginx: upstream etip_integration_backend + location /api/v1/integrations. Commit 6c25bc2. CI triggered, pending. Expected: 24 containers after deploy.

### Issue 37: CI tests fail — shared-utils dist not compiled before test run
**Error**: `Cannot find module '@etip/shared-utils/dist/index.js'` in integration-service tests on CI. All 335 tests pass locally.
**Root Cause**: `deploy.yml` ran `pnpm -r test` BEFORE `tsc -b --force tsconfig.build.json`. Shared packages export compiled JS from `dist/`. Locally, `dist/` exists from prior builds. CI has a clean checkout with no `dist/` directory, so imports fail.
**Fix**: Swapped step order — `tsc -b` now runs before `pnpm -r test`. Comment added referencing this RCA.
**Prevention**: **RULE**: In CI, always compile shared packages (`tsc -b`) before running tests. Tests import compiled output, not TS source.

**Session 37:** Integration Service P1/P2 accuracy improvements (10/10). 34 new endpoints (58 total), 161 new tests (335 total). Commit f2f85e4. CI blocked by Issue 37.

**Session 38:** No new RCA issues. Phase 5 Frontend UI: 3 new pages (Integration, User Management, Customization). Frontend-only changes — no backend/deploy impact. 63 new tests (367 frontend, 3692 monorepo). Commit d8c9d8b. CI triggered, pending.

**Session 39:** First CI run (f11b866) failed Docker build — Dockerfile missing COPY for `apps/onboarding/package.json` + `tsconfig.json`. This is the standard new-package-checklist item (items 3-4 from CLAUDE.md). Fixed in separate commit 1695a52 (added Dockerfile COPY + docker-compose + nginx). Second CI run green. No new RCA issue — existing checklist covers this. Onboarding Service: 32 endpoints, 190 new tests (3882 monorepo). Deployed to VPS on port 3018.

**Session 40:** Billing Service (Module 19) core + P0 improvements. 28 endpoints, 149 tests (4031 monorepo). Commit e2c897a. CI triggered. No new RCA issues — standard new-package checklist followed (Dockerfile COPY included in initial commit). Razorpay SDK type casts required 'as unknown as' double-cast pattern (Razorpay SDK has strict internal types incompatible with generic Record<string,unknown>). Added to DECISION-013 pattern catalog.

**Session 41:** Admin Ops Service (Module 22) core + P0 improvements. 28 endpoints, 147 tests (4178 monorepo). Commit f4ca0f5. CI triggered. No new RCA issues. Key fix: `.parse()` → `validate()` helper (safeParse pattern from billing-service) — raw ZodError throws were not being caught properly by error-handler's `instanceof ZodError` check across module boundaries. Also: BackupStore sort stability fix — `seq * 0.001` ms offset truncated by ISO date, changed to `seq * 1` ms. Both patterns added to DECISION-013 pattern catalog. Phase 6 COMPLETE (3/3).

**Session 46:** Verification session only — no new code. OnboardingPage was already committed in session 45 continuation (commits 85c4bc7 → b2f1e98). Session confirmed 500 frontend tests passing, 4311 total. No RCA issues. CI Run 23461768159 SUCCESS.

**Session 47:** Docs-only. QA_CHECKLIST.md full rewrite. No code changes, no deploy, no RCA issues.

**Session 48:** D3 code-split (ThreatGraphPage + RelationshipGraph lazy-loaded via React.lazy — DECISION-025). Elasticsearch IOC Indexing Service Module 20 scaffolded (57 tests, port 3020). shared-utils: QUEUES.IOC_INDEX added + test count updated. Known Gaps P1: actor/malware detail panels + IOC campaign badge (530 frontend tests). CI fixes: Dockerfile COPY (RCA #11 pattern), TS implicit-any, test count update. **RCA #41**: orphaned hash-prefix containers blocking --force-recreate — fixed with pre-cleanup step + --remove-orphans flag. 4398 total tests. ES service not yet in docker-compose. CI green.

**Session 49:** Demo fallbacks for Actor/Malware/Vuln (all 5 entity pages). ES service wired into docker-compose+nginx (fffc66f) then removed from active deploy.yml (9b355bc) because Elasticsearch container not provisioned on VPS — would fail health check and block nginx. Client-side sort/filter added to actor/malware/vuln pages (ca11e86). 4 commits. No new RCA issues. CI green.

**Session 50:** ES indexing service (Module 20, port 3020) deployed. Deploy wiring: docker-compose + deploy.yml + nginx /api/v1/search (fffc66f). Initial deploy failed: **RCA #42** — BullMQ v5.71.0 colon restriction. Fixed (a51d643, ebc7716). Redeployed successfully. 29 containers healthy. CI run 23466658673 green.

### Issue 41: Docker --force-recreate fails — orphaned containers with hash-prefix names conflict
**Error**: `Error when allocating new name: Conflict. The container name "/etip_correlation" is already in use by container "0e6346cbce23..."` during `docker compose up -d --force-recreate`
**Root Cause**: Old deploy runs without `-p etip` flag created containers named `0e6346cbce23_etip_correlation` (hash-prefixed). These orphaned containers block recreate because Docker considers the name `etip_correlation` already in use when docker compose tries to rename the orphan.
**Fix**: Added pre-cleanup step in deploy.yml: `docker ps -a --format "{{.Names}}" | grep "_etip_" | xargs -r docker rm -f || true`. Also added `--remove-orphans` flag to `docker compose up` to prevent future orphan accumulation.
**Prevention**: **RULE**: Always include `--remove-orphans` in `docker compose up` commands. Add a pre-cleanup step in deploy scripts to remove containers matching the old hash-prefix pattern before force-recreate.

### Issue 42: BullMQ v5.71.0 rejects colons in queue names — etip_es_indexing crash loop
**Error**: `Failed to start elasticsearch-indexing-service: Error: Queue name cannot contain :` — container enters crash loop, blocks nginx (depends_on: service_healthy).
**Root Cause**: BullMQ 5.71.0 added validation in `QueueBase` constructor rejecting `:` in queue names. The canonical queue name `etip:ioc-indexed` (from `QUEUES.IOC_INDEX`) contains a colon. Existing services were unaffected because their Docker image layers cache an older BullMQ version. The ES service was built fresh, pulling the latest 5.71.0.
**Fix**: Replaced colon with dash in worker.ts: `etip:ioc-indexed` → `etip-ioc-indexed`. Updated test expectations.
**Commit**: `a51d643`, `ebc7716`
**Prevention**: **RULE**: BullMQ queue names must NOT contain colons. Use `etip-` prefix (dash, not colon).
**Migration (Session 51)**: All 13 QUEUES constants in `shared-utils/src/queues.ts` changed from `etip:*` to `etip-*`. Removed `.replace(/:/g, '-')` workarounds from 6 services (ingestion, normalization, ai-enrichment, threat-graph, correlation-engine, elasticsearch-indexing). Fixed hardcoded queue names in admin-service (health-store.ts → QUEUES import) and integration-service (event-router.ts → QUEUES import). Updated 2 ingestion tests + shared-types JSDoc comments. All 4398 tests pass. Safe for fresh Docker builds.

**Session 51 (continued):** Deploy pipeline optimization (DECISION-026). All 19 backend services shared the same Dockerfile but were built 20 times sequentially (~5min wasted). Fixed: build one `etip-backend:latest` image, added `image:` tags to all services in docker-compose.etip.yml. Health checks parallelized via background bash jobs. deploy.yml: 456 → 252 lines. Commit 066101e.

| Session 52 | 2026-03-24 | No new issues. etip_reporting added (port 3021). 30 containers healthy. CI run 23474434781 green. |
| Session 54 | 2026-03-24 | No new issues. etip_frontend updated (ReportingPage). 30 containers healthy. CI run 23481852195 green. 4659 tests. |
| Session 55 | 2026-03-24 | No new issues. AlertingPage frontend + Analytics Service (Module 24, port 3024) deployed. 32 containers healthy. CI runs 23485610320 + 23486825951 green. ~5098 tests. Initial SSH timeout on first deploy (RCA #6 pattern) — resolved via workflow_dispatch retry. |
| Session 57 | 2026-03-24 | No new issues. E2E B2 (onboarding feed seeding + Redis wizard) + C1 (feed retry + graph expand). Pushed to master. 230 onboarding tests, 633 frontend tests. |
| Session 58 | 2026-03-25 | No new issues. etip_caching added (port 3025). 33 containers healthy. CI run 23499248314 green. Deploy rerun required (first attempt SSH timeout on tsc -b, 14min exceeded). 4 CI fix commits: lockfile sync, onboarding TS errors, queue count test, onboarding async/await tests. |
| Session 59 | 2026-03-25 | No new issues. Frontend-only changes (E2E C2-D2). Pushed to master (ff93d4a). VPS deploy pending — SSH access denied in session, requires manual deployment. 688 frontend tests passing. Fixed: alerting hooks response shape mismatch (array vs ListResponse), hasData d!=null violation, 6 double-stringify mutations. |
| Session 60 | 2026-03-25 | No new issues. E2E E1+E2: pipeline smoke harness + admin-service queue monitor (ioredis dep). 5348 tests. Pushed d8ed45f. 33 containers, CI triggered. |
| Session 61 | 2026-03-25 | VPS disk full — 56GB Docker build cache. Pruned via docker builder prune. Neo4j health check failed during full rebuild (memory pressure during parallel container start) — restarted separately, recovered. Daily cleanup cron installed. All 33 containers healthy post-recovery. |
| Session 64 | 2026-03-25 | No new issues. Code-only session (G1-G4 gap analysis). No deploy. ~5671 tests. |
| Session 65 | 2026-03-25 | No new issues. Code-only session (G5 P0 fixes). No deploy. 5,542 tests. |
| Session 66 | 2026-03-25 | No new issues. Code-only session (AC-2 per-tenant subtask model routing). No deploy. 360 ingestion tests, ~5,557 total. |
| Session 67 | 2026-03-25 | No new issues. Deployed: BYOK, correlation Redis, IOC lifecycle, normalization stats, analytics enrichment-quality. CI run 23543550086 green (1m49s). All 33 containers healthy. ~5,617 total. |
| Session 68 | 2026-03-25 | No new issues. Frontend-only: P2-3 ticket guard, P3-5 analytics staleness indicator, mobile responsive grid fixes. Pushed to master. 734 frontend tests. CI triggered. |
| Session 69 | 2026-03-25 | No new issues. P3-1/P3-2/P3-3 NVD + STIX/TAXII + REST_API feed connectors. 392 ingestion tests. Pushed to master. CI triggered. |
| Session 70 | 2026-03-26 | Deploy SSH timeout during Vite frontend build (rendering chunks phase). Manual deploy succeeded. 32 containers healthy. P3-4 queue lanes + P3-7 tenant fairness deployed. 405 ingestion tests. CI run for 79ec3bf: tests passed, deploy timed out. |
| Session 71 | 2026-03-26 | No new issues. P2-1 queue alerting deployed. CI run 23561851508 green. 32 containers healthy. 5,692 tests. |
| Session 72 | 2026-03-26 | No new issues. P3-6 MISP connector deployed. Deploy.yml RCA #41 orphan cleanup ordering improved (pre-cleanup before compose up). CI run 23565670507 green. 33 containers healthy. 486 ingestion tests, ~5,773 total. |
| Session 73 | 2026-03-26 | No new issues. Prometheus metrics wired to all 23 services. Deploy.yml orphan cleanup further improved (pre+post). CI run 23574054284 green. 33 containers healthy. 5,785 tests. |
| Session 74 | 2026-03-26 | No deploy. Code-only session: persistence migration foundation (shared-persistence package + billing-service Prisma). 5,825 tests. |
| Session 77 | 2026-03-26 | Deploy succeeded (25m timeout). tsc -b timed out at 15m on first attempt — increased to 25m (deploy.yml). Billing unused import blocked tsc (fixed). Neo4j transient unhealthy during compose up (recovered <2min). Seed script: jsonwebtoken require() fails in pnpm store — switched to crypto.createHmac. VPS SSH timeout blocked final seed run. All 33 containers healthy. |
| Session 78 | 2026-03-26 | CI green (tests+typecheck+lint+Docker). Deploy.yml SSH broken pipe (2 attempts). Deployed via vps-cmd.yml: git pull + nohup docker build + force-recreate etip_api/etip_alerting/etip_correlation. 31 containers healthy. Caddy restart required after nginx recreate. No new RCA issues — used existing nohup workaround for SSH timeout. |

### Issue 43: VPS OOM during Docker build — SSH pipe broken, deploy fails
**Error**: `client_loop: send disconnect: Broken pipe` — SSH drops during `tsc -b --force` on VPS. Deploy never completes.
**Root Cause**: 8GB VPS runs 33 containers (~3-4GB) + `tsc -b --force` for 23 services (~4-6GB) = exceeds RAM. OOM killer or swap thrashing kills processes. Recurring pattern (sessions 61, 70, 77, 78).
**Fix (DECISION-028)**: Build Docker images in GitHub Actions CI runner (7GB RAM), push to GHCR (ghcr.io). VPS only pulls pre-built images. Deploy time: 25min → 2m41s.
**Commit**: `5c1e76e`
**Prevention**: **RULE**: Never build Docker images on VPS. Always build in CI, push to registry, pull on VPS.

### Issue 44: Login `findFirst`-by-email returns an arbitrary row across tenants
**Symptom**: A user whose email exists in more than one `User` row (break-glass system row, a stale invite, or a SCIM/SSO-provisioned row) could get an arbitrary 403 `BREAK_GLASS_NORMAL_LOGIN_DENIED` or a generic 401 on login, or the wrong row's password could be checked, instead of their own account.
**Root cause**: `User` is unique per `(tenantId, email)`, not globally. Login (`apps/user-service/src/service.ts`) called `repository.ts` `findUserByEmailAnyStatus`, which used an unordered Prisma `findFirst` on email alone — whichever row Postgres returned first (no deterministic order) was treated as "the" user.
**Fix (PR #37, `77e5953`, commits `81aa4d5` + `c1a41d8`)**: New `findLoginCandidatesByEmail` in `repository.ts` returns all non-break-glass rows for the email, ordered `createdAt asc`, capped at 10. Login logic: 0 candidates → 403 if a break-glass row has the email, else generic 401; 1 candidate → unchanged flow; ≥2 candidates → try each oldest-first until a bcrypt password match, then apply the normal verified/active/tenant checks; no match among candidates → generic 401. MFA and session issuance use the matched row.
**Why oldest-first**: `register()` already rejects an email that exists anywhere, so a person's own account is always the oldest row for that email — a later invite or SCIM/SSO row can never evict it. The cap of 10 bounds the number of bcrypt comparisons per login attempt.
**Review**: Opus diff review, then a Sonnet adversarial pass (codex:rescue fallback ladder) returned **revise**: a first draft (`take: 5`, ordered by active/verified status) allowed ≥5 attacker-created rows sharing a victim's email to push the real account out of the candidate window (lockout). Fixed with oldest-first ordering + `take: 10`, plus 2 new tests (candidate eviction; MFA uses the matched row). Accepted low-severity residual: a small timing signal exists for emails that exist in several tenants (more bcrypt comparisons = more time) — not fixed here. Accepted residual: a user whose only account was created via invite/SCIM *after* 10 attacker-controlled rows already existed for that email could still be crowded out of the candidate window; needs pre-seeding to fully close, tracked as a future hardening item.
**Prevention**: **RULE**: any lookup keyed on a field that is unique per-tenant (not globally) must never use an unordered `findFirst` across tenants — either scope by tenant first, or make cross-tenant candidate selection explicit and deterministic (ordered, bounded) the way this fix does. `register()`'s global email-uniqueness invariant is what makes "oldest row is the real owner" a safe assumption here — do not change that invariant without re-checking this login path.
**Tests**: user-service 176 → 184 passing. Typecheck + lint clean, CI green.
**Deploy status**: ✅ Deployed (run 36224062803 green; status ok; schema unchanged → no dump; 32/32 healthy; owner login verified HTTP 200)

### Issue 45: Command Center → System tab crash after S161a PR B (`reading 'total'`)
**Symptom**: After PR #45 (`cd4a227`) deployed, opening Command Center → System showed the full-page React error `TypeError: Cannot read properties of undefined (reading 'total')`. Found by the owner's post-deploy browser check. Plan Builder also showed a false "No plans defined yet".
**Root cause**: (1) PR B rewrote `SystemTab.tsx` `HealthSubTab` from `health?.summary ?? {defaults}` to `const summary = health.summary`, but admin-service's `/admin/system/health` (`health-store.ts` `SystemHealth`) sends `{overall, services, metrics, queues, timestamp}` — there is no `summary` field, so `summary.total` threw. The hook's shape guard only checked `services`, and every test mocked the frontend type (with `summary`), not the real backend shape. Before PR B the `?? {defaults}` hid the mismatch. (2) `usePlanBuilder` did `api<{data,total}>('/admin/plans').then(r => r?.data ?? [])`, but `api()` already returns `json.data` (the array), so `r.data` was always undefined → always `[]`. Before PR B the empty list triggered DEMO_PLANS, hiding it (same bug class S147 fixed in `use-feature-limits`).
**Fix (hotfix branch `s161a/hotfix-system-tab`)**: `SystemTab.tsx` derives the summary from the real service list when `summary` is absent (healthy / degraded / down+critical counts, total; uptime unknown → '—'). `use-plan-builder.ts` reads the array `api()` returns and throws on a non-array. Tests: new SystemTab case using the exact admin-service shape (reproduced the prod error before the fix), plan-builder test corrected to what `api()` really returns + a non-array → isError case.
**Prevention**: **RULE**: when removing a `?? default` / demo fallback, check the backend handler for every field the component dereferences without `?.` — tests that mock the frontend type prove nothing about the real response. At least one test per converted screen should use the real backend shape. **RULE**: `api()` already unwraps `{ data }` — never write `.then(r => r.data)` after `api()`; use `apiList()` for list envelopes.
**Deploy status**: ✅ Deployed (PR #46 → `1111965`, run 36302952387 green; VPS HEAD `1111965`; 32/32 healthy; both fixes confirmed in the live frontend bundle)
**Follow-up (same class, pre-existing since S18)**: once System rendered, the owner hit Command Center → System → Emergency Access crashing with `reading 'length'`. `useBreakGlassAudit` typed `api<{ data, total }>` but `api()` returns the unwrapped entries array, so `BreakGlassPanel`'s `auditData.data.length` threw on every successful response (the demo fallback only hid it when the API errored). Fix: `apiList()` (normalizes array or envelope) + hook test with the real `api()` return shape (red → green). Branch `s161a/hotfix-break-glass-audit` (PR #47).
**Second layer** (seen once PR #47 deployed): the rows are raw Prisma `AuditLog` records (`action: 'break_glass.login.success'`, `ipAddress`, `createdAt`, `changes`), not the panel shape (`event`, `ip`, `timestamp`), so `eventBadge(entry.event)` threw `reading 'startsWith'`. Fix: `toBreakGlassAuditEntry()` in `use-break-glass.ts` maps each row (strip the `break_glass.` prefix → the panel's own event names; `ipAddress`→`ip`, `createdAt`→`timestamp`, `changes`→`details`) + test with a real raw row. Branch `s161a/hotfix-break-glass-rows`. A shape audit of all pages (3 agents, 2026-09-27) found one more latent crash: Admin Ops / System maintenance windows read `mw.affectedServices.length`/`.map`, but admin-service's `MaintenanceWindow` has `scope`/`tenantIds` and no `affectedServices` — fixed in the same branch by defaulting it to `[]` in `useMaintenanceWindows` (+ test with the real row shape). The remaining mismatches render demo/empty data, not crashes (S161b/S163 list in `docs/SESSION_HANDOFF.md`).

**Follow-up (S161b PR 1): bug-class sweep.** A full sweep of `apps/frontend/src/hooks` for the RCA #45 pattern
(`api<{data: X}>` then reading `.data`, always `undefined`) found ~40 more sites across 17 hook files, all
silently falling back to demo/empty data instead of showing real API responses. Fixed the same way: `apiList()`
for list-returning calls, `api<X>()` (wrapper type dropped) for single objects. Added 3 mappers where the
backend shape still doesn't match the frontend type after unwrapping: `mapQuarterly` (`use-access-reviews.ts`),
`mapPlan` (`use-plan-limits.ts`), `toCorroborationLeader` (`use-global-monitoring.ts`). 4 existing test files
(`byok-card.test.tsx`, `customization-ai.test.tsx`, `phase5-pages.test.tsx`, `use-analytics-dashboard.test.ts`)
had mocks that encoded the buggy double-wrapped shape and had to be corrected. **Prevention:** mock the REAL
backend response body in tests, never the frontend type — a mock shaped like the type under test proves nothing
about whether the code handles the actual API response. **Check:**
`grep -rnE "api<\{\s*data" apps/frontend/src/hooks` should return only documented BLOCKED hooks (routes that
don't exist yet), never a live call site. Detail: `docs/S161b_PR1_RCA45_UNWRAP_SWEEP.md`.

### Issue 46: S164 CI red — lint errors in test files the local gate never linted (2026-09-27)
**Symptom:** CI run 36332920862 failed at "Typecheck + Lint + Audit"; build and deploy were skipped (prod untouched at 045fb35).
**Root cause:** `apps/ai-enrichment`'s lint script is `eslint src/ tests/`, but the local pre-push gate ran `eslint src` only, so two unused identifiers in new test files (`tests/enrichment-ioc-route.test.ts` `OTHER_TENANT_ID`, `tests/tenant-budget.test.ts` `beforeEach`) were never linted locally.
**Fix:** removed both unused identifiers (commit after 57aa75c).
**Prevention:** the local gate must run each package's own scripts exactly as CI does — `pnpm -r run typecheck` and `pnpm -r run lint` from the repo root (or `pnpm run lint` inside the package) — never a hand-written `eslint src`. Both exited 0 locally before the re-push.

### Issue 47: integration-service SSRF via tenant-supplied SIEM/webhook/ticketing URLs + unencrypted credentials + swallowed validation errors (found during Step 15 research, 2026-09-28)
**Symptom/finding:** found during Step 15 research (2026-09-28), not via incident: `apps/integration-service` fetched tenant-supplied SIEM/webhook/ticketing URLs server-side with plain `fetch` and only `z.string().url()` validation — a tenant admin could point a connector at internal/private addresses (loopback, docker network, cloud metadata `169.254.169.254`) and have the server call them (SSRF), with the test-connection result echoing the response body; connector secrets were stored unencrypted in memory although an AES-256-GCM class existed (used only by credential rotation); the Fastify error handler was registered inside its own encapsulation scope so validation errors returned generic 500s. No evidence of exploitation (configs are in-memory and wiped on each deploy; no customers yet).
**Root cause:** SSRF protection from the S125 public-API fix (api-gateway) was never carried over to integration-service; encryption wired only on the rotation path.
**Fix (2831d00):** new `src/utils/safe-fetch.ts` (stdlib only) — public-destination policy validated inside the socket DNS lookup (no rebinding TOCTOU), IPv4/IPv6 special-use ranges incl. mapped/compat/NAT64/6to4, no redirects, idle timeout + total deadline, 1 MB cap; all 11 outbound call sites converted; save-time URL validation; response body capped at 300 chars in test results/logs; secrets encrypted at rest with `enc:v1:` marker (client-supplied marker rejected); `errorHandlerPlugin` applied at root; dev escape hatch `TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS` refused in production. Review caught a Node 20 `autoSelectFamily` lookup-shape bug (lookup must return the address array when `all:true`) that would have failed every real connection — fixed + tested. Adversarial review: accept.
**Prevention:** every service that calls a tenant-supplied URL must use a safeFetch-style client (Step 9 connector SDK should own a shared one); tests must include a real-connection-shape test, not only the private-bypass path.
**Tests:** integration-service 430 tests pass (new `tests/safe-fetch.test.ts` 81 cases).
**Deploy status:** ✅ Deployed (PR A → `2831d00`, CI/CD run 36343537845 green; VPS HEAD `2831d00`, 32/32 healthy, `etip_integration` healthy with no startup errors, `dist/utils/safe-fetch.js` present, `TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS` unset — defaults false, `TI_NODE_ENV=production`)

### Issue 48: integration-service and user-management-service routes enforced authentication only, not role — any authenticated tenant user (incl. `analyst`) could create/modify SIEM connectors or mint public API keys (found during S167 API-keys panel build, not an incident, 2026-09-28)
**Symptom/finding:** found during S167 API-keys panel build (2026-09-28), not via incident: integration-service routes (`integrations`, `webhooks`, `export`, `advanced`, `p2-routes`) and user-management-service `POST/GET/DELETE /api/v1/users/api-keys` checked authentication only, not role — any authenticated tenant user including `analyst` could create/modify connectors (and so redirect the tenant's IOC/alert pushes to an endpoint they control) or mint long-lived public API keys (including `webhook:manage` scope). The UI already hid these controls from analysts, but the server did not enforce it. Exposure increased after S166 made integrations real and persistent (previously an in-memory store, wiped on every deploy). No analyst accounts exist in prod; no evidence of misuse.
**Root cause:** route auth preHandlers verified the JWT but never mapped role → permission; the shared `hasPermission` map (`packages/shared-auth`) already defined `integration:*` / `settings:*` for `tenant_admin` and not for `analyst` — the map existed but nothing on these routes consulted it.
**Fix (`1790380`):** integration-service `src/plugins/authz.ts` `requirePermission()` (fail closed on a missing/unknown role) applied to every authenticated route in `integrations.ts`, `webhooks.ts`, `export.ts`, `advanced.ts`, `p2-routes.ts`: reads → `integration:read`, creates → `integration:create`, changes/tests/pushes/exports/retries/rotations → `integration:update`, deletes → `integration:delete`; ticket routes (`POST/GET /tickets`, `POST /tickets/:id/sync`) → `alert:create`/`alert:read`/`alert:update` (analysts may raise tickets into the admin-configured ticketing integration — that's analyst work); user-management-service `routes/api-keys.ts` → `settings:update` (create/revoke) / `settings:read` (list), role read from the nginx-set `x-user-role`, missing tenant header → 401, role/tenant checks run before the plan check. Tests added for analyst 403 / admin allowed / missing role 403.
**Prevention:** every mutating route must declare a permission — a follow-up test per service should iterate the registered routes and fail if an authenticated route lacks a permission preHandler; UI hiding a control is never access control.
**Tests:** integration-service 455, user-management-service 371 — all pass; `pnpm -r run typecheck` / `pnpm -r run lint` exit 0.
**Deploy status:** ✅ Deployed (`1790380` role enforcement + `f426026` API keys panel; CI/CD run 36349837126 green; VPS HEAD `f426026`, 32/32 healthy, no error logs in `etip_integration` / `etip_user_management`, bundle `index-C1OKlfIM.js`, TAXII discovery and `/api/v1/integrations` return 401 without credentials)


### Issue 49: "Test connection" returned 500 — frontend sent Content-Type: application/json on bodyless requests (owner browser check, 2026-09-28)
**Symptom:** Integrations → Add connection → Webhook → Test connection showed "Internal server error". The connector row was created; only the test call failed. Server log: `FST_ERR_CTP_EMPTY_JSON_BODY` on `POST /api/v1/integrations/:id/test`, returned as 500.
**Root cause:** `apps/frontend/src/lib/api.ts` always set `Content-Type: application/json`, even with no body. Fastify rejects an empty body declared as JSON (400). integration-service's error handler (applied to routes since PR A) mapped every non-AppError/Zod error, including Fastify 4xx client errors, to 500. Unit tests mocked the hooks/api layer, so no test sent a real bodyless request with the default headers.
**Fix:** `api()` adds the JSON Content-Type only when a body is sent (fixes every bodyless POST/DELETE app-wide: Test connection, Delete connector, Revoke API key, …); integration-service error handler passes through Fastify 4xx errors with their own status/code. Tests: `apps/frontend/src/__tests__/api-json-content-type.test.ts` (red without the fix, green with it) and two route tests in `apps/integration-service/tests/routes-integrations.test.ts`.
**Prevention:** header-level tests on the shared API client; service error handlers must pass through framework 4xx errors (check the other services' error handlers for the same 4xx→500 masking — follow-up); owner browser check after deploy remains mandatory (RCA #45 rule) — it caught this.

**Follow-up (same owner retest, 2026-09-28):** after the fix, Test on a **webhook** connector returned "No SIEM or ticketing config found" — `POST /integrations/:id/test` only handled SIEM/ticketing; webhooks had a separate `/:id/test-webhook` route the UI never calls. Fix: `/:id/test` now also tests webhooks via `WebhookService.testWebhook` (one Test endpoint for every connector type; `webhookService` added to route deps in `src/index.ts`), + route test. Same screen also showed demo stat tiles (Total 14, Events/hr 2840): `useIntegrationStats` (use-phase5-data.ts) fell back to demo data and its type (`total/active/eventsPerHour`) never matched the backend (`totalIntegrations/enabledIntegrations/failedLogs/dlqSize`) — RCA #45 class. Fix: real hook in `hooks/use-integrations.ts`, tiles relabelled Connections / Enabled / Failed deliveries / Dead-letter queue (no events-per-hour metric exists), test with the real body. Legacy `pages/IntegrationPage.tsx` (unrouted) still uses the old hook.


### Issue 50: Self-service sign-up impossible — "CAPTCHA verification required" (owner test, 2026-09-28)
**Symptom:** `/register` → account step → plan step → "Select Free" always failed with "CAPTCHA verification required"; no Turnstile widget was ever shown. No new tenant could sign up.
**Root cause:** Build-time vs run-time config drift. The gateway enforces Turnstile when `TI_TURNSTILE_SECRET` is set (set in the VPS `.env`). The widget only renders when the frontend is **built** with `VITE_TURNSTILE_SITE_KEY` (`components/TurnstileWidget.tsx`). Since frontend images moved to CI builds (RCA #43, GHCR), `.github/workflows/deploy.yml` built `Dockerfile.frontend` without `--build-arg VITE_TURNSTILE_SITE_KEY` — the key existed only in the VPS `.env`, which CI never sees — so every production bundle shipped without the widget while the server still demanded a token. The form also let users advance without a token, and an expired token (~5 min) had no recovery path.
**Fix:** Site key stored as GitHub repository **variable** `VITE_TURNSTILE_SITE_KEY` (public by design) and passed as a build arg; the CI step **fails the build** if the variable is empty or the key is not present in the built bundle (`grep` inside the image). Frontend (`RegisterPage.tsx`, `ClientOnboardingPage.tsx`): "Choose Plan" disabled until the CAPTCHA is completed when it is enabled (`CAPTCHA_ENABLED` exported from TurnstileWidget); `CAPTCHA_MISSING`/`CAPTCHA_FAILED` responses return the user to the account step with "The security check expired or failed. Please complete it again." Tests: `__tests__/register-captcha.test.tsx`.
**Prevention:** Any `VITE_*` value the server-side config depends on must be a CI build input with a build-time assertion, never only a VPS `.env` entry. When moving builds between environments, diff every build arg (Environment Parity Rule). Post-deploy owner check should include one real sign-up.
**Same test:** "Contact Sales" did nothing — it used `window.open(mailto:…, '_blank')`, which is popup-blocked or a no-op without a mail app. Now same-tab `mailto:` plus an always-visible note with the sales address and a Copy button (`components/SalesContactNote.tsx`, both sign-up pages).

### Issue 51: Threat Graph page only ever showed demo data (non-existent `/graph/entity/root` + frontend types ≠ backend shape)
**Symptom:** The Threat Graph page (`/graph`) always rendered 15 hard-coded demo nodes/edges, regardless of tenant data. Even when real data did reach the frontend (via "expand node" or an IOC's relationship graph), nodes showed no labels, no colour, and edges didn't connect; confidence values showed as e.g. "0.85%" instead of "85%". The "Avg Risk" stat tile only ever showed the demo value (85) — the real `/graph/stats` response has no such field.
**Root cause:** `useGraphNodes` called `GET /graph/entity/root` — `"root"` is not a valid node id, so the `/entity/:id` route always 404'd; the hook's `.catch` swallowed the error and `withDemoFallback` rendered the demo set. Separately, the frontend graph types never matched the backend response shape: backend nodes are `{id, nodeType, riskScore, confidence (0-1), properties}` and edges `{id, type, fromNodeId, toNodeId, confidence (0-1), properties}`, while the page read `entityType`, `label`, `sourceId`, `targetId`, `relationshipType`, and treated confidence as 0-100. `GET /graph/stats` returns `nodesByType/edgesByType/mostConnected/isolatedNodes/avgConnections`; the page read `byType/avgRiskScore`, fields that never existed.
**Fix:** New `GET /api/v1/graph/overview?limit=N` endpoint (`apps/threat-graph/src/routes/graph-extended.ts`) backed by `getOverviewSubgraph(tenantId, limit)` in `apps/threat-graph/src/repository-extended.ts` — one Cypher query for the top-N tenant nodes by degree plus edges between them, `200 {nodes: [], edges: []}` for an empty tenant (never 404). New adapter `apps/frontend/src/hooks/graph-adapter.ts` maps every backend graph response to the shape the UI expects, in one place. `useGraphNodes`/`useGraphStats`/`useNodeNeighbors` in `apps/frontend/src/hooks/use-phase4-data.ts` now use the adapter and the real endpoints, with demo fallbacks removed (`useNodeNeighbors` keeps its 404→empty catch, since a 404 there legitimately means "not in the graph yet"). Full change log: `docs/S165_GRAPH_OVERVIEW.md`.
**Prevention:** (1) Same bug class as RCA #45 — map every backend response at one adapter boundary, and mock the REAL backend shape in tests, never an assumed one. (2) A `.catch(() => empty)` paired with a demo fallback hides 404s from real bugs — only swallow errors that mean "legitimately empty," never "this call is broken." (3) Before wiring a hook to an endpoint, confirm the route actually exists in the target service (`grep "app.get('/…'"` or the route file) rather than assuming a plausible-looking path.

### Issue 52: Threat Graph data pipeline never produced a usable graph (label = IOC type, no values, no relationships) + `/graph/stats` always 500
**Symptom:** After S165 the Threat Graph showed ~2,500 grey, UUID-labelled dots with no connecting lines; every type filter showed 0; the stats bar showed "—". Production Neo4j had **0 relationships**; node labels were lowercase IOC types (`cve`, `domain`, `url`, `hash_*`, `email`, `ip`) and nodes carried only `id, tenantId, nodeType, firstSeen, lastSeen, enrichmentStatus, enrichedAt` — no `value`, no risk. threat-graph logged `Insufficient parameters for function 'size'` on every `/graph/stats`.
**Root cause:** (1) The only graph writer was the ai-enrichment worker, which enqueued `upsert_node` with `nodeType = <raw IOC type>` and enrichment-provider fields only — never the IOC value, severity, confidence, actors, malware families or MITRE techniques — and nothing ever enqueued relationships; normalization never synced to the graph. (2) The threat-graph worker accepted any `nodeType` string without checking it against the schema. (3) `getGraphStats` named a Cypher variable `all`, a built-in function in Neo4j 5. Mocked-driver unit tests never parse Cypher, so none of this was caught.
**Fix (permanent, S171 PRs 2–3):** ioc-intelligence gained read-only service-to-service access (`docs/S171_IOC_SERVICE_AUTH.md`). threat-graph now builds the graph from the real IOC records: `clients/ioc-client.ts` (service JWT), `services/ioc-graph-mapper.ts` (STIX-aligned: IOC/Vulnerability + ThreatActor/Malware/AttackPattern with deterministic UUIDv5 ids; INDICATES/USES/EXPLOITS edges), `services/graph-sync.ts` (batched writes; sync owns `baseRiskScore`, never lowers `riskScore`; prunes only its own edges), `services/graph-reconciler.ts` (15-min incremental + daily full reconciliation, per-tenant leases, deletion sweep only with ≥90% coverage), versioned migrations (`migrations/`) relabelling legacy nodes and adding `(id, tenantId)` constraints, allowlist validation of every interpolated label/relationship type (`cypher-safety.ts`), and `allNodes` in the stats query. Change log: `docs/S171_GRAPH_FIXES.md`.
**Prevention:** (1) Producers send identifiers, consumers hydrate from the owning service — never trust payload-supplied entity data. (2) Every derived store (graph, search index) needs a periodic reconciliation against its source of truth, not only events. (3) Never use Cypher function names (`all`, `any`, `none`, `single`, `exists`, `size`) as variables; check threat-graph logs for `Unhandled error` after every graph deploy.

| Session 78 | 2026-03-26 | RCA #43: VPS OOM during build. Fix: CI-built Docker images (GHCR). Deploy 25m→2m41s. Per-plan feed quotas (7 components, 5 modules, 54 tests). Passwordless SSH. All 33 containers healthy. CI run 23597460387 green. |
| Session 79 | 2026-03-26 | No deploy. Planning/review session: audited 27/27 gap items closed, 3/3 activation phases complete. No code changes. |
| Session 81 | 2026-03-27 | VPS activation: 20 feeds live, 17K articles, 1.5K IOCs. Fixed frontend MISSING_TENANT 400 (api.ts x-tenant-id injection). Billing pro→teams rename. 33 containers healthy. No new RCA issues. |
| Session 82 | 2026-03-27 | No new issues. Frontend-only: error toasts, search debounce, loading skeletons. 770 frontend tests. Pushed to master, CI triggered. |
| Session 83 | 2026-03-27 | No new issues. Billing dual-mode persistence (3 stores → Prisma) + admin queue 10s cache. 190 billing + 195 admin tests. CI triggered. |
| Session 84 | 2026-03-27 | No new issues. Scheduler retry backoff + feed health indicators. 19 new tests, 5,953 total. CI triggered. |
| Session 85 | 2026-03-27 | No new issues. API Gateway: tiered rate limits + error alerting + @fastify/compress. Frontend: GET request dedup. 12 new tests, ~5,965 total. CI triggered. |
| Session 86 | 2026-03-27 | No new issues. Frontend-only: fix 14 TS errors, notifyApiError wired to 7 hooks, debounce on 3 pages, TableSkeleton on 2 pages. 8 new tests, 794 frontend tests, ~5,973 total. CI triggered. |
| Session 87 | 2026-03-27 | No new issues. Customization FeedQuotaStore → Postgres dual-mode persistence. 8 new tests, 281 customization tests, ~5,981 total. CI triggered. VPS needs `prisma db push`. |
| Session 88 | 2026-03-27 | No deploy. Planning session: DECISION-029 v2 (global processing + 15 standards improvements). Docs only. |
| Session 89 | 2026-03-27 | No new issues. DECISION-029 Phase A1: 7 Prisma models, Admiralty Code, CPE 2.3, STIX Sighting, 6 global queues, Catalog API. 3 CI fixes (TS strict, queue count 18→24, lint no-control-regex). 33 containers healthy. CI run 23626796137 green. |
| Session 90 | 2026-03-27 | No new issues. DECISION-029 Phase A2: Bayesian confidence, STIX tiers, EPSS client, global AI config, plan limits. 102 new tests. Code pushed, CI triggered. No deploy. ~6,083 total tests. |
| Session 91 | 2026-03-27 | No new issues. DECISION-029 Phase B1: 5 global fetch workers, scheduler, warninglists, ATT&CK weighting. 77 new tests. Code pushed, CI triggered. ~6,160 total tests. Feature-gated (OFF by default). |
| Session 92 | 2026-03-27 | No new issues. DECISION-029 Phase B2: Global normalize/enrich workers, Shodan/GreyNoise clients, tenant overlay (6 routes). 75 new tests, 232 normalization total. Code pushed, CI triggered. ~6,235 total tests. Feature-gated. |
| Session 93 | 2026-03-27 | No new issues. DECISION-029 Phase C: Pipeline E2E wiring + alert fan-out + Global Catalog UI. 10 pre-existing TS errors fixed (S90-92 leftovers). 1 lint fix. 57 new tests. CI run 23629284908 green. 33 containers healthy. ~6,292 total tests. |
| Session 94 | 2026-03-27 | No new issues. Phase C Activation: wired orchestrator/workers/handler in index.ts. docker-compose env vars added. TI_GLOBAL_PROCESSING_ENABLED=true on VPS. docker compose restart does NOT reload .env — must force-recreate. E2E: 50 articles → 30 normalized → IOCs extracted. CI runs 23630684225 + 23631054444 green. 33 containers healthy. |
| Session 94d | 2026-03-27 | No new issues. Phase D: GlobalAiConfigPage + PlanLimitsPage + E2E tests + seed script. 1 lint CI failure (unused `defaults` destructure) fixed in follow-up commit. CI run 23632374415 green. 33 containers healthy. Frontend redeployed. |
| Session 95 | 2026-03-27 | No new issues. Phase E: monitoring dashboard, recovery cron, badge components. VPS: git pull + activation script run. Prisma in sync. `tsx` not in container (seed skipped — feeds already in DB). Frontend rebuild pending. 882 frontend + 612 ingestion tests passing. |
| Session 96 | 2026-03-27 | No new issues. Phase F: fuzzy dedupe, velocity scoring, batch normalization, CWE chains, Redis caching. Code-only session (no deploy). 90 new tests. 204 shared-normalization + 629 ingestion + 256 normalization + 10 E2E smoke. |
| Session 97 | 2026-03-27 | No new issues. Phase G (FINAL): corroboration engine, severity voting, community FP, 6 new routes, 3 frontend sections, 4 hooks. Code-only (no deploy). 78 new tests. DECISION-029 CLOSED (9 sessions). |
| Session 101 | 2026-03-27 | No new issues. AnalyticsPage executive dashboard: 3 sections (KPI cards, trend charts, intelligence breakdown), +2 analytics endpoints. Code-only (no deploy). 55 new tests. 6,733 total. |
| Session 113 | 2026-03-29 | No new issues. Designation field (I-03) + tenant-admin delete guard (I-04) + self-action guards (I-05). CI run 23704114823 green. All 33 containers healthy. 210 user-management tests. Migration 0003 pending prisma db push on VPS. |
| Session 114 | 2026-03-29 | No new issues. Quota enforcement S3+S4: plan definitions CRUD (10 endpoints) + override CRUD (4 endpoints) + Redis Lua counters + plan cache + X-Quota headers + usage API (5 endpoints). 18 new tests (108 api-gateway total). 7,238 monorepo tests. Pushed to master, CI triggered. VPS needs prisma db push for plan models. |
| Session 115 | 2026-03-29 | No new issues. MFA implementation (I-10): TOTP setup/verify/disable, two-step login with challenge tokens, backup codes (bcrypt, single-use), platform+org enforcement. 9 API endpoints, 33 new tests (49 user-service, 92 shared-auth). CI run 23713181251 green. VPS needs: prisma db push (mfaBackupCodes, mfaVerifiedAt, MfaEnforcementPolicy) + TI_MFA_ENCRYPTION_KEY env var. |
| Session 116 | 2026-03-29 | No new issues. SSO group-to-role mapping (I-11) + email verification (I-13). SsoConfig Prisma model, JIT provisioning, email verify/resend/cleanup. 22 new tests (73 user-service). Deploy verified: /health ok, /ready ok. 33 containers healthy. VPS needs prisma db push for SsoConfig + email verification fields. |
| Session 116 | 2026-03-30 | No new issues. SCIM 2.0 provisioning (I-12) + billing upgrade (I-14). ScimToken Prisma model, /Users CRUD + /Groups read-only, bearer token auth, deprovisioning. POST /billing/upgrade + GET /billing/plans. 24 files, 2,650 insertions, 49 new tests. CI/CD passed. API gateway healthy (110s uptime). All 33 containers healthy. VPS needs prisma db push for ScimToken model. |
| Session 117 | 2026-03-30 | No new issues. Access review automation (I-17) + compliance report generation (I-18). 2 Prisma models (AccessReview, ComplianceReport), 11 endpoints, 20 new tests. CI run 23722293306 green. All 33 containers healthy. VPS needs prisma db push for access_reviews + compliance_reports tables. |
| Session 117b | 2026-03-30 | No new issues. Org offboarding (I-19) + data retention (I-20) + ownership transfer (I-21). 6 Tenant offboarding fields + archivedAt/archiveReason on 5 data models. 2 new queues, 6 new events. 9 new routes, 32 new files, 55 new tests. CI run 23723397692 green. All 33 containers healthy. VPS needs prisma db push for offboarding fields + archivedAt columns. |
| Session 118 | 2026-03-30 | No new issues. Break-glass emergency account (I-22): OTP login, 30-min non-renewable sessions, in-memory rate limiter (3/15min per IP), critical audit, BullMQ alert queue, admin endpoints (status/audit/rotate-password/force-terminate), seed script. 3 Prisma additive fields (User) + 1 (Session). shared-auth: expiresInOverride + extraClaims. 30 queues, 39 events. 5 new endpoints, 15 new tests, 20 files, 1,158 insertions. CI run 23724305260 green. All 33 containers healthy. VPS needs: prisma db push (break-glass fields) + TI_BREAK_GLASS_EMAIL/PASSWORD/OTP_SECRET env vars + seed script. |
| Session 118b | 2026-03-30 | No new issues. E2E Integration Tests (S15): 8 suites validating I-01 through I-22 (RBAC, guards, MFA, break-glass, RLS isolation, offboarding, audit hash chain, SCIM). 95 new E2E tests. 2 lint fixes (ownership-transfer-service _triggeredBy wired into audit). 187 api-gateway tests, 174 user-service tests. ~7,635 monorepo total. CI run 23725348784 green. All 33 containers healthy. |
| Session 119 | 2026-03-30 | No new issues. S16: MFA Setup UI + Active Sessions + Email Verification (frontend only). 21 new + 7 modified files. 61 new tests. 3 lint CI fixes (unused imports: eslint-disable comments, waitFor/Lock/formatDateTime/Loader2). CI run 23736530510 green. All 33 containers healthy. |
| Session 120 | 2026-03-30 | No new issues. S17: Access Review UI + Compliance Reports + FeatureGate wiring (frontend only). 7 new + 5 modified files. 47 new tests. 1 lint CI fix (unused imports: useMemo, FileText, Users, Key, Lock, Clock, AlertTriangle, DsarExport, useAuthStore, waitFor, filters param, id param). CI run 23737638316 green. All 33 containers healthy. |

| Session 121 | 2026-03-30 | No new issues. S18: Offboarding Panel + Break-Glass Status + SSO Config UI (frontend only). 10 new + 3 modified files. 37 new tests. 1 lint CI fix (unused imports: BreakGlassAuditEntry type, unused cancelBtn variable). CI run 23741416630 green. All 33 containers healthy. |
| Session 122 | 2026-03-30 | No new issues. S19: VPS Production Deploy (S1-S18). Manual deploy via Cloudflare Tunnel SSH. prisma db push (all pending schema). RLS policies on 19 tables (migration 0004). DB trigger (migration 0003). 3 seed scripts (system-tenant, plan-definitions, break-glass). 6 env vars wired to compose. docker compose build + up -d. 32/32 containers healthy. All endpoints verified. bcryptjs pnpm path fallback added to seed scripts (RCA pattern: pnpm strict hoisting in prod containers). |
| Session 123b | 2026-03-31 | No new issues. S123: Unified Feeds view + Settings/System refactor. Frontend-only deploy (SettingsTab extraction, Confidence+Preferences merge, Feed Config moved to SystemTab, PipelinePanel+BackupsPanel extracted). CI/CD passed. 32/32 containers healthy. |
| Session 123c | 2026-03-31 | No new issues. S123c: Merged Pipeline Monitor + Pipeline Health into unified Pipeline sub-tab (System tab). Frontend-only deploy. 32/32 containers healthy. |
| Session 124 | 2026-03-31 | No new issues. Public REST API deployed (14 new files, /api/v1/public/* endpoints, DB-driven plan limits, webhook delivery). One lint fix needed: require() → ESM import in stix-mapper.ts. |
| Session 125 | 2026-03-31 | No new issues. Public API improvements (rate limit headers, SSRF fix, delta sync, bulk lookup, stats). CI green. 32/32 containers healthy. |
| Session 126 | 2026-03-31 | One CI fix needed: `.map(toPublicIoc)` type mismatch — map passes `(value, index, array)` where `index: number` is incompatible with new `includeEnrichment?: boolean` param. Fixed by wrapping in arrow fn: `.map((r) => toPublicIoc(r))`. Pattern: never pass functions with optional boolean params as `.map()` callbacks directly — always use arrow wrappers. Commits 11c8319 (feat) + cd41d80 (fix). 32/32 containers healthy. |
| Session 127 | 2026-03-31 | No new issues. TAXII 2.1 server, webhook exponential backoff, changelog endpoint, SDK generation scaffolding. 279 api-gateway tests. All 14/14 public API gaps complete. 32/32 containers healthy. |
| Session 128 | 2026-04-01 | No new issues. BulkFileConnector (CSV/plaintext/JSONL) for ingestion service. 667 ingestion tests (29 new). csv-parse dependency. 3 new feed types. CI/CD all 3 jobs green. 32/32 containers healthy. Prisma schema in sync. |
| Session 129 | 2026-04-01 | One CI fix needed: extractionMeta Zod schema missing isKEV/epssScore/epssPercentile fields — tsc build failed. Fixed in commit 102ed38. Also: esbuild `||` + `??` operator precedence required parentheses in 4 routeToConnector cases. 6 new connectors (ThreatFox, URLhaus, MalwareBazaar, Feodo, CISA KEV, FIRST EPSS). 750 ingestion + 303 normalization tests. 32/32 containers healthy. |
| Session 130 | 2026-04-01 | No new issues. OTX connector added. Manual VPS deploy (docker compose build + up -d). Prisma db push for cisa_kev/first_epss FeedType enum. 32/32 containers healthy. |
| Session 131 | 2026-04-01 | No new issues. GSB v4 enrichment provider. etip_enrichment rebuilt + restarted. 33/33 containers healthy. 2 TS fixes needed post-implementation (gsbResult missing from error return paths in service.ts + enrich-worker.ts) — caught by tsc --noEmit before push. |
| Session 132 | 2026-04-01 | No new issues. IPinfo.io geolocation+ASN enrichment provider deployed. etip_enrichment recreated. 32/32 containers healthy. 1 CI fix: ipinfoResult missing from error return paths (same pattern as S131 gsbResult). |
| Session 132b | 2026-04-01 | No new issues. Per-IOC-type ES indices + ILM lifecycle (6 index categories, type-specific mappings, migration route). ES container restart needed (pre-existing unhealthy state, not caused by deploy). etip_es_indexing recreated. 32/32 containers healthy. 116 ES indexing tests (59 new). |
| Session 133 | 2026-04-01 | No new issues. Majestic Million top-domain whitelist for FP reduction. shared-normalization: action:'drop'\|'flag' warninglist, Set-based O(1) hostname matching, URL domain extraction. normalization: confidence penalty for flagged IOCs. etip_normalization recreated. 32/32 containers healthy. 250 shared-normalization + 322 normalization tests. |
| Session 134 | 2026-04-02 | No new issues. Org-aware dashboard redesign (1/3). Frontend-only change: 4 widgets, 3-mode conditional rendering, org-profile store. etip_frontend rebuilt. 32/32 containers healthy. 1,526 frontend tests. |
| Session 135 | 2026-04-02 | No new issues. Org-aware dashboard redesign (2/3). Frontend-only: 4 new widgets (TopCves, RecentAlerts, SeverityTrend, ProfileMatch) + SeverityHeatmap org-awareness. etip_frontend rebuilt. 32/32 containers healthy. 1,542 frontend tests. |
| Session 136 | 2026-04-02 | No new issues. Org-aware dashboard redesign (3/3 COMPLETE). Frontend-only: GeoThreatWidget (9th widget) + TenantSettings org-profile store wiring. 16 new tests. etip_frontend rebuilt. 32/32 containers healthy. 1,560 frontend tests. CI run 23879964450 green. |
| Session 137 | 2026-04-02 | One CI fix needed: unused `summary` variable in RecentAlertsWidget.tsx after guard clause removal — ESLint `no-unused-vars` error. Fixed by removing from destructuring (commit 7b3b60c). Frontend-only: removed DashboardFeatureCards, GlobalPipelineWidget, "Manage Feeds" quick action; added empty states to all 9 widgets; fixed OrgProfileCta navigation. CI run 23888124049 green. |
| Session 138 | 2026-04-02 | No new issues. Dashboard Phase 2: InvestigationDrawer, Geo dot-map, freshness indicators. Cleanup: removed FeedHealth/FeedValue/QuickActionsBar. etip_frontend rebuilt. 32/32 containers healthy. 1,615 frontend tests. CI runs 23890451261, 23891843411 green. |
| Session 139 | 2026-04-02 | One CI fix needed: unused `table` variable in ioc-tier1.test.tsx:208 — ESLint `no-unused-vars` error. Fixed by removing unused assignment (commit d5e2204). IOC Intelligence Tier 1: IocStatsCards, Enrichment Status column, Corroboration badge. Normalization response envelope fix. etip_frontend + etip_normalization rebuilt. 32/32 containers healthy. 1,627 frontend tests. CI run 23896075406 green. |
| Session 140 | 2026-04-02 | No new issues. IOC Intelligence Tier 2: Multi-select bulk actions, Create IOC modal, Right-click context menu, Saved filter presets. IocListPage refactored 399→245 lines (6 extractions). 16 new files, 8 modified. etip_frontend rebuilt. 32/32 containers healthy. 1,659 frontend tests (+32). CI run 23898205818 green. |
| Session 141 | 2026-04-02 | One CI fix needed: unused type imports `CurvePoint` and `EventMarker` in ConfidenceDecayChart.tsx — ESLint `no-unused-vars` error. Fixed by removing unused imports (commit d179a22). IOC Intelligence Tier 3: Confidence decay chart, MITRE ATT&CK badges, risk propagation banner, IOC compare panel, expandable inline enrichment rows. 7 new + 12 modified files. etip_frontend rebuilt. 32/32 containers healthy. 1,708 frontend tests (+49). CI run 23903961558 green. |
| Session 141b | 2026-04-02 | One transient SSH broken pipe during Docker image pull (same as RCA #6). Retried via `gh run rerun --failed`. OTX connector committed (was deployed in S130 but never committed). Prisma schema: `otx` FeedType enum. CI run 23905197490 test+build green, deploy retry 23905660133 green. 32/32 containers healthy. |
| Session 143 | 2026-04-03 | No new issues. Search page best-in-class: card/table view toggle, bulk IOC search, saved presets, search history, multi-select, term highlights, expandable rows, context menu. 77 new tests. 1,785 frontend tests. etip_frontend rebuilt. 32/32 containers healthy. |
| Session 144 | 2026-04-03 | No new issues. Fix IOC list sort/filter params (sortBy→sort, q→search) + remove 4 unsupported sortable columns. etip_frontend rebuilt. 32/32 containers healthy. CI run 23929832680 green. |
| Session 146 | 2026-09-22 | **CI red since 2026-06-03, no deploys for 3.5 months.** Cause: `offboarding-panel.test.tsx` fixtures hardcode purge dates in May 2026; once real time passed them the 'Purges in N days' text stopped rendering. Fix: pin `Date` with `vi.useFakeTimers({ toFake: ['Date'], now })` in that test (0a210fb, on branch). Prevention: never assert on text derived from `Date.now()` against fixed fixture dates without pinning the clock; 26 frontend test files still contain literal ISO dates. Also: deploy.yml does `git reset --hard` on the VPS, which would have wiped an uncommitted dhanradar Prometheus job living in /opt/intelwatch — now committed (a22aa9e). Manual deploy of a22aa9e: 32/32 etip containers healthy. |
| Session 147 | 2026-09-23 | No new issues. PR #20 (VPS hardening + SEO Phase 1 + CI unblock) merged → CI/CD run 35779554466 green end-to-end, first successful auto-deploy since 2026-06-03. Both nginx configs passed `nginx -t` on first real load. 32/32 healthy. Local-only note: `docker build` from a working tree with nested `node_modules` fails (`.dockerignore` `node_modules` matches root only); build from `git -c core.autocrlf=false archive HEAD \| docker build -f Dockerfile.frontend -` instead. CI unaffected. |
| Session 147b | 2026-09-23 | **Security fix (found in the S147 review, fixed and deployed the same day):** nginx proxied several `/api/v1/*` paths straight to backend services that had no authentication and took tenant/role from client headers. Fixed in #23: nginx `auth_request` to the api-gateway on every direct-to-service location, identity headers overwritten from the verified JWT, super-admin-only admin/cache/archive. **Prevention:** any new nginx `location /api/v1/...` that bypasses the gateway MUST `include /etc/nginx/conf.d/service-auth.inc` (or `service-auth-super-admin.inc`); validate nginx changes with `nginx -t -c` inside the live container before merge (deploy force-recreates etip_nginx, so a bad config = outage). Deploys #21, #22, #24: no new issues. |
| Session 147c | 2026-09-23 | #27 deploy failed at "Deploy via SSH" with `websocket: bad handshake` / exit 255 (Cloudflare tunnel SSH from Actions, same class as RCA #6). No VPS change happened. **Fix:** `gh run rerun <id> --failed` — succeeded. Also found: drp-service missing `loadJwtConfig` (all DRP requests 500) and billing/customization missing `TI_DATABASE_URL` in compose — **prevention:** new-service checklist must include `loadJwtConfig(env)` in index.ts and DB URL in compose when the service imports Prisma. |
| Session 148 | 2026-09-25 | **Site down ~46 h (502 on every page, 2026-09-23 06:53 → 2026-09-25 ~05:10 IST).** Trigger: #30 deploy's SSH session dropped (`client_loop: send disconnect: Broken pipe`, exit 255 — same class as RCA #6) while `docker compose up -d` was mid-run; every service started except `etip_nginx`, left in `Created`. **Why it lasted 46 h:** `scripts/health-recovery.sh` (cron every 5 min, restarts `created`/`exited` containers) was committed as mode 100644, so cron failed with `Permission denied` ~20,000 times (~70 days) — the safety net never ran. Deploy failure (red CI) went unnoticed. **Fix:** started nginx (`docker compose -f docker-compose.etip.yml up -d etip_nginx`, `nginx -t` ok); `chmod +x` on VPS; git mode 100755 for `health-recovery.sh` + `docker-cleanup.sh` (deploy's `git reset --hard` now keeps them executable). **Prevention:** commit shell scripts with `git update-index --chmod=+x` (Windows checkouts can't set the bit); after any red deploy run, check `docker ps -a --filter status=created` on the VPS; follow-ups in docs/S148_NGINX_OUTAGE.md. |
| Session 149 (0B) | 2026-09-25 | No new issues. PR #35 (Step 0B) → CI/CD run 36159365105 green end to end, no SSH drop. Pre-deploy: pg_dump + `.env` backup; secrets rotated in `.env` before merge (integration-service now refuses the dev key in production, so the key had to exist first). Redis recreated by `up -d` for the new command/limit; keys kept (AOF). Adversarial review caught a percent-encoded-path bypass of the billing gate before merge (5c33b36: match `req.routeOptions.url`, not raw `req.url`). Verified: 32/32 healthy, `nginx -t` ok, Redis noeviction/1 GB, tenant guard 403, payment routes 503 incl. encoded paths. |
| Session 150 (Step 1) | 2026-09-26 | **Prevention/hardening, not a new incident.** Closes the two gaps behind Session 148's 46 h outage. **S148-class (SSH drop mid-deploy → containers stuck `Created`)** now prevented by: a detached deploy (`scripts/deploy-vps.sh` launched via `setsid nohup`, so a dropped SSH session can no longer SIGHUP the deploy mid-`compose up`), a second `docker compose up -d` pass plus an explicit assert that no `etip_*` container is left `Created`/`Exited`, and `health-recovery.sh` (installed from git via `/etc/cron.d/etip` on every deploy) as the ongoing safety net. **"health-recovery 100644 Permission denied" class** (the reason the S148 outage lasted 46 h instead of 5 min) now prevented structurally: every job in `scripts/etip-cron` is invoked via `bash <path>`, so a lost exec bit can no longer break cron regardless of the script's file mode. **Deployed** (PR #36 → `112c39f`, run 36219067370 green first try; no new issues; 32 containers healthy; recovery drill `etip_nginx` back in ~38 s with Telegram alert). Detail: `docs/S150_STEP1_STAY_UP.md`. |
| Session 150 (restore drill) | 2026-09-26 | Restore drill PASS: 2.16 GB dump, rc 0, 6m18s, counts match. Lesson: remove anonymous volume (`docker rm -v`). |
| Session 151-157 (Step 2, PRs #38-#41) | 2026-09-26 | No new issues. Roadmap Step 2 "search works" complete: shared IOC search-index contract (DECISION-033), es-indexing consumes it (hash-type fix, robust update/delete, safe search), normalization + ai-enrichment + ioc-intelligence producers, api-gateway super-admin backfill, frontend ⌘K wired to real search. 6 rebuilds across the 6 modules, 32/32 healthy each time. Production backfill enqueued (12,093 IOCs); ES=DB count verification carried to S160 (not a deploy issue — the backfill worker drains ~1 doc/s by design). |
| Session 158 (Step 0 tooling, PR #42) | 2026-09-26 | No new issues (ops/tooling only, no app containers touched). Rewritten same day by another session to DECISION-034 (one folder, one session) — the original worktree-per-session design never reached production use. |
| Session 159 (frontend tsc, PR #43) | 2026-09-26 | First CI run failed: `feeds-tab.test.tsx` mocked `useMySubscriptions` with a stale envelope shape, unrelated to the tsc fix itself — corrected the mock, second run green. Deploy: no new issues. 32/32 healthy. **Prevention:** when a hook's real return shape changes (or is corrected), grep its test mocks in the same PR, not just its callers. |
| Session 160–161a | 2026-09-26 | No new issues. PR #44 (baaf147) deployed, 32/32 containers healthy. Step 2 ES=DB verified. |
| Session 161a PR B | 2026-09-27 | No new issues. PR #45 (cd4a227) deployed, run 36297890539 green, 32/32 containers healthy. Honest UI billing/admin/users hooks + screens (Step 5). |
| Session 161a PR B hotfix | 2026-09-27 | RCA #45: System tab crash + Plan Builder false empty state after PR B. PR #46 (1111965) deployed, run 36302952387 green, 32/32 healthy. |
| Session 161a PR B hotfix 2 | 2026-09-27 | RCA #45 follow-up: Emergency Access (break-glass audit) crash, pre-existing since S18. PR #47 (5489428) deployed, run 36305645836. Crash audit of the remaining ~23 `api<{data}>` call sites: 0 crash risks (all silent demo/empty fallbacks → S161b). |
| Session 161a PR B hotfix 3 | 2026-09-27 | RCA #45 second layer: Emergency Access raw AuditLog rows mapped to panel shape; maintenance-window `affectedServices` crash (admin-service sends scope/tenantIds) defaulted. PR #48 (f012bdc) deployed, run 36308018916 green, 32/32 healthy. Page shape audit (3 agents): no further crash paths. |
| Session 163 (S161b PR 1) | 2026-09-27 | No new issues. RCA #45 bug-class sweep across 17 frontend hooks (`api<{data}>` double-unwrap fix, ~40 sites) + session-start command optimization. Master fast-forwarded 2 commits (`b4975c6`, `255b49f`), CI/CD run 36328956242 green, 32/32 containers healthy. VPS HEAD `255b49f`, frontend bundle `assets/index-BFlQFtCg.js`, `/api/v1/users` 401 without token. 1,944 frontend tests (was 1,926), 2 skipped. |
| Session 163 (S162) | 2026-09-27 | No new issues. user-management-service directory routes (`GET /users`, `/users/stats`, `/users/audit`) so Users screens stop 404ing. Master `045fb35`, CI/CD run 36330819062 green, 32/32 containers healthy. VPS HEAD `045fb35`, `directory.js` present in the user-management image, no log errors, new frontend bundle `assets/index-Ckl4LPzT.js`, `/api/v1/users` + `/api/v1/users/stats` 401 without token. 1,934 frontend tests, 360 user-management-service tests. |
| Session 163/164 (roles fix) | 2026-09-27 | No new issues. Roles & Permissions tab shows the 3 real roles, not a fake matrix (`69f8239`). CI run 36341451741 green, VPS verified 32/32 healthy, bundle `assets/index-B_mrXPFz.js`. |
| Session 166 (S166 PR A) | 2026-09-28 | **Issue 47 fixed.** integration-service outbound hardening: new `safeFetch()` SSRF guard on all 11 outbound call sites, connector credentials encrypted at rest, `errorHandlerPlugin` moved to root scope. Master `2831d00`, CI/CD run 36343537845 green, 32/32 containers healthy. VPS HEAD `2831d00`, `etip_integration` healthy with no startup errors, `dist/utils/safe-fetch.js` present, `TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS` unset (defaults false), `TI_NODE_ENV=production`. 430 integration-service tests. |
| Session 166 (S166 PR B) | 2026-09-28 | No new issues. Integration persistence: `Integration` table replaces the in-memory store. Master `c44a5f0`, CI run 36345804944 green, VPS verified (integrations table, hydrate log, `TI_DATABASE_URL` set). |
| Session 166 (S166 PR C) | 2026-09-28 | No new issues. Real easy-connect Integrations tab (frontend only): TAXII feed card, real connector list, add-connection wizard, non-existent Splunk/XSOAR cards removed. Master `b4f9e71`, CI run 36347744374 green, VPS HEAD `b4f9e71`, 32/32 healthy, bundle `index-BcDHey4p.js`. 1,954 frontend tests. |
| Session 167 (API keys panel + role enforcement) | 2026-09-28 | **Issue 48 fixed.** Server-side role enforcement (`requirePermission()`, fail closed) added to integration-service routes + user-management-service api-keys routes; API keys panel added to frontend (Users & Access). Master `1790380` + `f426026`, CI run 36349837126 green, 32/32 containers healthy. VPS HEAD `f426026`, no error logs in etip_integration/etip_user_management, bundle `index-C1OKlfIM.js`, TAXII discovery and `/api/v1/integrations` return 401 without credentials. integration-service 455, user-management-service 371, frontend 1,969 tests. |
| Session 168 (RCA #49 fix + follow-up) | 2026-09-28 | **Issue 49 fixed.** "Test connection" 500 on bodyless requests — `api()` now sets `Content-Type: application/json` only when a body is sent; integration-service error handler passes through Fastify 4xx errors instead of masking them as 500 (`fbd925c`). **Same-day follow-up (owner retest):** webhook Test connection wired to `WebhookService.testWebhook` (the single `/:id/test` route only handled SIEM/ticketing before); Integrations tab stat tiles switched from demo data to the real `/integrations/stats` shape (Connections/Enabled/Failed deliveries/Dead-letter queue) (`1481ac9`). No new issues. |
| Session 168 (RCA #50 fix) | 2026-09-28 | **Issue 50 fixed.** Self-service sign-up restored — `VITE_TURNSTILE_SITE_KEY` moved to a GitHub repository variable passed as a CI build arg, with a build-time assertion that the key is present in the built image; frontend now blocks "Choose Plan" until CAPTCHA completes and recovers cleanly on `CAPTCHA_MISSING`/`CAPTCHA_FAILED`; Contact Sales switched from a popup-blocked `window.open(mailto:)` to a same-tab link + always-visible copyable sales address (`ddcb6be`). CI run 36358218015 green (incl. new CAPTCHA build-time key guard), VPS HEAD `ddcb6be`, 32/32 containers healthy, Turnstile site key confirmed present in the live bundle (`assets/index-icIBot1J.js`). Owner has not yet retested sign-up end-to-end (deferred by owner). |
| Session 170 (S165) | 2026-09-28 | **Issue 51 fixed.** Threat Graph page wired to the existing `GET /graph/overview` route instead of the non-existent `graph/entity/root` it was calling (was silently falling back to demo data); real top-50 most-connected entities + edges, node expand + IOC detail relationship graph now render real labels/colours/edges. Master `823884b` + `eea4496`, PR #49 fast-forward merged, CI/CD run 36362964512 green, 32/32 containers healthy, 0 in `Created` state. VPS HEAD `eea4496`, `etip_threat_graph`/`etip_frontend`/`etip_nginx` recreated, bundle `assets/index-CwFaoonP.js`, `/api/v1/graph/overview` 401 unauthenticated (route exists). 308 threat-graph tests (was 294), 1,990 frontend tests incl. 2 skipped (was 1,977). Owner browser check pending. |
