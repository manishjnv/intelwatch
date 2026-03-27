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

### DECISION-018: neo4j-driver in threat-graph only (not a shared package)
**Date:** 2026-03-22 | **Status:** Accepted
**Context:** Building Module 12 (Threat Graph). Neo4j driver needed for Cypher queries. Only graph-service talks to Neo4j.
**Decision:** Add `neo4j-driver` directly to `apps/threat-graph/package.json`. No shared Neo4j package.
**Alternatives:** Create `packages/shared-neo4j` (premature — only one consumer), add to root (pollutes all services)
**Consequences:** If a future service needs Neo4j access (e.g., correlation engine), extract to shared package then. For now, single dependency = simple.

### DECISION-019: No Prisma models for graph data — Neo4j is the store
**Date:** 2026-03-22 | **Status:** Accepted
**Context:** Graph entities (nodes, relationships) could be dual-stored in PostgreSQL + Neo4j, or Neo4j-only.
**Decision:** Neo4j is the sole store for graph data. Prisma only used for potential audit logging. All graph queries use Cypher directly.
**Alternatives:** Dual-store in PostgreSQL + Neo4j (consistency overhead, double writes), PostgreSQL-only with recursive CTEs (poor graph performance)
**Consequences:** Graph data not available via Prisma. If PostgreSQL backup of graph data is needed, add a sync job later. Neo4j backup via `neo4j-admin dump`.

### DECISION-020: Risk propagation is upward-only (never lowers scores)
**Date:** 2026-03-22 | **Status:** Accepted
**Context:** When propagating risk through the graph, should a low-risk node lower the scores of its neighbors?
**Decision:** Propagation only raises scores: `newRisk = max(currentRisk, triggerRisk × weight)`. Never lowers.
**Alternatives:** Bidirectional propagation (complex, can cascade score drops from false positives), average-based (loses high-confidence signals)
**Consequences:** Once a node's score is raised, it stays until manual reset or time-decay. Prevents a single false-positive from cascading downward rescoring across the graph. Score lowering will be manual (analyst action) or via periodic re-evaluation cron.

### DECISION-021: Correlation engine uses alert:read/create permissions (no shared-auth change)
**Date:** 2026-03-23 | **Status:** Accepted
**Context:** Building Module 13 (Correlation Engine). No `correlation:*` permission exists in shared-auth RBAC. Shared-auth is Tier 1 FROZEN and out of scope lock.
**Decision:** Use existing `alert:read` for read endpoints and `alert:create` for write endpoints. Correlations produce alerts, so same access semantics apply. tenant_admin gets `alert:*`, analyst gets `alert:read/create/update`, viewer gets `alert:read`.
**Alternatives:** Add `correlation:*` to shared-auth (requires cross-module change), use `ioc:read` (semantically incorrect — correlations aren't IOCs)
**Consequences:** Correlation endpoints accessible to same roles as alert endpoints. When dedicated `correlation:*` permissions are needed, add them to shared-auth as an additive (backward-compatible) change.

### DECISION-023: api_only role excluded from permission hierarchy
**Date:** 2026-03-23 | **Status:** Accepted
**Context:** Building RBAC permission inheritance in user-management-service. The role hierarchy (viewer→hunter→analyst→admin→super_admin) means higher roles inherit lower role permissions. api_only has `ioc:create` which viewer should NOT inherit.
**Decision:** api_only is a standalone role, not part of the hierarchy chain. Hierarchy is: viewer→hunter→analyst→admin→super_admin. api_only has no parent and no children in the inheritance tree.
**Alternatives:** Include api_only at bottom of hierarchy (viewer inherits ioc:create — wrong), remove ioc:create from api_only (breaks API integrations)
**Consequences:** api_only users get exactly what's defined — no inheritance. Custom roles can still inherit from any named role including api_only if explicitly set.

### DECISION-022: Correlation engine is fully in-memory (no Prisma, no Neo4j driver)
**Date:** 2026-03-23 | **Status:** Accepted
**Context:** Correlation engine stores entity data, correlation results, campaign clusters, feedback, and rule stats. No existing Prisma models for correlation data.
**Decision:** All state lives in JavaScript Maps via `CorrelationStore` class. No `@prisma/client` or `neo4j-driver` dependencies. Follows DECISION-013 pattern (in-memory for Phase 4 validation).
**Alternatives:** Add Prisma models (premature — adds migration complexity before algorithm validation), query threat-graph Neo4j directly (violates DECISION-018 — neo4j-driver stays in threat-graph only)
**Consequences:** State lost on service restart. Acceptable for Phase 4. Fast iteration on algorithms. Tests don't need external databases. Migration path: replace Map operations with Prisma queries when scaling.

### DECISION-024: ETIP pricing — 4-tier Free/Starter/Teams/Enterprise (INR)

**Date:** 2026-03-24 | **Status:** Accepted
**Context:** Previous 4-tier plan (Free/Starter/Pro/Enterprise) had Pro at ₹11,999 as the "most popular" tier but the Pro→Enterprise gap was small. Market research showed every CTI competitor (ThreatConnect, Anomali, Recorded Future, Cyware, ThreatQuotient) is $25K–$250K/year, quote-only. Only Feedly has public pricing at $1,600/mo. No INR-priced CTI platform exists in the Indian market.
**Decision:** 4 tiers — Free (₹0), Starter (₹9,999/mo), Teams (₹18,999/mo), Enterprise (₹49,999/mo). Annual pricing at ~20% discount. Drop Pro tier to remove decision paralysis. Show real Enterprise price (not "Contact Sales" only) to anchor the value gap. Annual pricing: Starter ₹7,999/mo, Teams ₹14,999/mo, Enterprise ₹39,999/mo.
**Alternatives:** Keep 5 tiers including Pro (decision paralysis between Pro/Teams), Enterprise quote-only with no price shown (hides value anchoring), USD pricing (Indian market prefers INR transparency)
**Consequences:** ETIP is 20–33× cheaper than nearest international competitor at every tier. Teams tier (₹18,999) maps to the SMB/mid-market CTI buyer sweet spot. Annual discount incentivizes annual commit. Enterprise price anchors high enough to justify custom SLA/support conversations.

### DECISION-025: React.lazy for D3 bundle optimization
**Date:** 2026-03-24 | **Status:** Accepted
**Context:** D3 contributed ~87KB (minified) to main bundle when ThreatGraphPage and RelationshipGraph (IocListPage) were statically imported. D3 is only needed on /graph route and IOC relations tab — never on initial page load.
**Decision:** Lazy-load ThreatGraphPage via `React.lazy()` in App.tsx. Lazy-load RelationshipGraph in IocListPage.tsx. Use `import type` for GraphNode/GraphEdge to avoid any static module inclusion. Inline `generateStubRelations` (pure function, no D3) directly in IocListPage so the RelationshipGraph module import is 100% dynamic. Wrap both with `<Suspense>` fallbacks (spinner for full page, skeleton div for inline graph).
**Alternatives:** manualChunks in vite.config.ts (works but couples build config to runtime behavior), lazy-load all routes (unnecessary — only D3 is large), dynamic `import('d3')` inside ThreatGraphPage (would require internal refactor, violates "do not touch ThreatGraphPage internals" rule)
**Consequences:** ThreatGraphPage chunk: 36.95KB. RelationshipGraph chunk: 2.37KB. D3 internals chunk: 48.22KB. All three load only when user navigates to /graph or opens IOC relations tab. Rule: any future D3-heavy component must be lazy-loaded — do not statically import from a module that imports d3.

### DECISION-026: Single Docker image for all backend services

**Date:** 2026-03-24 | **Status:** Accepted
**Context:** All 19 backend services share the same Dockerfile (monorepo build) but were built individually in deploy.yml — 20 sequential `docker compose build` calls producing identical images. This wasted ~5min of deploy time on the VPS.
**Decision:** Build one `etip-backend:latest` image via `docker build -t etip-backend:latest .`, add `image: etip-backend:latest` to all backend services in docker-compose.etip.yml. Frontend gets `image: etip-frontend:latest`. Health checks run in parallel (background bash jobs + wait). deploy.yml: 456 → 252 lines.
**Alternatives:** BuildKit parallel build (still runs Dockerfile N times), multi-target Dockerfile per service (over-engineering — services differ only in CMD), registry push/pull (adds complexity, no benefit for single VPS)
**Consequences:** 2 builds instead of 20. Health checks: 60s wall-clock max instead of 20×60s sequential. Rule: when adding a new backend service, add `image: etip-backend:latest` to its docker-compose entry. `build:` section kept for local dev (`docker compose build`).

### DECISION-027: Hybrid persistence — Postgres for business entities, Redis JSON for config
**Date:** 2026-03-26 | **Status:** Accepted
**Context:** 16 ETIP services store ALL state in JavaScript Maps (DECISION-013). Every container restart wipes billing, alerting, RBAC, integration, and BYOK data. Correlation-engine (P1-1) proved Redis checkpoint pattern works. Need a systematic migration.
**Decision:** Hybrid approach: Postgres (via shared Prisma schema) for business entities needing queries/reporting (billing, alerting, reporting, integration, DRP). Redis JSON (via new @etip/shared-persistence package) for config-like data needing restart-survival but not SQL (customization, user-management, hunting). Keep in-memory for TTL caches and rate limiters. Dual-mode stores: constructor takes optional repo/checkpoint — if not provided, falls back to in-memory Maps (backward compatible for tests).
**Alternatives:** All Postgres (80+ models in one schema, impractical), all Redis (no SQL queries for reporting), per-service databases (overkill for single VPS)
**Consequences:** 12-session migration plan (A1 foundation → E1 verification). Billing-service is first migration (session 74). Existing tests run unchanged in in-memory mode. Production uses DB mode via TI_DATABASE_URL env var. Rollback: git tag + feature flag per service.

### DECISION-028: CI-built Docker images — never build on VPS
**Date:** 2026-03-26 | **Status:** Accepted
**Context:** VPS (8GB RAM) running 33 containers (~3-4GB) + tsc -b build (~4-6GB) during deploy = OOM kills, SSH pipe breaks, 15-25min deploy times. Failed deploys in sessions 61, 70, 77, 78 (RCA #43).
**Decision:** Build etip-backend + etip-frontend images in GitHub Actions CI runner (7GB RAM), push to GHCR (ghcr.io). VPS only pulls pre-built images + restarts containers. Deploy pipeline: test → build-images → deploy (pull + compose up).
**Alternatives:** Upgrade VPS to 16GB (solves but costs more), stop containers during build (30s downtime), per-service images (premature optimization)
**Consequences:** Deploy time: 25min → 2m41s. No more VPS OOM during deploy. CI runner handles all compilation. VPS needs GHCR authentication (via GITHUB_TOKEN passed in deploy script). Future: per-service images when independent deploys needed.

---

### DECISION-029: Global Feed Processing + Tenant Overlay Architecture
**Date:** 2026-03-27 | **Status:** ✅ COMPLETE (S89-S97, 9 sessions)
**Context:** Per-tenant feed processing scales linearly: N tenants = N fetches, N normalizations, N AI enrichment calls for same OSINT feed. At 100 tenants = 100x cost ($20/day vs $0.30/day). Industry standard (Recorded Future, Anomali, CrowdStrike) uses global processing + tenant overlay.
**Decision:** Two-layer architecture: (1) Global layer — OSINT feeds in GlobalFeedCatalog, processed once into GlobalArticle/GlobalIoc tables, dedup hash without tenantId, enriched once. (2) Tenant layer — TenantFeedSubscription (which global feeds to see), TenantIocOverlay (custom severity/tags/lifecycle), private feeds remain tenant-isolated. Super admin controls AI model per subtask across 3 categories (news_feed, ioc_enrichment, reporting) with system recommendations and live cost prediction. Plan limits (maxFeeds, retention, etc.) editable by super admin per tier. All new users default to Free plan with auto-subscription to 3 OSINT feeds.
**Alternatives:** (1) Keep per-tenant (doesn't scale), (2) Shared DB with RLS (too complex, Prisma doesn't support RLS natively), (3) Event-driven fan-out (still duplicates storage)
**Consequences:** 7 Prisma models (GlobalFeedCatalog, TenantFeedSubscription, GlobalArticle, GlobalIoc, TenantIocOverlay, GlobalAiConfig, PlanTierConfig). 9 sessions: S89 (schema+catalog+standards), S90 (confidence+AI config+EPSS), S91 (fetch workers+warninglist+ATT&CK), S92 (normalize+enrich+overlay), S93 (wiring+alerts+frontend catalog), S94 (AI config UI+plan limits UI+E2E+seed script), S95 (monitoring dashboard+recovery cron+badges), S96 (fuzzy dedupe+caching+batch+velocity+CWE), S97 (corroboration engine+severity voting+community FP+final polish). ~590 new tests. 27 improvements (12 original + 15 standards). Components: Feed Catalog API (7 routes, 10 OSINT feeds), 5 global fetch workers (RSS/NVD/STIX/REST/MISP) + scheduler, global normalize worker (batch+fuzzy dedupe+warninglist+cache+corroboration+voting), global enrich worker (Shodan+GreyNoise+EPSS), tenant IOC overlay service, alert fan-out, pipeline orchestrator+status API+recovery cron, Bayesian confidence model, STIX 2.1 tiers, NATO Admiralty Code, CPE 2.3 parser, MISP warninglist matcher, ATT&CK weighting, EPSS integration, cross-feed corroboration scoring engine, severity voting system (Admiralty-weighted), community false-positive reporting, velocity score calculator, CWE chain mapper, fuzzy IOC deduplication, Redis caching layer, batch normalizer, Global AI Config, Plan tier limits, 5 frontend pages (Catalog, AI Config, Plan Limits, Monitoring, Overlay Panel), 2 badge components (Admiralty, StixConfidence), activation script+health monitor+runbook. Feature flag: TI_GLOBAL_PROCESSING_ENABLED. Per-tenant cost reduction: ~100x at scale. Full plan: docs/architecture/DECISION-029-Global-Processing-Plan.md
