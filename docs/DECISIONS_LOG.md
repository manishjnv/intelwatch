# ETIP Architectural Decisions Log

**Rule:** Every non-trivial decision gets logged with rationale.
**Rule:** Claude must check this before proposing alternatives to established choices.
**Rule:** Update via /session-end when decisions are made.

---

### DECISION-001: BullMQ over Kafka for event queues
**Date:** 2026-02-15 | **Status:** Accepted
**Context:** Needed async job processing for ingestion pipeline
**Decision:** Use BullMQ with Redis
**Alternatives:** Kafka (too heavy for single VPS with 8GB RAM), RabbitMQ (extra infrastructure)
**Consequences:** All queues through Redis. Queue names canonical in shared-utils/queues.ts. Single point of failure mitigated by Redis persistence + snapshots.

### DECISION-002: tsc -b over pnpm -r build
**Date:** 2026-03-10 | **Status:** Accepted
**Context:** Parallel pnpm builds caused race conditions where shared-auth started before shared-types produced .d.ts files (RCA #19-21)
**Decision:** Use `tsc -b --force tsconfig.build.json` for all backend compilation
**Alternatives:** pnpm -r build with topological sort (unreliable in Docker), nx build (too complex for current scale)
**Consequences:** Build order is deterministic via project references. All packages need composite:true in tsconfig.json. Root tsconfig.build.json must list all packages in dependency order.

### DECISION-003: node:20-slim over Alpine for Node stages
**Date:** 2026-03-08 | **Status:** Accepted
**Context:** Alpine breaks Prisma binary, bcrypt native addon, and other glibc-dependent packages (RCA #7)
**Decision:** node:20-slim (Debian) for all Node build and production stages
**Alternatives:** node:20-alpine (50MB smaller but native dep failures), distroless (no shell for debugging)
**Consequences:** Slightly larger images (~150MB vs ~50MB). Zero native dependency issues. curl available via apt-get for healthchecks.

### DECISION-004: Full COPY in production Dockerfile stage
**Date:** 2026-03-12 | **Status:** Accepted
**Context:** Selective COPY of individual dist/ directories breaks pnpm workspace symlinks (RCA #23). External deps like zod, fastify can't resolve.
**Decision:** `COPY --from=build /app/ ./` — copy entire /app from build stage
**Alternatives:** Selective copy per package (smaller image but broken runtime), pnpm deploy (not yet supported well enough)
**Consequences:** Larger production image. Acceptable tradeoff. Revisit when migrating to pnpm deploy or image-based deploys.

### DECISION-005: Fastify over Express
**Date:** 2026-01-20 | **Status:** Accepted
**Context:** API gateway needs high throughput with built-in schema validation
**Decision:** Fastify 4.x with plugin architecture
**Alternatives:** Express (slower, needs express-validator), Koa (smaller ecosystem), Hono (too new)
**Consequences:** All routes use Fastify plugin pattern. Schema validation at route level. All middleware as Fastify hooks/preHandlers.

### DECISION-006: Caddy external network auto-join via compose
**Date:** 2026-03-14 | **Status:** Accepted
**Context:** etip_nginx needs to be reachable by Caddy (which runs in ti-platform_default network)
**Decision:** Declare caddy_network as external in docker-compose.etip.yml pointing to ti-platform_default
**Alternatives:** Manual docker network connect (fragile, breaks on recreate)
**Consequences:** etip_nginx auto-joins Caddy's network on compose up. After nginx recreate, only docker restart ti-platform-caddy-1 needed.

### DECISION-007: Monorepo with pnpm workspaces
**Date:** 2026-01-15 | **Status:** Accepted
**Context:** 20+ services need shared types, auth, utils with type safety across boundaries
**Decision:** pnpm workspaces with @etip/ scope for all packages
**Alternatives:** Multi-repo (deploy coordination nightmare), npm workspaces (slower, no strict mode), turborepo (extra dependency)
**Consequences:** Single lockfile. Workspace protocol for internal deps. All services share types at compile time.

### DECISION-008: ESLint 8 classic config
**Date:** 2026-02-20 | **Status:** Accepted
**Context:** ESLint 9 flat config has compatibility issues with several plugins
**Decision:** Stay on ESLint 8 with .eslintrc.json classic config
**Alternatives:** ESLint 9 flat config (plugin compatibility issues at time of decision)
**Consequences:** Classic config at root. Will migrate to flat config when plugin ecosystem catches up. @typescript-eslint v7.
