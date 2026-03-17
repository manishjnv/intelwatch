# ── Stage 1: Install dependencies ──────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl openssl-dev
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

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

RUN pnpm install --frozen-lockfile --ignore-scripts 2>/dev/null || pnpm install --no-frozen-lockfile --ignore-scripts

# ── Stage 2: Build TypeScript ──────────────────────────────────
FROM deps AS build

COPY packages/ packages/
COPY apps/ apps/
COPY prisma/ prisma/

RUN pnpm exec prisma generate --schema=prisma/schema.prisma
RUN pnpm -r build 2>&1 || true
RUN ls apps/api-gateway/dist/index.js 2>/dev/null || \
    (cd apps/api-gateway && pnpm exec tsc -p tsconfig.json 2>&1 || true)

# ── Stage 3: Production ───────────────────────────────────────
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
