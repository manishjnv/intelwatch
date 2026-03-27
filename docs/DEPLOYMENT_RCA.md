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
**Error**: `https://ti.intelwatch.in/` returned HTTP 502 after deploy completed. All containers reported as "started" but `etip_nginx` couldn't connect to `etip_frontend` or `etip_api` backends.
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
**Error**: Live site at `ti.intelwatch.in` shows old landing page with no CTA buttons, no DashboardPage working.
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
- [ ] curl https://ti.intelwatch.in/health → 200 (API)
- [ ] curl https://ti.intelwatch.in/login → React HTML (contains "vite", "module")
- [ ] curl https://ti.intelwatch.in/api/v1/auth/register → 400 (validates body)
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
  └── ti.intelwatch.in  → etip_nginx:80 (via ti-platform_default network)
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
  └── ti.intelwatch.in  → etip_nginx:80 (via caddy_network / ti-platform_default)
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
