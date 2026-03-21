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

### DECISION-009: claude-opus-4-6 with extended thinking as project model
**Date:** 2026-03-20 | **Status:** Accepted
**Context:** Need consistent, highest-quality model for complex multi-module implementation sessions
**Decision:** Set `model: claude-opus-4-6` + `alwaysThinkingEnabled: true` in .claude/settings.json (project-scoped)
**Alternatives:** claude-sonnet-4-6 (faster, cheaper but less capable for architecture decisions), per-session model selection (inconsistent)
**Consequences:** All Claude Code sessions in this project use Opus 4.6 with extended thinking by default. Higher token cost per session but better architectural reasoning.

### DECISION-010: Secrets stored in .claude/settings.local.json + .claude/secrets/
**Date:** 2026-03-20 | **Status:** Accepted
**Context:** GH_TOKEN and SSH private key were hardcoded in skills/00-CLAUDE-INSTRUCTIONS.md (committed to git). Credentials exposed in git history.
**Decision:** Move all secrets to gitignored locations: env vars in .claude/settings.local.json, SSH key file in .claude/secrets/deploy_key. Reference by env var name in all docs.
**Alternatives:** .env file (not automatically available to Claude Code sessions), OS keychain (not portable across machines)
**Consequences:** .claude/settings.local.json and .claude/secrets/ are gitignored. Claude Code sessions have secrets available via $ENV_VAR. Credentials rotated after exposure. Git history purge still pending.

### DECISION-011: /session-start loads module-specific skill files from skills/ folder
**Date:** 2026-03-20 | **Status:** Accepted
**Context:** The .claude/skills/ (2 native skills) and skills/ (25+ spec docs) were disconnected — module specs never loaded automatically, causing Claude to miss pipeline integration rules and UI requirements.
**Decision:** Updated /session-start command to explicitly load skills/00-CLAUDE-INSTRUCTIONS.md, skills/00-MASTER.md, and the module-specific skills/XX-MODULE.md for the declared target module each session.
**Alternatives:** Merge skills/ into .claude/skills/ as native skills (too large, would bloat context), rely on CLAUDE.md only (insufficient detail for module-level specs)
**Consequences:** Every session starts with full context: core rules + module spec + scope lock. docs/SESSION_TEMPLATE.md provides copy-paste prompts for all scenarios.

### DECISION-012: Ingestion service follows api-gateway Fastify pattern
**Date:** 2026-03-20 | **Status:** Accepted
**Context:** Building first Phase 2 microservice. Needed to decide whether to reuse the api-gateway's Fastify pattern or adopt a different architecture.
**Decision:** Mirror the api-gateway pattern exactly: Fastify + helmet/cors/rate-limit/sensible, Pino logger, Zod validation, AppError error handler, JWT auth via shared-auth, RBAC preHandlers.
**Alternatives:** Express (slower), standalone workers only (no HTTP API), gRPC (overkill for internal service)
**Consequences:** Consistent patterns across all services. Same middleware, same error handling, same auth. New services can copy the ingestion template.

### DECISION-013: 6 competitive improvement modules as in-memory services
**Date:** 2026-03-20 | **Status:** Accepted
**Context:** Implementing corroboration, triage feedback, dedup, reliability scoring, context extraction, cost tracking. Needed to decide between DB-backed state vs in-memory state.
**Decision:** All 6 modules use in-memory state (Maps/Sets) for Phase 2. Will migrate to DB-backed persistence when deploying as production containers with horizontal scaling.
**Alternatives:** DB-backed from day one (premature — adds Prisma migration complexity before validating the algorithms), Redis-backed (extra dep coupling)
**Consequences:** Fast iteration on algorithms. Tests don't need DB. Trade-off: state lost on service restart. Acceptable for Phase 2 validation. Migration to DB is straightforward — replace Map with Prisma queries.

### DECISION-014: 3-signal confidence weights (drop communityVotes)
**Date:** 2026-03-21 | **Status:** Accepted
**Context:** communityVotes signal was always 0 in calculateCompositeConfidence, wasting 20% of weight. No community voting system exists yet.
**Decision:** Redistribute to 3 signals: feedReliability 0.35, corroboration 0.35, aiScore 0.30. communityVotes kept as optional field (default 0) for backward compat.
**Alternatives:** Keep 4 signals and wire to analyst feedback (premature — no analyst UI yet), remove communityVotes entirely (breaks ingestion callers)
**Consequences:** Full confidence formula weight now used. Backward compatible — ingestion code that passes communityVotes still works. When analyst feedback UI ships, re-add as 4th signal.

### DECISION-015: Type-specific IOC confidence decay rates
**Date:** 2026-03-21 | **Status:** Accepted
**Context:** All IOC types decayed at e^(-0.01 * days). But hashes are permanent artifacts (SHA-256 never changes), while IPs change hands quickly (cloud, DHCP).
**Decision:** Per-type decay rates: hash 0.001 (near-permanent), IP 0.05 (14-day half-life), domain 0.02, URL 0.04, CVE 0.005. Stored in IOC_DECAY_RATES lookup table in shared-normalization.
**Alternatives:** Single decay rate with per-type multiplier (less clear), no decay for hashes (not mathematically correct for very old IOCs)
**Consequences:** IP IOCs lose relevance 50x faster than hash IOCs. Reduces false positive rate on recycled IP infrastructure. No competitor implements type-aware decay.

### DECISION-016: AI Enrichment via external APIs only (no Claude AI in Phase 2)
**Date:** 2026-03-21 | **Status:** Accepted
**Context:** Building Module 06. Skill file specifies Claude AI enrichment, but AI budget controls and prompt templates are not ready.
**Decision:** Phase 2 enrichment uses VirusTotal + AbuseIPDB only. Claude AI analysis deferred to Phase 3 when admin AI controls and budget UI are built.
**Alternatives:** Include Claude from day one (risk: no budget controls → runaway costs), skip enrichment entirely (no external validation)
**Consequences:** Enrichment service is functional without Claude dependency. VT + AbuseIPDB provide immediate value. Claude integration is additive — add provider without structural changes. TI_AI_ENABLED gate already in place.

### DECISION-017: In-memory rate limiting for external API providers
**Date:** 2026-03-21 | **Status:** Accepted
**Context:** VT free tier = 4 req/min, AbuseIPDB = 1000 req/day. Need to enforce limits to avoid API key revocation.
**Decision:** Sliding-window rate limiter in-memory per provider. Configurable via TI_VT_RATE_LIMIT_PER_MIN and TI_ABUSEIPDB_RATE_LIMIT_PER_DAY env vars.
**Alternatives:** Redis-backed rate limiter (survives restarts but adds coupling), token bucket (more complex, unnecessary for 2 providers)
**Consequences:** Rate limits reset on service restart. Acceptable for single-instance deployment. Migrate to Redis-backed when horizontal scaling.
