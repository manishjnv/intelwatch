# ═══════════════════════════════════════════════════════════════
# ETIP v4.0 — API Dockerfile
# Base: node:20-slim (Debian, not Alpine — no musl/openssl issues)
# Build: pnpm --filter scoped (only api-gateway + its deps)
# Run:   compiled JS from dist/ only
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Install workspace dependencies ───────────────────
FROM node:20-slim AS deps

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy workspace manifests — every workspace member referenced in
# pnpm-lock.yaml MUST have its package.json here or frozen-lockfile fails.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Backend packages (api-gateway dependency chain)
COPY packages/shared-types/package.json         packages/shared-types/
COPY packages/shared-utils/package.json         packages/shared-utils/
COPY packages/shared-cache/package.json         packages/shared-cache/
COPY packages/shared-auth/package.json          packages/shared-auth/
COPY packages/shared-audit/package.json         packages/shared-audit/
COPY packages/shared-normalization/package.json packages/shared-normalization/
COPY packages/shared-enrichment/package.json    packages/shared-enrichment/
COPY apps/user-service/package.json             apps/user-service/
COPY apps/api-gateway/package.json              apps/api-gateway/

# Frontend + shared-ui are workspace members in pnpm-lock.yaml,
# so their package.json must be present for --frozen-lockfile to work.
# We only need the manifest — no source code is copied.
COPY packages/shared-ui/package.json            packages/shared-ui/
COPY apps/frontend/package.json                 apps/frontend/

# Install all workspace deps (frozen-lockfile = deterministic)
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Stage 2: Build TypeScript (scoped to API + deps only) ─────
FROM deps AS build

# Copy tsconfig files for each package (needed by tsc)
COPY packages/shared-types/tsconfig.json         packages/shared-types/
COPY packages/shared-utils/tsconfig.json         packages/shared-utils/
COPY packages/shared-cache/tsconfig.json         packages/shared-cache/
COPY packages/shared-auth/tsconfig.json          packages/shared-auth/
COPY packages/shared-audit/tsconfig.json         packages/shared-audit/
COPY packages/shared-normalization/tsconfig.json packages/shared-normalization/
COPY packages/shared-enrichment/tsconfig.json    packages/shared-enrichment/
COPY apps/user-service/tsconfig.json             apps/user-service/
COPY apps/api-gateway/tsconfig.json              apps/api-gateway/

# Copy source code — backend only, no frontend source
COPY packages/shared-types/src/         packages/shared-types/src/
COPY packages/shared-utils/src/         packages/shared-utils/src/
COPY packages/shared-cache/src/         packages/shared-cache/src/
COPY packages/shared-auth/src/          packages/shared-auth/src/
COPY packages/shared-audit/src/         packages/shared-audit/src/
COPY packages/shared-normalization/src/ packages/shared-normalization/src/
COPY packages/shared-enrichment/src/    packages/shared-enrichment/src/
COPY apps/user-service/src/             apps/user-service/src/
COPY apps/api-gateway/src/              apps/api-gateway/src/

# Prisma schema + generate client
COPY prisma/ prisma/
RUN pnpm exec prisma generate --schema=prisma/schema.prisma

# Build only the api-gateway and all its workspace dependencies.
# The ... suffix tells pnpm to build transitive deps in topological order:
#   shared-types → shared-utils → shared-cache → shared-auth → ...
#   → user-service → api-gateway
# No || true — build failures MUST fail the image.
RUN pnpm --filter @etip/api-gateway... run build

# ── Stage 3: Production (minimal) ─────────────────────────────
FROM node:20-slim AS production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy the workspace structure — pnpm symlinks need it
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules/ ./node_modules/

# Copy only compiled dist + package.json for each backend package
COPY --from=build /app/packages/shared-types/dist/         packages/shared-types/dist/
COPY --from=build /app/packages/shared-types/package.json  packages/shared-types/
COPY --from=build /app/packages/shared-utils/dist/         packages/shared-utils/dist/
COPY --from=build /app/packages/shared-utils/package.json  packages/shared-utils/
COPY --from=build /app/packages/shared-cache/dist/         packages/shared-cache/dist/
COPY --from=build /app/packages/shared-cache/package.json  packages/shared-cache/
COPY --from=build /app/packages/shared-auth/dist/          packages/shared-auth/dist/
COPY --from=build /app/packages/shared-auth/package.json   packages/shared-auth/
COPY --from=build /app/packages/shared-audit/dist/         packages/shared-audit/dist/
COPY --from=build /app/packages/shared-audit/package.json  packages/shared-audit/
COPY --from=build /app/packages/shared-normalization/dist/  packages/shared-normalization/dist/
COPY --from=build /app/packages/shared-normalization/package.json packages/shared-normalization/
COPY --from=build /app/packages/shared-enrichment/dist/    packages/shared-enrichment/dist/
COPY --from=build /app/packages/shared-enrichment/package.json packages/shared-enrichment/
COPY --from=build /app/apps/user-service/dist/             apps/user-service/dist/
COPY --from=build /app/apps/user-service/package.json      apps/user-service/
COPY --from=build /app/apps/api-gateway/dist/              apps/api-gateway/dist/
COPY --from=build /app/apps/api-gateway/package.json       apps/api-gateway/

# Prisma client (generated into node_modules/.prisma)
COPY --from=build /app/prisma/ ./prisma/
COPY --from=build /app/node_modules/.prisma/ ./node_modules/.prisma/
COPY --from=build /app/node_modules/@prisma/ ./node_modules/@prisma/

ENV NODE_ENV=production
ENV TI_API_PORT=3001
ENV TI_API_HOST=0.0.0.0

EXPOSE 3001

# Healthcheck uses node fetch — no curl/wget dependency needed
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

CMD ["node", "apps/api-gateway/dist/index.js"]
