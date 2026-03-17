FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/shared-utils/package.json packages/shared-utils/
COPY packages/shared-cache/package.json packages/shared-cache/
COPY packages/shared-auth/package.json packages/shared-auth/
COPY apps/api-gateway/package.json apps/api-gateway/
COPY apps/user-service/package.json apps/user-service/
RUN pnpm install --frozen-lockfile --ignore-scripts 2>/dev/null || pnpm install --no-frozen-lockfile --ignore-scripts

FROM deps AS build
COPY packages/ packages/
COPY apps/ apps/
COPY prisma/ prisma/
RUN pnpm exec prisma generate --schema=prisma/schema.prisma

FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=build /app/ ./
ENV NODE_ENV=production
ENV TI_API_PORT=3001
ENV TI_API_HOST=0.0.0.0
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD curl -sf http://localhost:3001/health || exit 1
RUN pnpm add -w tsx@4.16.0 2>/dev/null || true
CMD ["npx", "tsx", "apps/api-gateway/src/index.ts"]
