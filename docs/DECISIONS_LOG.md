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

---

### DECISION-030: Public plan prices — ₹9,999 / ₹18,999 / ₹49,999 monthly
**Date:** 2026-09-23 (S147) | **Status:** Accepted (owner)
**Context:** SEO plan §8 flagged a price conflict before building `/pricing`: docs and billing said ₹9,999/18,999/49,999, but the signup cards (`PlanCards.tsx`) showed ₹7,999/14,999/39,999. Investigation showed the smaller figures are the **annual-billing per-month rate**. Billing-service `plan-store.ts` and the prisma plan seeds already charge the monthly list prices, and the seeds' annual prices (95,988 / 179,988 / 479,988) are exactly 12 × the annual rate. `PlanCards` showed the annual rate as the headline without saying "billed annually".
**Decision:** Public list prices are the **monthly** prices: Starter ₹9,999, Teams ₹18,999, Enterprise ₹49,999 (Free ₹0). The annual option is shown as secondary text: ₹7,999 / ₹14,999 / ₹39,999 per month billed annually (save 20% / 21% / 20%). INR only (SEO plan §8).
**Alternatives:** Headline the annual rate everywhere (lower anchor price, but it doesn't match what a monthly customer is charged and misleads unless clearly labelled).
**Consequences:** `PlanCards.tsx` relabelled, guarded by `plan-cards-pricing.test.ts`. **No billing, seed or charge changes.** `/pricing` and priced JSON-LD Offers use these numbers. Known leftover: demo-only annual figures in `use-plan-builder.ts` (99,999 / 189,999 / 499,999) differ from the seeds. They're only shown in demo fallback mode; clean up when that file is next touched.

### DECISION-031: No trials — Free is self-serve, every paid plan is sales-led
**Date:** 2026-09-23 (S147) | **Status:** Accepted (owner) | **Supersedes:** the reverse-trial proposal in docs/FREE_TRIAL_REVIEW_AND_PLAN.md
**Context:** The free-trial review found that trials never expired (nothing read `trialEndsAt`, so a paid signup meant permanent free paid access), that there was no working self-serve payment path, and that "Extend Trial" edited only an in-memory registry. There are no paying customers yet, and a read-only VPS check showed **zero** trialing tenants.
**Decision:** Remove the trial concept. Every registration creates a **Free, active** tenant; `plan` in the register request is ignored. Paid plans (monthly or annual) are **Contact sales** everywhere: pricing page, signup cards, invite onboarding, Billing page and Command Center. After payment or invoice, a super admin applies the plan with api-gateway `POST /api/v1/billing/upgrade` (runbook: docs/runbooks/SET_TENANT_PLAN.md). The `trialEndsAt` column and the `'trialing'` status value stay in the schema, unused.
**Alternatives:** reverse trial with auto-downgrade (more moving parts: expiry job, notifications, payment path, migration); card-upfront trial (needs Razorpay e-mandates).
**Consequences:** Users can't try paid-only features before buying; sales can grant a plan by hand when needed. The register-domain guard is gone, which also closes its information-leak and public-mail blocking problems. Self-serve checkout (Razorpay) is future work and will need its own decision.
**2026-09-26:** owner reaffirmed — Razorpay/self-serve checkout deferred; not on the active plan.

### DECISION-033: IOC search index — tenant rows only now (option A), shared global index later (option B)
**Date:** 2026-09-26 (S151) | **Status:** Accepted on Claude's recommendation; owner to confirm (the owner steered S151 to Step 2 without objecting) | **Spec:** docs/roadmap/STEP_02_SEARCH_INDEX.md §4, §12
**Context:** Elasticsearch has 0 IOC docs while Postgres `iocs` has ~12k rows. The index producers are broken or missing (spec §3.1). Global processing (`TI_GLOBAL_PROCESSING_ENABLED`) is off in production, so every IOC today is a tenant `iocs` row.
**Decision:** (A) Index tenant `iocs` rows only, into `etip_<tenant>_iocs_<category>`. Global IOCs are not searchable until option B (one shared `etip_global_iocs_*` index, filtered by the tenant's feed subscriptions, overlay applied after the query) ships on the day global processing is turned on. The subscription filter that `getIocsForTenant` is missing (§3.6) is fixed together with B. Supporting calls: the document/job contract lives once in `packages/shared-utils/src/search-index.ts` (3+ producers, so no copies); the api-gateway backfill reads `iocs` with Prisma directly (precedent: `routes/public/iocs.ts`); search hides `revoked` and `false_positive` by default (`includeInactive=true` shows them); archived IOCs stay searchable with `archived: true`. The LOCKED ⌘K data block in `DashboardLayout.tsx` is edited in S156 (fetch/auth/shape only; the shared-ui component is unchanged).
**Alternatives:** (C) Copy each global IOC into every subscribed tenant's index. Rejected: it brings back the N× cost that DECISION-029 removed.
**Consequences:** Rollout is 7 sessions (S151–S157, spec §11): consumer first, then producers, backfill and UI. The search route must take the tenant from the JWT (S152) **before** any backfill. Postgres stays the source of truth; the index can be deleted and rebuilt at any time.

---

### DECISION-034: One folder, one session — no git worktrees, branch per task
**Date:** 2026-09-26 (S150c) | **Status:** Accepted (owner) | **Supersedes:** the worktree-per-session design in the original PR #42 / `docs/roadmap/STEP_00_DEV_WORKFLOW.md`
**Context:** Two parallel Claude sessions collided in `E:\code\IntelWatch` today — an owner session found another session's branch plus uncommitted files sitting in the checkout. The worktree-per-session flow (`scripts/new-worktree.sh`, one `E:\code\IntelWatch-wt\<name>` folder per session) adds a folder and a separate `node_modules` per session and was the source of the confusion, not the fix for it.
**Decision:** Work only in `E:\code\IntelWatch`; no git worktrees; one Claude session at a time; branch per task (`git switch -c sNNN/<task>` from an up-to-date `master`); one deployer merges one PR at a time; docs-only commits may go straight to `master`. PR #42 was rewritten (commit `b9bc62c`) to match: `scripts/new-worktree.sh` deleted, `/session-start` step 0a does a workspace check (`git status -sb`, `git worktree list`) before any edit, `/session-end` does post-merge cleanup (`git switch master && git pull --ff-only && git branch -d`) instead of worktree removal.
**Alternatives:** Worktree per session (PR #42 original) — rejected: extra folders, per-worktree `node_modules`, and it did not prevent the collision it was meant to prevent.
**Consequences:** No parallel sessions going forward. Session start now stops if the folder has uncommitted tracked changes that aren't this session's own work. Detail and exact commands: `docs/S150c_ONE_FOLDER_WORKFLOW.md`. Rollback: revert `b9bc62c` on the PR #42 branch.

---

### DECISION-035: FeatureGate locks a page only on an explicit `enabled:false`
**Date:** 2026-09-26 (S161a) | **Status:** Accepted (owner, option A) | **Spec:** `docs/roadmap/STEP_05_HONEST_UI.md` §3.3
**Context:** Step 5 removes demo data on API errors. `useFeatureLimits` used to substitute `DEMO_LIMITS` (12 features unlocked, random usage) whenever `/billing/limits` failed or returned an empty list. FeatureGate wraps core routes (`/iocs`, `/search`, graph, hunting, DRP, correlation, actors, malware, vulnerabilities), and `useFeatureEnabled` treated a missing entry as locked while the sidebar (`DashboardLayout.tsx:169`) treated it as unlocked.
**Decision:** `useFeatureEnabled` = `entry?.enabled ?? true`. A page is locked only when the plan explicitly says `enabled:false`; on a fetch error or a missing entry the page loads. FeatureGate renders nothing while limits are loading (the Upgrade CTA used to flash).
**Alternatives:** Fail closed with "Couldn't check your plan — Retry" (option B) — rejected: any billing-limits outage would wall off the IOC page for every tenant.
**Consequences:** Seeded plans (`prisma/seeds/plan-definitions.ts`) list every feature key explicitly, so no seeded plan gains access; the default only matters on errors or unseeded plans. Frontend gating is a UX hint — plan enforcement belongs on the server. Detail: `docs/S161a_HONEST_UI_CORE.md`.

---

### DECISION-036: Ship PR B honest-UI now, fix billing/admin path+shape mismatches in S163
**Date:** 2026-09-27 (S161a PR B) | **Status:** Accepted (owner) | **Spec:** `docs/S161a_PR_B_HONEST_UI_BILLING_USERS.md`
**Context:** Converting `use-phase6-data.ts`/`use-phase5-data.ts`/`use-plan-builder.ts` from silent demo fallback to throw-on-failure (Step 5, same pattern as DECISION-035/PR A) exposed real, pre-existing mismatches between the frontend and several billing/admin routes that a demo fallback had been hiding: `GET /billing/plans` sends `priceInr`/`priceUsd` where the frontend type expects `price`; `GET /billing/usage` sends a flat snake_case shape where the frontend expects a nested one; `GET /billing/subscription` (singular) 404s — only the plural `/billing/subscriptions` exists; `GET /billing/stats` and `GET /admin/stats` have no route at all. None of these are bugs introduced by this PR — they were always broken, just invisible behind fake data.
**Decision:** Merge and deploy PR B as-is. Tenant `/billing` shows error cards for Plans/Usage and `—` stat tiles until S163 fixes the paths/shapes. Users screens show "Not available yet" (404) until S162 adds the real routes — the same stance already taken for Users in this same PR.
**Alternatives:** Hold the merge until S163 lands the backend fixes (delays all of PR B's honest-UI gains behind unrelated backend work); add a partial `priceInr → price` frontend adapter now (papers over one mismatch while leaving the others, and risks masking the next one the same way demo data did).
**Consequences:** Tenant-facing billing screens show visible error/empty states in production until S163 — acceptable with no paying customers yet (`feedback_functional_first.md`). S163 owns the full set of fixes in one pass rather than a series of one-off patches. Same reviewable precedent as the Users 404 stance already accepted in PR A/B.

---

### DECISION-037: User directory served from Prisma; tenant only from nginx-verified header; sessions list scoped to the current user
**Date:** 2026-09-27 (S162) | **Status:** Accepted
**Context:** `UserManagementPage` called `/users`, `/users/stats`, `/users/audit` on user-management-service, none of which existed — the screens 404'd (DECISION-036 shipped them honest with "Not available yet"). The service had team/RBAC data in-memory but no real Prisma-backed user list, and no route took the tenant from a verified source.
**Decision:** New `src/routes/directory.ts`: `GET /users` (paginated, role/status/search filters), `GET /users/stats`, `GET /users/audit`, all querying Prisma directly and scoped to `x-tenant-id` as set by nginx after JWT verification (never trusted from the client; missing header → 401). Sessions list stays scoped to the current user via the existing gateway `/auth/sessions` route — a tenant-wide session list would need a new gateway route, and the gateway is frozen (Tier 1). Teams/Invite/Create Role stay hidden in the UI until they have a DB-backed store.
**Alternatives:** Add a tenant-wide sessions-list route now (rejected — gateway is Tier 1 frozen, out of scope for this session); trust a client-supplied tenant id (rejected — same class of bug DECISION-034/Step 0B already closed elsewhere).
**Consequences:** Users screen shows real directory data; Teams/Invite/Create Role remain honestly hidden, not faked. 21 new tests. Detail: `docs/S162_USER_MANAGEMENT_ROUTES.md`.

### DECISION-038: Enrichment gating — severity gate, separate free-lookup and AI gates, per-tenant AI budget, fail closed
**Date:** 2026-09-28 (S164) | **Status:** Accepted
**Context:** `ai-enrichment` had no per-IOC `GET` endpoint (the frontend already called one that 404'd) and no policy for when to spend AI budget automatically. Global `TI_ENRICHMENT_DAILY_BUDGET_USD` existed but was hardcoded to `5.00` regardless of the env var, and an all-null provider result could overwrite a previously good enrichment.
**Decision:** Auto-enrichment only fires for `critical`/`high` severity IOCs (`TI_ENRICHMENT_AUTO_SEVERITIES`); a manual `/trigger` call bypasses the severity gate. Free provider lookups (VT/AbuseIPDB/GSB) are gated separately from AI via `TI_ENRICHMENT_LOOKUPS_ENABLED` (default true). AI calls are gated by the existing `TI_AI_ENABLED` master switch (compose default false) plus a new per-tenant Redis daily-budget counter (`services/tenant-budget.ts`) seeded from plan AI defaults mirrored from the customization service; on a Redis error the gate fails closed (no AI call) rather than open. New `GET /api/v1/enrichment/ioc/:iocId`. A no-provider-results response no longer overwrites existing good enrichment data.
**Alternatives:** Cross-service live plan-config lookup at enrichment time (rejected — violates the module-boundary rule, adds a synchronous cross-service call on the enrichment hot path); in-memory budget counter (rejected — resets on every restart, defeats the point of a daily cap).
**Consequences:** AI spend stays off by default and, when on, is capped both globally and per tenant. The plan-AI-defaults mirror is a snapshot, not live — a runtime edit in customization doesn't propagate to the mirror (tracked as a follow-up, not fixed here). Detail: `docs/S164_AI_ENRICHMENT_AUTO_ENRICH.md`.

### DECISION-039: Step 15 v2 — "Threat Exposure & Detection Posture" replaces the v1 SIEM-integrations plan
**Date:** 2026-09-28 | **Status:** Accepted (owner) | **Supersedes:** Step 15 v1 (`3dd4f19`)
**Context:** The original Step 15 plan was a SIEM-integrations checklist (connect Splunk/Sentinel/etc., push/pull data). Market research on competitor "detection posture" products showed the value customers actually pay for is an answer to "am I affected by this threat and am I detecting it," not just a pipe to their SIEM.
**Decision:** Rebuild Step 15 around a provider flow: ingest → master DB → relevance → deliver → assess → advise → track, producing a per-threat "Am I safe?" verdict card, with basic customer advisories in the P2 MVP. SIEM connections are categorized by purpose (push data in, pull sightings out, coverage/rule-mapping) rather than being the end goal themselves.
**Alternatives:** Keep v1's connector-checklist framing (rejected — ships integrations without the assessment/advisory layer that makes them useful to a customer).
**Consequences:** P2 MVP work is gated on 7 owner architecture decisions (new `exposure-service` vs. extending existing services; org-profile ownership; asset/vuln-scanner data ownership; sightings ownership; rule→technique mapping ownership; posture-widget cache-TTL exception to the 48hr dashboard constant; new `/exposure` top-level route vs. folding into Command Center) — see `docs/roadmap/STEP_15_ARCHITECTURE_UI.md` §11. Detail: `docs/research/SIEM_POSTURE_MARKET_RESEARCH.md`, `docs/roadmap/STEP_15_ARCHITECTURE_UI.md`.

### DECISION-040: Every tenant-supplied outbound integration destination goes through safeFetch; connector secrets encrypted at rest
**Date:** 2026-09-28 (S166 PR A) | **Status:** Accepted | **RCA:** Issue 47
**Context:** integration-service called tenant-supplied SIEM/webhook/ticketing URLs with plain `fetch` and only `z.string().url()` validation — an SSRF path to internal/private addresses and cloud metadata endpoints — and stored connector secrets unencrypted despite an existing AES-256-GCM class used only by credential rotation.
**Decision:** New `src/utils/safe-fetch.ts`, stdlib only (no undici) — validates the destination is public inside the socket DNS lookup itself (closes the TOCTOU window a pre-connect check would leave open), covers IPv4/IPv6 special-use ranges including mapped/compat/NAT64/6to4, disallows redirects, enforces an idle timeout and a total deadline, and caps the response body at 1 MB. Applied to all 11 outbound call sites. Connector secrets are encrypted at rest with an `enc:v1:` marker (a client-supplied value already carrying that marker is rejected, closing a spoofing path). A dev-only escape hatch (`TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS`) is refused outright when `TI_NODE_ENV=production`.
**Alternatives:** A pre-connect DNS check only (rejected — classic TOCTOU: DNS can re-resolve to a private address between the check and the actual connection); a third-party SSRF-guard library (rejected — Simplicity Rule, stdlib covers it in this case).
**Consequences:** Every future service that calls a tenant-supplied URL must use a safeFetch-style client — Step 9's connector SDK should own a shared one instead of each service reimplementing it. 430 integration-service tests (was 174) added `tests/safe-fetch.test.ts` (81 cases). Detail: `docs/S166_PR_A_INTEGRATION_OUTBOUND_HARDENING.md`.

### DECISION-041: Integration connectors persisted to Postgres via write-through cache
**Date:** 2026-09-28 (S166 PR B) | **Status:** Accepted
**Context:** integration-service kept every SIEM/webhook/ticketing connector config in an in-memory Map (DECISION-013 pattern) — wiped on every deploy, meaning a tenant's real connectors vanished on every CI/CD push.
**Decision:** New Postgres `Integration` table. Writes go to the DB first, then the in-memory cache (DB failure → 503, cache never gets ahead of the source of truth); on startup, the service hydrates its cache from the DB with retry. Logs, DLQ, and rate-limiter state stay in memory for now — only connector configuration itself needed to survive a restart.
**Alternatives:** Redis JSON store (DECISION-027's config-like-data lane) — rejected here because connectors need relational queries (list by tenant, filter by type) that Redis JSON doesn't give for free; full migration of logs/DLQ too (rejected — out of scope, no evidence yet that losing in-memory logs on restart is a real problem for anyone).
**Consequences:** Connectors now survive deploys. Logs/DLQ/rate-limit state loss on restart is a known, accepted gap, not a regression — it was already true before this change.

### DECISION-042: Server-side RBAC is mandatory on every authenticated mutating route — UI hiding is never access control
**Date:** 2026-09-28 (S167) | **Status:** Accepted | **RCA:** Issue 48
**Context:** integration-service and user-management-service routes checked authentication only, not role — any authenticated tenant user including `analyst` could create/modify SIEM connectors or mint public API keys via a direct API call, even though the UI already hid those controls from analysts. The shared `hasPermission` map in `@etip/shared-auth` already defined the right permissions per role; nothing on these routes consulted it.
**Decision:** `requirePermission()` (fail closed on a missing/unknown role) is now required on every authenticated route in integration-service (`integration:read/create/update/delete` by operation) and on user-management-service's API-key routes (`settings:update` for create/revoke, `settings:read` for list). Ticket routes use `alert:*` permissions, not `integration:*` — analysts are expected to raise tickets into an admin-configured ticketing integration, so that's analyst-level work, not admin-level. TAXII discovery stays unauthenticated by design (it's a public discovery endpoint per the TAXII 2.1 spec).
**Alternatives:** Rely on the frontend hiding the controls (rejected — that's exactly the gap this RCA closes; UI hiding was never a security boundary).
**Consequences:** A route-permission coverage test (iterate every registered route per service, fail if an authenticated one lacks a permission preHandler) is a recommended follow-up, not yet built. integration-service 455 tests, user-management-service 371 tests. Detail: `docs/S167_API_KEYS_PANEL_AND_ROLE_ENFORCEMENT.md`.

### DECISION-043: Frontend build-time config the server depends on must be a CI build input with a build-time assertion
**Date:** 2026-09-28 (S168) | **Status:** Accepted | **RCA:** Issue 50
**Context:** Sign-up was completely broken in production — the gateway enforced Cloudflare Turnstile (`TI_TURNSTILE_SECRET` set in the VPS `.env`), but the CAPTCHA widget only renders when the frontend is *built* with `VITE_TURNSTILE_SITE_KEY`. Since frontend images moved to CI builds (RCA #43, GHCR), the CI workflow built the image without that build arg — the key existed only in a `.env` file CI never reads — so every production bundle shipped demanding a token it could never obtain.
**Decision:** `VITE_TURNSTILE_SITE_KEY` (and any future `VITE_*` value the server-side config depends on) is stored as a GitHub repository **variable** (public by design — it's a site key, not a secret) and passed as a Docker build arg; the CI build step fails outright if the variable is empty or if the key string is not actually present in the built image (`grep` inside the image after build). This is checked in CI, not just documented as a deploy step.
**Alternatives:** Document "remember to set the build arg" as a deploy runbook step (rejected — this exact class of drift is why the bug happened; a runbook step with no enforcement will silently rot again).
**Consequences:** Any future `VITE_*`-gated server behavior needs the same build-input + build-time-assertion pattern, not just a VPS `.env` entry. Post-deploy owner checks should include one real sign-up attempt going forward. Detail: `docs/S168_SIGNUP_CAPTCHA_FIX.md`.
