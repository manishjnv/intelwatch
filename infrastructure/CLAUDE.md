# Infrastructure & Deployment

## Docker Compose: docker-compose.etip.yml
Only modify etip_ prefixed services. NEVER touch other compose files on VPS.

## Container Rules
| Container | Image | Healthcheck |
|-----------|-------|-------------|
| etip_api | node:20-slim | curl -sf http://localhost:3001/health |
| etip_frontend | nginx:1.27-alpine (serve only) | wget -q -O /dev/null http://127.0.0.1/ |
| etip_nginx | nginx:1.27-alpine | nginx -t |
| etip_postgres | postgres:16-alpine | pg_isready |
| etip_redis | redis:7-alpine | redis-cli ping |

## CRITICAL: Frontend healthcheck must use 127.0.0.1 NOT localhost
Alpine resolves localhost to ::1 (IPv6), nginx only binds IPv4. RCA #24.

## Networks
- etip_network: internal (all etip containers)
- caddy_network: external (ti-platform_default) — auto-joined by compose
- NEVER use manual `docker network connect`

## After Container Recreate
Only `docker restart ti-platform-caddy-1` needed.
Never manually connect networks — compose handles it.

## Dockerfile Stages (API — 3 stage)
1. deps: node:20-slim, COPY all package.json + tsconfig files, pnpm install --frozen-lockfile
2. build: COPY source, prisma generate, tsc -b --force tsconfig.build.json
3. production: node:20-slim, apt-get install curl, COPY --from=build /app/ ./

## Dockerfile Stages (Frontend — 2 stage)
1. build: node:20-slim, pnpm install --frozen-lockfile, npx vite build
2. serve: nginx:1.27-alpine, COPY dist to /usr/share/nginx/html

## Deploy via CI/CD
Push to master → GitHub Actions → SSH to VPS → git pull → docker compose build → up
Force-recreate app containers: `docker compose up -d --force-recreate etip_api etip_frontend etip_nginx`

## Scope Rule
Infrastructure changes are HIGH RISK. Always:
1. Run /rca-check before any change
2. Test with `make docker-test` locally
3. Never modify .github/workflows/ without explicit approval
