# ═══════════════════════════════════════════════════════════════
# ETIP v4.0 — API Gateway Dockerfile
# Multi-stage: install → build TypeScript → production
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Install dependencies ──────────────────────────────
# RULE: NEVER use Alpine for Node — Prisma, bcrypt, native deps require glibc (DEPLOYMENT_RCA Issue #7)
FROM node:20-slim AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy workspace config + all package.json files.
# EVERY workspace member listed in pnpm-lock.yaml MUST have its
# package.json here — otherwise frozen-lockfile install fails.
# (Issue 11, 16 — see docs/DEPLOYMENT_RCA.md)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json       packages/shared-types/tsconfig.json        packages/shared-types/
COPY packages/shared-utils/package.json       packages/shared-utils/tsconfig.json        packages/shared-utils/
COPY packages/shared-cache/package.json       packages/shared-cache/tsconfig.json        packages/shared-cache/
COPY packages/shared-auth/package.json        packages/shared-auth/tsconfig.json         packages/shared-auth/
COPY packages/shared-audit/package.json       packages/shared-audit/tsconfig.json        packages/shared-audit/
COPY packages/shared-normalization/package.json packages/shared-normalization/tsconfig.json packages/shared-normalization/
COPY packages/shared-enrichment/package.json  packages/shared-enrichment/tsconfig.json   packages/shared-enrichment/
COPY packages/shared-ui/package.json          packages/shared-ui/
COPY apps/api-gateway/package.json            apps/api-gateway/tsconfig.json             apps/api-gateway/
COPY apps/user-service/package.json           apps/user-service/tsconfig.json            apps/user-service/
COPY apps/frontend/package.json               apps/frontend/

# RULE: strict --frozen-lockfile, NO fallback. Stale lockfile = build MUST fail. (Issues #11, #16)
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Stage 2: Build TypeScript ──────────────────────────────────
FROM deps AS build

COPY packages/ packages/
COPY apps/     apps/
COPY prisma/   prisma/

RUN pnpm exec prisma generate --schema=prisma/schema.prisma

# RULE: Scoped builds only — NEVER 'pnpm -r build' in Dockerfiles (03-DEVOPS.md)
# The '...' suffix builds all transitive workspace deps in topological order:
#   shared-types → shared-utils → shared-auth → user-service → api-gateway
# No '|| true' — failures must fail the image build visibly. (Issue 15 — DEPLOYMENT_RCA.md)
RUN pnpm --filter @etip/api-gateway... run build

# ── Stage 3: Production (lean — only runtime deps) ─────────────────
# Only copies what the API needs at runtime:
#   node_modules (pnpm store + workspace symlinks)
#   dist/ + package.json per package in the dependency chain
#   prisma/ (schema for migrations)
# Excludes: src/, tests, tsconfigs, shared-ui, shared-cache, shared-audit,
#   shared-normalization, shared-enrichment, apps/frontend
FROM node:20-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Root workspace files + node_modules (pnpm store + workspace symlinks)
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules

# Prisma schema (for runtime migrations)
COPY --from=build /app/prisma ./prisma

# API dependency chain: package.json + dist/ only
# shared-types
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
# shared-utils
COPY --from=build /app/packages/shared-utils/package.json ./packages/shared-utils/
COPY --from=build /app/packages/shared-utils/dist ./packages/shared-utils/dist
# shared-auth
COPY --from=build /app/packages/shared-auth/package.json ./packages/shared-auth/
COPY --from=build /app/packages/shared-auth/dist ./packages/shared-auth/dist
# user-service
COPY --from=build /app/apps/user-service/package.json ./apps/user-service/
COPY --from=build /app/apps/user-service/dist ./apps/user-service/dist
# api-gateway
COPY --from=build /app/apps/api-gateway/package.json ./apps/api-gateway/
COPY --from=build /app/apps/api-gateway/dist ./apps/api-gateway/dist

ENV NODE_ENV=production
ENV TI_API_PORT=3001
ENV TI_API_HOST=0.0.0.0

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD curl -sf http://localhost:3001/health || exit 1

CMD ["node", "apps/api-gateway/dist/index.js"]
