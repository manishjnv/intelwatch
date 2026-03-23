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
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.build.json ./
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
COPY apps/ingestion/package.json             apps/ingestion/tsconfig.json              apps/ingestion/
COPY apps/normalization/package.json         apps/normalization/tsconfig.json          apps/normalization/
COPY apps/ai-enrichment/package.json        apps/ai-enrichment/tsconfig.json         apps/ai-enrichment/
COPY apps/ioc-intelligence/package.json     apps/ioc-intelligence/tsconfig.json    apps/ioc-intelligence/
COPY apps/threat-actor-intel/package.json   apps/threat-actor-intel/tsconfig.json  apps/threat-actor-intel/
COPY apps/malware-intel/package.json        apps/malware-intel/tsconfig.json       apps/malware-intel/
COPY apps/vulnerability-intel/package.json  apps/vulnerability-intel/tsconfig.json apps/vulnerability-intel/
COPY apps/threat-graph/package.json         apps/threat-graph/tsconfig.json        apps/threat-graph/
COPY apps/correlation-engine/package.json  apps/correlation-engine/tsconfig.json apps/correlation-engine/
COPY apps/hunting-service/package.json     apps/hunting-service/tsconfig.json    apps/hunting-service/
COPY apps/drp-service/package.json           apps/drp-service/tsconfig.json       apps/drp-service/
COPY apps/integration-service/package.json   apps/integration-service/tsconfig.json apps/integration-service/
COPY apps/user-management-service/package.json apps/user-management-service/tsconfig.json apps/user-management-service/
COPY apps/customization/package.json           apps/customization/tsconfig.json            apps/customization/
COPY apps/onboarding/package.json              apps/onboarding/tsconfig.json               apps/onboarding/
COPY apps/frontend/package.json               apps/frontend/

# RULE: strict --frozen-lockfile, NO fallback. Stale lockfile = build MUST fail. (Issues #11, #16)
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Stage 2: Build TypeScript ──────────────────────────────────
FROM deps AS build

COPY packages/ packages/
COPY apps/     apps/
COPY prisma/   prisma/

RUN pnpm exec prisma generate --schema=prisma/schema.prisma

# tsc -b (build mode) compiles all projects in strict dependency order via references.
# Guarantees .d.ts files exist before dependents compile. No race conditions.
# No '|| true' — failures must fail the image build visibly. (Issue 15 — DEPLOYMENT_RCA.md)
# --force: always rebuild all projects (no .tsbuildinfo cache in fresh Docker layer)
RUN pnpm exec tsc -b --force tsconfig.build.json

# ── Stage 3: Production ───────────────────────────────────────
FROM node:20-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=build /app/ ./

ENV NODE_ENV=production
ENV TI_API_PORT=3001
ENV TI_API_HOST=0.0.0.0

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD curl -sf http://localhost:3001/health || exit 1

CMD ["node", "apps/api-gateway/dist/index.js"]
