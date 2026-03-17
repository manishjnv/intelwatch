# ETIP Deployment RCA — Session 2 VPS Deployment Issues

**Date**: 2026-03-17
**Deployed**: Packages 1-4 (shared-auth, prisma, api-gateway, user-service)
**Final Status**: All 17 production tests passing

---

## Issues Encountered & Resolved (8 total)

### 1. pnpm version conflict
- **Error**: `Multiple versions of pnpm specified`
- **Cause**: `pnpm/action-setup@v4` `version` param conflicts with `packageManager` in package.json
- **Fix**: Remove `version` param from action — reads packageManager automatically

### 2. prisma CLI not found in CI
- **Error**: `Command "prisma" not found`
- **Cause**: prisma only in app devDeps, not workspace root
- **Fix**: Add `prisma` + `@prisma/client` to root devDependencies

### 3. Stale lockfile
- **Error**: `pnpm install --frozen-lockfile` fails
- **Cause**: pnpm-lock.yaml from Session 1, missing new packages
- **Fix**: Regenerate lockfile with `pnpm install --no-frozen-lockfile`

### 4. MODULE_NOT_FOUND in container
- **Error**: `Cannot find module dist/index.js`
- **Cause**: Dockerfile used tsx runtime without building TypeScript — dist/ didn't exist
- **Fix**: Added `pnpm -r build` to Dockerfile, CMD uses `node dist/index.js`

### 5. Unused imports blocking tsc
- **Error**: `TS6133: 'JwtConfig' is declared but never read`
- **Cause**: Strict TypeScript (`noUnusedLocals: true`) fails on unused imports
- **Fix**: Removed unused imports from auth.ts and routes/auth.ts

### 6. SSH timeout
- **Error**: `dial tcp: i/o timeout`
- **Cause**: Transient VPS network issue
- **Fix**: `script_stop: false` + retry via workflow_dispatch

### 7. Prisma OpenSSL missing
- **Error**: `Could not parse schema engine response`
- **Cause**: Alpine Linux lacks OpenSSL, required by Prisma engine
- **Fix**: `apk add --no-cache openssl openssl-dev` in Dockerfile

### 8. workflow_dispatch skipping deploy
- **Error**: Deploy job `skipped`
- **Cause**: `needs: [test]` but test skips on workflow_dispatch
- **Fix**: `if: always() && (needs.test.result == 'success' || needs.test.result == 'skipped')`

---

## Docker Requirements for Prisma on Alpine

```dockerfile
RUN apk add --no-cache openssl openssl-dev  # deps stage
RUN apk add --no-cache curl openssl          # production stage
RUN pnpm -r build                            # compile TypeScript
CMD ["node", "apps/api-gateway/dist/index.js"] # NOT tsx
```

## VPS .env Required Variables

```
TI_POSTGRES_PASSWORD, TI_REDIS_PASSWORD, TI_ELASTICSEARCH_PASSWORD,
TI_NEO4J_PASSWORD, TI_MINIO_SECRET_KEY, TI_JWT_SECRET (min 32 chars),
TI_SERVICE_JWT_SECRET (min 16 chars), TI_GRAFANA_PASSWORD
```

## Deployment Checklist

```
Pre-Push:
  [ ] pnpm -r test passes
  [ ] pnpm -r typecheck passes (no unused imports)
  [ ] pnpm-lock.yaml up to date
  [ ] No hardcoded secrets

Post-Push (CI handles):
  [ ] pnpm install + prisma generate
  [ ] 266 tests pass
  [ ] Docker build etip_api
  [ ] docker compose up -d
  [ ] prisma db push
  [ ] Reconnect nginx to Caddy network
  [ ] Health check /health → 200
```
