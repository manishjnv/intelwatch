# ETIP v4.0 — API Gateway Dockerfile
# Multi-stage: install -> build TypeScript -> production

# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl openssl-dev
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy workspace config + all package.json files.
# EVERY workspace member in pnpm-lock.yaml MUST have its package.json here.
# Missing entries cause frozen-lockfile to fail and symlinks to break.
# (Issue 11, 16 — docs/DEPLOYMENT_RCA.md)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json         packages/shared-types/tsconfig.json         packages/shared-types/
COPY packages/shared-utils/package.json         packages/shared-utils/tsconfig.json         packages/shared-utils/
COPY packages/shared-cache/package.json         packages/shared-cache/tsconfig.json         packages/shared-cache/
COPY packages/shared-auth/package.json          packages/shared-auth/tsconfig.json          packages/shared-auth/
COPY packages/shared-audit/package.json         packages/shared-audit/tsconfig.json         packages/shared-audit/
COPY packages/shared-normalization/package.json packages/shared-normalization/tsconfig.json packages/shared-normalization/
COPY packages/shared-enrichment/package.json    packages/shared-enrichment/tsconfig.json    packages/shared-enrichment/
COPY packages/shared-ui/package.json            packages/shared-ui/
COPY apps/api-gateway/package.json              apps/api-gateway/tsconfig.json              apps/api-gateway/
COPY apps/user-service/package.json             apps/user-service/tsconfig.json             apps/user-service/
COPY apps/frontend/package.json                 apps/frontend/

RUN pnpm install --frozen-lockfile --ignore-scripts 2>/dev/null || pnpm install --no-frozen-lockfile --ignore-scripts

# Stage 2: Build TypeScript
FROM deps AS build

COPY packages/ packages/
COPY apps/     apps/
COPY prisma/   prisma/

RUN pnpm exec prisma generate --schema=prisma/schema.prisma

# Build backend packages only — exclude @etip/frontend (that is built by Dockerfile.frontend).
# shared-ui has no 'build' script so pnpm skips it automatically.
# Packages built in dependency-graph order by pnpm.
# No '|| true' — failures must fail the image visibly. (Issue 15 — DEPLOYMENT_RCA.md)
RUN pnpm -r build --filter '!@etip/frontend'

# Stage 3: Production
FROM node:20-alpine AS production
RUN apk add --no-cache curl openssl
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY --from=build /app/ ./

ENV NODE_ENV=production
ENV TI_API_PORT=3001
ENV TI_API_HOST=0.0.0.0

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD curl -sf http://localhost:3001/health || exit 1

CMD ["node", "apps/api-gateway/dist/index.js"]
