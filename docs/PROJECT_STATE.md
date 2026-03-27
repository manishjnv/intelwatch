# ETIP Project State
**Last updated:** 2026-03-27 (update at end of EVERY session via /session-end)
**Session counter:** 91 — DECISION-029 Phase B1: Global Fetch Workers, MISP Warninglists, ATT&CK Weighting

## Deployment Status
| Service | Status | Version | Last Deploy | Notes |
|---------|--------|---------|-------------|-------|
| etip_api | ✅ Running | 0.1.1 | 2026-03-27 | Health check passing. **Session 85:** Tiered rate limiting (search 10/write 30/read 120), error alerting (5-min window, QUEUE_ALERT), @fastify/compress (gzip >1KB), GET /api/v1/gateway/error-stats. 59 tests. |
| etip_frontend | ✅ Running | 0.12.2 | 2026-03-27 | Dashboard + 20 data pages. **Session 86:** Fix 14 TS errors, notifyApiError wired to 7 hooks, useDebouncedValue on 3 pages, TableSkeleton on 2 pages. 794 tests (796 total, 2 skipped). |
| etip_es_indexing | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3020. Module 20. Elasticsearch IOC indexing. 57 tests. BullMQ worker + full-text search + aggregations. esConnected=true, queueDepth=0. RCA #42: BullMQ colon restriction fixed. |
| etip_nginx | ✅ Running | - | 2026-03-25 | Reverse proxy for ti.intelwatch.in. Routes: graph(3012), correlation(3013), hunting(3014), drp(3011), es-indexing(3020), reporting(3021), alerting(3023), analytics(3024), caching(3025). |
| etip_postgres | ✅ Running | 16 | 2026-03-15 | Schema migrated, RLS enabled |
| etip_redis | ✅ Running | 7 | 2026-03-15 | Cache + BullMQ queues |
| etip_ingestion | ✅ Running | 0.6.1 | 2026-03-27 | Feed pipeline + 11 modules + policies + AC-2 + **all 5 connectors** + **Session 78: feed quota enforcement** + **Session 84: scheduler retry (exponential backoff 30s→5min, circuit breaker for customization-client)**. 502 tests. |
| etip_normalization | ✅ Running | 0.1.0 | 2026-03-25 | IOC upsert + 18 accuracy improvements + G2/G4b gap fixes. 157 tests. Feed reliability TTL cache (5min); weighted velocity scoring; configureClassifier(); unknownTypeCount stats in GET /stats (P2-1). |
| etip_enrichment | ✅ Running | 0.3.0 | 2026-03-22 | VT + AbuseIPDB + Haiku AI triage. 15/15 accuracy improvements. 5 endpoints + batch API. Prompt caching, cost persistence, re-enrichment scheduler. |
| etip_ioc_intelligence | ✅ Running | 0.1.0 | 2026-03-25 | Port 3007. 16 endpoints, 13 accuracy improvements, 138 tests. PUT /:id/lifecycle added (P0-4): LIFECYCLE_TRANSITIONS FSM (watchlisted state), transitionLifecycle(), FP propagation. |
| etip_threat_actor_intel | ✅ Running | 0.1.0 | 2026-03-21 | Port 3008. 28 endpoints, 15 accuracy improvements |
| etip_malware_intel | ✅ Running | 0.1.0 | 2026-03-21 | Port 3009. 27 endpoints, 15 accuracy improvements |
| etip_vulnerability_intel | ✅ Running | 0.1.1 | 2026-03-27 | Port 3010. 28 endpoints, 15 accuracy improvements. **Session 90:** EPSS client + refresh cron. 131 tests. |
| etip_threat_graph | ✅ Deployed | 2.0.0 | 2026-03-24 | Port 3012. Neo4j knowledge graph. 32 endpoints, 20 improvements (#1-20), 294 tests. |
| etip_correlation | ✅ Deployed | 0.1.1 | 2026-03-25 | Port 3013. 20 endpoints, 15/15 improvements + P1-1 Redis persistence, 179 tests. store-checkpoint.ts: 6 store Maps persisted to Redis (5s debounce, 7-day TTL), restored on startup. Deployed session 67. |
| etip_hunting | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3014. 47 endpoints, 15/15 improvements, 222 tests. |
| etip_drp | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3011. 36 endpoints, 310 tests. |
| etip_integration | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3015. 24 endpoints, 174 tests. SIEM + webhooks + ticketing + STIX/TAXII. |
| etip_user_management | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3016. 32 endpoints, 185 tests. RBAC + teams + SSO + MFA + break-glass. |
| etip_customization | ✅ Deployed | 0.4.0 | 2026-03-27 | Port 3017. 58 endpoints, 319 tests. Module toggles + AI model selection + risk weights + dashboard customization + notification preferences. F2 + F3 + BYOK + Feed Quotas. **Session 90:** Global AI Config (6 routes) + Plan Limits (2 routes) + CostPredictor. |
| etip_onboarding | ✅ Deployed | 0.3.0 | 2026-03-26 | Port 3018. 32 endpoints, 241 tests. Setup wizard (Redis-backed), demo seeder. **Session 78: Free-tier default** — seeds 3 feeds (THN, CISA RSS, NVD) instead of 10. seedUpgradeFeeds() for plan upgrades. freeTier flag on all 10 DEFAULT_FEEDS. |
| etip_billing | ✅ Deployed | 0.3.0 | 2026-03-27 | Port 3019. 28 endpoints, 190 tests. Plan management, usage metering, Razorpay billing, GST invoices, upgrade/downgrade, coupon codes. **Session 83: All 3 remaining stores (Usage, Invoice, Coupon) wired to Prisma** — dual-mode with in-memory fallback. 21 new tests. |
| etip_admin | ✅ Deployed | 0.5.0 | 2026-03-27 | Port 3022. 35 endpoints, 195 tests. Queue monitor + DLQ processor + P2-1 queue alerting. **Session 83: 10s response cache on GET /queues** — reduces Redis ops from 250+/s to 1/10s. 5 new cache tests. |
| etip_reporting | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3021. Module 21. 20 endpoints, 199 tests. 5 report types (daily/weekly/monthly/custom/executive), BullMQ worker (etip-report-generate), cron scheduling, template engine (JSON/HTML/PDF). |
| etip_alerting | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3023. Module 23. 35 endpoints, 306 tests. Alert rules (5 condition types), alert lifecycle (open/ack/resolve/suppress/escalate), notification channels (email/slack/webhook), escalation policies, grouping, maintenance windows, templates. |
| etip_analytics | ✅ Deployed | 0.1.0 | 2026-03-25 | Port 3024. Module 24. 13 endpoints, 86 tests. Dashboard widget aggregation, trend analysis (7d/30d/90d), executive summary with risk posture, service health matrix (21 services), top IOCs/actors/vulns. In-memory cache + demo trend seeding. D1: GET /enrichment-quality — confidence tier breakdown (high/med/low), 5-min cache. |
| etip_caching | ✅ Deployed | 0.1.0 | 2026-03-25 | Port 3025. Module 25. Redis cache management (48hr dashboard, 1hr search), event-driven invalidation, MinIO cold storage archival (60-day policy), archive restore API, cache warming. 94 tests. |
| etip_prometheus | ✅ Running | - | 2026-03-15 | Metrics on port 9190 |
| etip_grafana | ✅ Running | - | 2026-03-15 | Dashboards on port 3101 |
| intelwatch.in | ⛔ DO NOT TOUCH | - | - | Live production site |

## Module Development Status
| Module | Phase | Status | Last Worked | Blockers |
|--------|-------|--------|-------------|----------|
| api-gateway | 1 | ✅ Deployed | 2026-03-27 | **Session 85:** Tiered rate limits + error alerting + @fastify/compress. 59 tests. |
| shared-types | 1 | ✅ Deployed | 2026-03-27 | StixSightingSchema added. Queue JSDoc comments updated (colon→dash). |
| shared-utils | 1 | ✅ Deployed | 2026-03-27 | QUEUES: 24 constants (6 global queues added). EVENTS: 22 constants (+GLOBAL_FEED_PROCESSED, +GLOBAL_IOC_CREATED). **registerMetrics()**: prom-client Prometheus plugin. 91 tests. |
| shared-auth | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-cache | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-audit | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-normalization | 1 | ✅ Deployed | 2026-03-27 | **Session 91:** + MISP Warninglist matcher (5 built-in lists) + ATT&CK technique weighting (30 techniques). 160 tests. |
| shared-enrichment | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-ui | 1 | ✅ Deployed | 2026-03-15 | None |
| user-service | 1 | ✅ Deployed | 2026-03-15 | None |
| frontend | 1 | ✅ UI FROZEN | 2026-03-27 | **20 data pages**. 794 tests (796 total, 2 skipped). **Session 86:** Fix 14 TS errors, notifyApiError wired to 7 hooks (20 catches), useDebouncedValue on 3 pages, TableSkeleton on 2 pages. 8 new tests. |
| elasticsearch-indexing-service | 7 | ✅ Deployed | 2026-03-24 | Port 3020. Module 20. Phase 7. BullMQ worker (etip-ioc-indexed, prefix etip), ES client (ping/ensureIndex/indexDoc/search/bulkIndex), multi-tenant index pattern (etip_{tenantId}_iocs), full-text + faceted search, aggregations. 57 tests. Deployed: docker-compose + deploy.yml + nginx /api/v1/search. RCA #42 fixed. |
| ingestion | 2 | ✅ Deployed | 2026-03-27 | Feed pipeline + 11 modules + policies + AC-2 + **all 5 connectors** + P3-4 queue lanes + P3-7 tenant fairness. **Session 91:** 5 global fetch workers (RSS/NVD/STIX/REST/MISP) + GlobalFeedScheduler + global-fetch-base DRY. 587 tests. |
| normalization | 2 | ✅ Deployed | 2026-03-25 | Port 3005. 18 accuracy improvements + G2/G4b + P2-1. 157 tests. Feed reliability TTL cache (5min, Map-based). Weighted velocity scoring. configureClassifier(). P2-1: unknownTypeCount + lastUnknownType exposed in GET /stats (stats-counter.ts singleton). |
| ai-enrichment | 2 | ✅ Deployed | 2026-03-22 | Port 3006. VT + AbuseIPDB + Haiku AI triage. Cost transparency (3 endpoints) + batch API (2 endpoints). 253 tests. Differentiator A+ COMPLETE (15/15 accuracy improvements). STIX labels, quality score, prompt caching, geo, batch, persistence, scheduler. |
| ioc-intelligence | 3 | ✅ Deployed | 2026-03-25 | Port 3007. 16 endpoints, 13 accuracy improvements, 138 tests. Campaign detection, multi-dimensional search. P0-4: PUT /:id/lifecycle — LIFECYCLE_TRANSITIONS FSM with watchlisted state, transitionLifecycle() service method (409 on invalid transition), FP propagation. |
| threat-actor-intel | 3 | ✅ Deployed | 2026-03-21 | Port 3008. 28 endpoints, 15 accuracy improvements, 190 tests. CRUD + profiles + IOC linkage + MITRE + search + export. |
| malware-intel | 3 | ✅ Deployed | 2026-03-21 | Port 3009. 27 endpoints, 15 accuracy improvements, 149 tests. |
| vulnerability-intel | 3 | ✅ Deployed | 2026-03-27 | Port 3010. 28 endpoints, 15 accuracy improvements, 131 tests. **Session 90:** EPSS live API client + daily refresh cron. |
| digital-risk-protection | 4 | 🔨 WIP | 2026-03-23 | Port 3011. **15/15 improvements COMPLETE + typosquat accuracy**. 36 endpoints, 310 tests. 4 detection engines (typosquat 12-algo, dark web, credential leak, attack surface). Typosquat accuracy: 7 new methods (combosquatting, bitsquatting, keyboard proximity, vowel-swap, repetition, hyphenation, subdomain), composite scoring (Jaro-Winkler + soundex + TLD risk + phonetic), CertStream real-time monitor, domain enricher. P0-P2 all COMPLETE. FEATURE-COMPLETE. |
| threat-graph | 4 | 🔨 WIP | 2026-03-23 | Port 3012. 20 improvements complete (#1-20). 32 endpoints, 294 tests. Neo4j graph, risk propagation, STIX export, cluster detection, batch import, decay cron, merge/split, trending. Ready for deploy. |
| correlation-engine | 4 | ✅ Complete | 2026-03-25 | Port 3013. **15/15 improvements + P1-1 Redis persistence COMPLETE**. 20 endpoints, 179 tests. store-checkpoint.ts: all 6 store Maps persisted to Redis on write (5s debounce, etip-correlation-{store} keys, 7-day TTL), restored on startup. ioredis dep added. TI_REDIS_URL env var wired. |
| threat-hunting | 4 | 🔨 WIP | 2026-03-23 | Port 3014. **15/15 improvements COMPLETE**. 47 endpoints, 222 tests. Hunt query builder, session manager, IOC pivot, saved hunts, hypothesis engine, AI suggestions, timeline, evidence, collaboration, pattern recognition, playbooks, scoring, import/export. |
| enterprise-integration | 5 | 🔨 WIP | 2026-03-23 | Port 3015. **Core + 5 P0 improvements COMPLETE**. 24 endpoints, 174 tests. SIEM (Splunk/Sentinel/Elastic), webhooks (HMAC+DLQ), ticketing (ServiceNow/Jira), STIX/TAXII 2.1, bulk export. Event router, credential encryption, rate limiter, health dashboard. FEATURE-COMPLETE. |
| user-management | 5 | 🔨 WIP | 2026-03-23 | Port 3016. **Core + 5 P0 improvements COMPLETE**. 32 endpoints, 185 tests. RBAC (15 resources, 6 built-in roles, custom role builder, inheritance). Team mgmt (invite, roles, deactivate). SSO config (SAML 2.0 + OIDC per-tenant). MFA (TOTP + backup codes + enforcement). Break-glass (recovery codes, 30-min sessions, audit). P0: permission inheritance, SOC2 audit trail, brute-force protection, session management, password policy. FEATURE-COMPLETE. |
| customization | 5 | ✅ Complete | 2026-03-27 | Port 3017. **Core + 5 P0 + F2 + F3 + G1b + BYOK + Feed Quotas + Global AI Config COMPLETE**. 58 endpoints, 319 tests. **Session 90:** GlobalAiStore (15 subtasks), CostPredictor, 6 global-ai routes, 2 plan-limits routes. |
| onboarding | 6 | ✅ Deployed | 2026-03-26 | Port 3018. **Core + 5 P0 + B1/B2 E2E COMPLETE**. 32 endpoints, 241 tests. **Session 78:** DemoSeeder seeds 3 free-tier feeds by default (was 10). seedUpgradeFeeds() for Starter+ upgrades. freeTier flag on DEFAULT_FEEDS. |
| billing | 6 | ✅ Complete | 2026-03-27 | Port 3019. 28 endpoints, 5 P0 improvements, 190 tests. **Session 83: All 4 stores Prisma-backed** — UsageStore, InvoiceStore, CouponStore wired to repos (PlanStore was S74). Every method try/catch → in-memory fallback. 21 new tests. FEATURE-COMPLETE + FULLY PERSISTENT. |
| admin-ops | 6 | ✅ Complete | 2026-03-27 | Port 3022. **Core + 5 P0 + queue monitor + DLQ + P2-1 queue alerting COMPLETE**. 35 endpoints, 195 tests. **Session 83:** 10s response cache on GET /queues (module-level cache, error responses not cached). 5 new tests. FEATURE-COMPLETE. |
| reporting-service | 7 | ✅ Deployed | 2026-03-24 | Port 3021. **Core + 10 P0 improvements COMPLETE**. 25 endpoints, 217 tests. 5 report types (daily/weekly/monthly/custom/executive). 4 formats (JSON/HTML/CSV/PDF). BullMQ worker (etip-report-generate). Cron scheduling (node-cron). Template engine. In-memory stores (DECISION-013). P0 batch 1: data aggregation, template engine, schedule persistence, report versioning, export validation. P0 batch 2: retention cron, CSV export, report cloning, bulk ops, period comparison. FEATURE-COMPLETE. |
| alerting-service | 7 | ✅ Deployed | 2026-03-24 | Port 3023. Module 23. **Core + P0 + P1 COMPLETE**. 35 endpoints, 306 tests. Alert rules (threshold/pattern/anomaly/absence/composite). Alert lifecycle (open/ack/resolve/suppress/escalate). Notification channels (email/slack/webhook). Escalation policies (multi-step, auto-escalate). Grouping (fingerprint dedup), retry logic, maintenance windows, search, templates. BullMQ worker (etip-alert-evaluate). FEATURE-COMPLETE. |
| caching-service | 7 | ✅ Deployed | 2026-03-25 | Port 3025. Module 25. Redis cache management (48hr dashboard, 1hr search), event-driven cache invalidation (debounced 5s flush), MinIO cold storage archival (60-day cron), archive restore API, cache warming via analytics-service. CACHE_INVALIDATE queue added to shared-utils. 94 tests. |
| analytics-service | 7 | ✅ Deployed | 2026-03-25 | Port 3024. Module 24. **Core + 5 P0 + D1 COMPLETE**. 13 endpoints, 86 tests. Multi-service data aggregation (parallel API calls to 12 services). Trend calculator (7d/30d/90d with delta %). Executive summary with composite risk scoring. Widget registry (14 widgets, 4 categories). Service health matrix (21 ETIP services). In-memory cache (DECISION-013). D1: GET /enrichment-quality — calls enrichment /stats, distributes enriched count into high(60%)/med(30%)/low(10%) confidence buckets, 5-min cache. |

## Module Dependency Map
```
shared-types          → (no deps)
shared-utils          → (no deps)
shared-cache          → (no deps)
shared-ui             → (no deps)
shared-auth           → shared-types, shared-utils
shared-audit          → shared-utils
shared-normalization  → shared-utils
shared-enrichment     → shared-utils
shared-persistence    → ioredis (NEW — session 74)
user-service          → shared-types, shared-utils, shared-auth
api-gateway           → shared-types, shared-utils, shared-auth, user-service, @fastify/compress, ioredis
ingestion             → shared-types, shared-utils, shared-auth, shared-cache, shared-audit, shared-enrichment, shared-normalization (Phase 2)
normalization         → shared-types, shared-utils, shared-normalization, shared-auth (Phase 2)
ai-enrichment         → shared-types, shared-utils, shared-auth, shared-enrichment, shared-normalization, @anthropic-ai/sdk (Phase 2)
ioc-intelligence      → shared-types, shared-utils, shared-auth (Phase 3)
threat-actor-intel    → shared-types, shared-utils, shared-auth (Phase 3)
malware-intel         → shared-types, shared-utils, shared-auth (Phase 3)
vulnerability-intel   → shared-types, shared-utils, shared-auth (Phase 3)
threat-graph          → shared-types, shared-utils, shared-auth, neo4j-driver, bullmq (Phase 4)
correlation-engine    → shared-types, shared-utils, shared-auth, bullmq, @anthropic-ai/sdk (Phase 4)
hunting-service       → shared-types, shared-utils, shared-auth (Phase 4)
drp-service           → shared-types, shared-utils, shared-auth (Phase 4)
integration-service   → shared-types, shared-utils, shared-auth, bullmq (Phase 5)
user-management       → shared-types, shared-utils, shared-auth (Phase 5)
customization         → shared-types, shared-utils, shared-auth (Phase 5)
onboarding            → shared-types, shared-utils, shared-auth, ioredis (Phase 6)
billing-service       → shared-types, shared-utils, shared-auth, razorpay, @prisma/client (Phase 6)
admin-service         → shared-types, shared-utils, shared-auth, ioredis (Phase 6)
frontend              → shared-types, shared-ui, d3 (Phase 1+)
elasticsearch-indexing-service → shared-types, shared-utils, shared-auth, @elastic/elasticsearch, bullmq (Phase 7)
reporting-service     → shared-types, shared-utils, shared-auth, bullmq, node-cron (Phase 7)
alerting-service     → shared-types, shared-utils, shared-auth, bullmq (Phase 7)
analytics-service    → shared-types, shared-utils, shared-auth (Phase 7)
caching-service      → shared-types, shared-utils, shared-auth, ioredis, minio, node-cron (Phase 7)
```

## Module Ownership Tiers

### Tier 1 — FROZEN (shared-* packages, api-gateway)
- Backward-compatible changes ONLY
- Breaking changes require: impact analysis → list all consumers → get explicit approval
- Before any modification:
  1. List every module that imports from this package
  2. Verify the change is additive (new exports OK, changing/removing existing = breaking)
  3. If breaking: must update ALL consumers in the same PR
- api-gateway: central orchestrator — route registration changes only, never structural

### Tier 2 — GUARDED (✅ Deployed feature services)
- Bug fixes with test coverage: allowed
- New features: only if in current phase scope
- Structural changes (file moves, pattern changes): require plan mode + approval
- Never touch during another module's development session

### Tier 3 — FREE (🔨 WIP and 📋 Not Started modules)
- Active development welcome
- Follow TDD via /implement
- Can evolve freely within architecture constraints
- Must still respect shared package boundaries (Tier 1 rules apply to imports)

### Status Quick Reference
- ✅ DEPLOYED = Tier 2 (guarded)
- 🔨 WIP = Tier 3 (free)
- 📋 NOT STARTED = Tier 3 after /new-module scaffold
- ⛔ NEVER TOUCH = intelwatch.in, ti-platform-* containers
- shared-* packages = Tier 1 (frozen) always, regardless of other status

## Work In Progress

- **Current phase:** Phase 9 — DECISION-029: Global Feed Processing + Standards-Based Intelligence. Phases A1+A2+B1 COMPLETE, pushed.
- **Last session outcome:** Session 91 (2026-03-27). **Phase B1 COMPLETE.** 5 global fetch workers (RSS/NVD/STIX/REST/MISP) with DRY base (global-fetch-base.ts: catalog lookup, rate limiting, dedupe, consecutive failure tracking). GlobalFeedScheduler (5-min cron tick, isDue(), per-type queue routing). MISP Warninglist matcher (5 built-in lists: DNS resolvers, CDN domains, safe domains, safe CIDRs, RFC1918). ATT&CK technique weighting (30 curated techniques, composite severity: max*0.6+avg*0.4). Worker registration in index.ts behind TI_GLOBAL_PROCESSING_ENABLED feature flag. 77 new tests (587 ingestion, 160 shared-normalization). Commit: 283d7d8. Pushed to master, CI triggered.
- **Known issues:** Pre-existing TS errors in customization-service global-ai-store.ts (6 errors, not from this session). VPS needs `prisma db push` for 7 new global processing tables. Cache-invalidate queue had 18,922 backlog. CISA KEV intermittent timeouts. Docker service ports not published to host. Global workers are OFF by default (TI_GLOBAL_PROCESSING_ENABLED=false).
- **Next tasks:** (1) Session 92: DECISION-029 Phase B2 — Global Normalize Worker + Enrich Worker + Tenant Distribution pipeline. (2) Deploy to VPS + run `prisma db push` for new tables. (3) Sessions 93: Phases C/D per plan.

## Deployment Log

| Session | Date | Containers Deployed | Health | Commits | Notes |
|---------|------|---------------------|--------|---------|-------|
| 2 | 2026-03-17 | etip_api, etip_postgres, etip_redis, etip_nginx + infra | ✅ All healthy | Multiple | Phase 1 initial deploy |
| 3 | 2026-03-17 | etip_frontend added | ✅ All healthy | Multiple | Frontend shell, 10 containers |
| 8 | 2026-03-21 | etip_ingestion added | ✅ All healthy | Multiple | Feed pipeline, RCA #30-33 |
| 12 | 2026-03-21 | etip_normalization added | ✅ All healthy | 69fbddf, 5d035f6 | IOC normalization, 6 improvements |
| 13 | 2026-03-21 | etip_normalization, etip_enrichment, etip_api, etip_frontend, etip_nginx | ✅ All 14 healthy | b859075→056c837 | 12 more improvements + AI enrichment service. E2E verified: 301 IOCs |
| 14 | 2026-03-21 | etip_ioc_intelligence added, all app containers recreated | ✅ All 15 healthy | f62dba7, d6f04b6 | IOC Intelligence Service: 15 endpoints, 13 accuracy improvements, 119 tests |
| 15 | 2026-03-21 | etip_threat_actor_intel added, all app containers recreated | pending CI | 22793db | Threat Actor Intel Service: 28 endpoints, 15 accuracy improvements, 190 tests |
| 16 | 2026-03-21 | etip_malware_intel added, all app containers recreated | pending CI | 6c327c4, 068d7dc | Malware Intel Service: 27 endpoints, 15 accuracy improvements, 149 tests |
| 17 | 2026-03-21 | etip_vulnerability_intel added, all app containers recreated | pending CI | 58b50f1 | Vulnerability Intel Service: 28 endpoints, 15 accuracy improvements, 119 tests. Phase 3 COMPLETE. |
| 18 | 2026-03-21 | etip_frontend updated (dashboard pages) | pending CI | e33072e | Dashboard Frontend: 5 data-connected pages, 3 UI improvements, live stats. |
| 19 | 2026-03-21 | No deploy (code-only session) | — | 91c92c8 | 11 UI improvements, frontend test infra, 100 new tests. Not yet deployed. |
| 20 | 2026-03-21 | etip_frontend, etip_vulnerability_intel updated | ✅ CI green | 848cb28→815bfaa | Demo data fallbacks, 3 bug fixes (RCA #34-36), vuln-intel TS fixes. 154 frontend tests. |
| 21 | 2026-03-22 | No deploy (code-only session) | — | df33330 | Differentiator A: Haiku triage + cost tracker + cost API. 98 new tests (1680 total). |
| 22 | 2026-03-22 | No deploy (code-only session) | — | 265483a | 8 accuracy improvements: evidence, MITRE, FP, budget gate, cache, families, actions. 64 new tests (1744 total). |
| 23 | 2026-03-22 | etip_enrichment, etip_frontend updated, all app containers recreated | ✅ CI green | 5c949d1→d6694e8 | 7 accuracy improvements (#9-15) + QA checklist + 3 CI fixes. 64 new tests (1808 total). Differentiator A+ COMPLETE. |
| 24 | 2026-03-22 | etip_frontend updated, all app containers recreated | ✅ CI green | 799145c→4e60b44 | Enrichment UI + tabbed detail + merged stats + mobile overlay. 63 new tests (1871 total). Differentiator B COMPLETE. UI FROZEN. |
| 25 | 2026-03-22 | etip_threat_graph added (port 3012), all app containers recreated | ⏳ CI pending | 2e37845 | Threat Graph Service: 11 endpoints, 5 P0 improvements, 90 new tests (1961 total). Phase 4 started. |
| 26 | 2026-03-23 | No deploy (code-only session) | — | bb0a5c1 | Threat Graph 20 improvements (#1-20): P1+P2+advanced ops. 32 endpoints, 204 new tests (2165 total). |
| 27 | 2026-03-23 | No deploy (code-only session) | — | e9acaea | Correlation Engine (Module 13): 10 improvements (#1-10), 12 endpoints, 106 new tests (2271 total). |
| 28 | 2026-03-23 | No deploy (code-only session) | — | 9430bdd | Correlation Engine P2 (#11-15): 5 services, 8 endpoints, 60 new tests (2331 total). Module 13 FEATURE-COMPLETE. |
| 29 | 2026-03-23 | etip_hunting + etip_correlation containers added | ⏳ CI pending | feaf0a8→657045f | Threat Hunting Service: 47 endpoints, 222 tests, 15/15 improvements. Docker-compose updated with etip_hunting + etip_correlation. |
| 30 | 2026-03-23 | No deploy (code-only session) | — | e26f551 | DRP Service (Module 11): 25 endpoints, 158 new tests (2711 total). Core + P0 #1-5. 4 detection engines, 5 accuracy improvements. |
| 31 | 2026-03-23 | CI triggered (all Phase 4 services) | ⏳ CI pending | 2bb8730 | DRP P1/P2 (#6-15): 10 services, 10 endpoints, 108 new tests (2819 total). Module 11 FEATURE-COMPLETE (15/15). Phase 4 COMPLETE. |
| 32 | 2026-03-23 | CI triggered (DRP accuracy update) | ⏳ CI pending | 49acf09 | DRP typosquat accuracy: 7 new methods, composite scoring (JW+soundex+TLD), CertStream monitor, domain enricher. 44 new tests (310 DRP, ~2863 total). |
| 33 | 2026-03-23 | etip_frontend updated + 4 Phase 4 services added to deploy pipeline | ✅ CI green | f3ed4b5→81aa53a (7 commits) | Phase 4 Frontend: 4 new pages + full interactivity. DRP: asset CRUD, alert triage. Graph: path finder, add node, STIX export. Correlation: TP/FP feedback. Hunting: create hunt, status controls, add hypothesis/evidence. 273 tests. Deploy pipeline: 4 services + nginx. |
| 34 | 2026-03-23 | etip_integration added (port 3015) | ⏳ CI pending | 6c25bc2 | Enterprise Integration Service (Module 15): 24 endpoints, 5 P0 improvements, 174 tests. SIEM + webhooks + ticketing + STIX/TAXII + bulk export. Phase 5 started. |
| 35 | 2026-03-23 | etip_user_management added (port 3016) + etip_frontend updated | ⏳ CI pending | 99db5db, 12018db | User Management Service (Module 16): 32 endpoints, 5 core features, 5 P0 improvements, 185 tests. Also pushed prior-session frontend enhancements. Phase 5: 2/3 done. |
| 36 | 2026-03-23 | etip_customization added (port 3017) | ⏳ CI pending | ea46b2e | Customization Service (Module 17): 35 endpoints, 5 core features, 5 P0 improvements, 159 tests. Module toggles, AI model selection, risk weights, dashboard customization, notification preferences. Phase 5 COMPLETE (3/3). |
| 37 | 2026-03-23 | etip_integration updated (P1/P2) | ⏳ CI pending | f2f85e4 | Integration Service P1/P2: 10 accuracy improvements, 34 new endpoints (58 total), 161 new tests (335 total). |
| 38 | 2026-03-23 | etip_frontend updated (Phase 5 pages) | ⏳ CI pending | d8c9d8b | Phase 5 Frontend: 3 new pages (Integration, User Management, Customization). 30 hooks, 63 new tests (367 frontend, 3692 total). |
| 39 | 2026-03-23 | etip_onboarding added (port 3018) | ✅ CI green | f11b866, 1695a52 | Onboarding Service (Module 18): 32 endpoints, 5 core + 5 P0, 190 tests. Phase 6 started (1/3). Deploy pipeline wired in separate commit. |
| 40 | 2026-03-23 | etip_billing added (port 3019) | ⏳ CI pending | e2c897a | Billing Service (Module 19): 28 endpoints, 5 P0, 149 tests. Razorpay, GST invoices, usage metering, upgrade/downgrade, coupons. 4031 monorepo tests. Phase 6: 2/3. |
| 41 | 2026-03-23 | etip_admin added (port 3022) | ⏳ CI pending | f4ca0f5 | Admin Ops Service (Module 22): 28 endpoints, 5 core + 5 P0, 147 tests. System health, maintenance windows, backup/restore, tenant admin, audit dashboard. 4178 monorepo tests. Phase 6 COMPLETE (3/3). |
| 42 | 2026-03-24 | etip_frontend updated | ✅ CI green | edd6fe8→3c485dc (5 commits) | Feed Ingestion: demo fallback fix + 5 UX improvements + sort/filter/search. 86 new frontend tests (453 total). FeedListPage.tsx overhaul. |
| 43 | 2026-03-24 | All etip containers redeployed | ✅ All 28+ healthy | 1681fcf, 6198a63 | Dockerfile CI fix (billing+admin COPY missing). Phase 6 frontend: Billing + Admin Ops pages. All Phase 4-6 containers confirmed healthy. 453 frontend tests. |
| 44 | 2026-03-24 | etip_frontend updated | ✅ CI green | 92296eb, 12a7267, 27e56d3, f760b19 | BillingPage crash fix (RCA #39, #39b): PlanDefinition shape mismatch + hasData hardening. Pricing v3: Free/Starter ₹9,999/Teams ₹18,999/Enterprise ₹49,999, drop Pro tier, annual pricing. 475 frontend tests. |
| 45 | 2026-03-24 | etip_frontend updated | ✅ CI green | 85c4bc7, a65863c, 59f2a4d, 97ddd16 | Onboarding frontend: OnboardingPage.tsx (8-step wizard, pipeline health, module readiness, quick start), hooks, route, 25 tests. Phase 6 frontend 3/3 COMPLETE. 500 frontend tests. CI run 23461768159. |
| 46 | 2026-03-24 | No deploy (verification session) | — | (none) | Verified session 45 OnboardingPage work. All 500 frontend tests pass. Docs updated. Working tree clean. |
| 47 | 2026-03-24 | No deploy (docs only) | — | eaea286 | QA_CHECKLIST full rewrite (session 23→46). Prompts prepared for D3 code-split + Known Gaps P1. |
| 48 | 2026-03-24 | etip_frontend updated (D3 bundle split) | ✅ CI green | e7587e3→2ece933 (5 commits) | D3 code-split (ThreatGraphPage + RelationshipGraph lazy-loaded, DECISION-025). Elasticsearch IOC Indexing Service Module 20 scaffolded (57 tests). Known Gaps P1: actor/malware detail panels + IOC campaign badge (+30 tests, 530 frontend total). CI fixes: Dockerfile COPY, TS implicit-any, orphaned containers (RCA #41). 4398 total tests. ES service NOT yet in docker-compose. |
| 49 | 2026-03-24 | etip_frontend updated (demo fallbacks + client sort/filter) | ✅ CI green | 2ef750f→9b355bc (4 commits) | Demo fallbacks for Actor/Malware/Vuln (all 5 entity pages). ES service wired into docker-compose+nginx (fffc66f) then removed from active deploy.yml (9b355bc) because Elasticsearch not provisioned on VPS. Client-side sort/filter added to actor/malware/vuln pages in demo mode. 4398 total tests. |
| 50 | 2026-03-24 | etip_es_indexing added (port 3020), etip_nginx updated | ✅ All 29 healthy | fffc66f→ebc7716 (6 commits) | ES indexing service deployed: docker-compose + deploy.yml + nginx /api/v1/search. RCA #42: BullMQ v5.71.0 colon restriction — fixed with dash replacement. Health verified: esConnected=true, queueDepth=0. 29 containers running. |
| 51 | 2026-03-24 | All 29 containers redeployed (BullMQ queue name migration + deploy optimization) | ✅ All 29 healthy | 1d00e99, 066101e, 3714b5a | BullMQ colon→dash migration (19 files). Deploy pipeline: 2 builds instead of 20, parallel health checks. Deploy time: 13min→1.5min. DECISION-026. |
| 52 | 2026-03-24 | etip_reporting added (port 3021) | ✅ All 30 healthy | edfbd07 | Reporting Service (Module 21): 20 endpoints, 199 tests, 5 report types, BullMQ worker, cron scheduling, template engine. 4597 monorepo tests. |
| 53 | 2026-03-24 | No deploy (code-only session) | — | cff770d | Reporting P0 batch 2: retention cron, CSV export, clone, bulk ops, comparison. 25 endpoints, 217 tests. 4615 monorepo tests. |
| 54 | 2026-03-24 | etip_frontend updated | ✅ CI green | 673dd72 | ReportingPage frontend: 3 tabs (Reports/Schedules/Templates), modals, bulk ops, compare, demo fallback. 44 new tests (574 frontend total). Route /reporting + module config + IconReporting. 4659 monorepo tests. |
| 55 | 2026-03-24 | etip_frontend updated (AlertingPage) | ✅ CI green | 371b71c, 7d340d4 | AlertingPage frontend: 4 tabs (Rules/Alerts/Channels/Escalations), search, filters, bulk ack/resolve, history drawer, channel modal. 50 new tests (624 frontend). Route /alerting + IconAlerting. 18 data pages. |
| 55 | 2026-03-24 | etip_analytics added (port 3024) | ✅ All 32 healthy | 14b7420, daa24ef | Analytics Service (Module 24): 12 endpoints, 83 tests, 5 P0 improvements. Dashboard aggregation, trends, executive summary, service health. 32 containers. ~5098 monorepo tests. |
| 57 | 2026-03-24 | etip_onboarding + etip_frontend updated | ✅ Pushed | e78239f→4eda8d3 | E2E B2: onboarding feed seeding + Redis wizard. E2E C1: feed retry + graph expand. 230 onboarding tests, 633 frontend tests. |
| 58 | 2026-03-25 | etip_caching added (port 3025) | ✅ All 33 healthy | e78239f→794b3eb | Caching & Archival Service (Module 25): 94 tests. Redis cache mgmt, MinIO archival, event-driven invalidation. 4 CI fix commits (lockfile, TS, queue count, async tests). CI run 23499248314 green. Deploy rerun succeeded (first attempt SSH timeout). |
| 59 | 2026-03-25 | etip_frontend deployed via vps-cmd.yml | ✅ All 33 healthy | ff93d4a | E2E C2-D2: correlation actions, DRP triage, IOC pivot/timeline, alerting fixes, AnalyticsPage. Deployed via GitHub Actions vps-cmd.yml in session 61. |
| 60 | 2026-03-25 | etip_admin updated (ioredis, queue monitor), etip_frontend (queue health table) | ⏳ CI triggered | d8ed45f | E2E E1: pipeline smoke harness (tests/e2e/). E2E E2: admin-service queue monitor (14 queues, LLEN+ZCARD, injectable mock). Frontend queue health table in AdminOpsPage. 13 files, 897 insertions. 5348 tests. |
| 61 | 2026-03-25 | etip_frontend deployed (session 59 code), VPS disk cleanup | ✅ All 33 healthy | a515a68 | VPS ops: deployed frontend via vps-cmd.yml. Fixed disk full (56GB Docker build cache → 1.3GB). Daily cleanup cron installed. scripts/docker-cleanup.sh added to repo. |
| 63 | 2026-03-25 | etip_ingestion + etip_customization + etip_frontend updated | ⏳ CI pending | 9c31ed6, e65037c, 23a57ec | Phase F COMPLETE: F1 feed policies (5 endpoints, 44 tests), F2 12 subtasks + plan tiers (3 endpoints, 43 tests), F3 cost estimator + AI Config UI rebuild (32 tests). ~282 tests added. VPS SSH timeout — CI/CD deploy path used. |
| 64 | 2026-03-25 | No deploy (code-only) | — | 559b2a3, 9877f2a, d350d1f, 6e7c758, a26c918 | Gap Analysis G1-G4 COMPLETE. G1: aiEnabled pipeline + PUT /ai/subtasks/:subtask + dedup Haiku arbitration. G2: reliability TTL cache + weighted velocity. G3: subtask editor + plan confirm modal + IOC lifecycle UI. G4: TLD regex + IPv6 filter + decay JSDoc + configureClassifier. ~41 tests added (~5671 total). |
| 65 | 2026-03-25 | No deploy (code-only) | — | f58edcb | G5 P0 fixes: SearchPage (/search + sidebar), E2E CI smoke step in deploy.yml, DLQ processor (4 routes + 10 tests). Admin-service: 33 endpoints, 172 tests. Frontend: 704 tests. 5,542 total. |
| 66 | 2026-03-25 | No deploy (code-only) | — | 242c132 | AC-2: CustomizationClient + per-tenant subtask model routing in ArticlePipeline. setModel() on Triage/Extraction services. dedup.arbitrate() model param. TI_CUSTOMIZATION_URL env var. 15 new tests (360 ingestion total). ~5,557 monorepo total. |
| 67 | 2026-03-25 | No deploy (code-only) | — | 7dfb799, 85d1612, 744c977, f6e7dc3, 12f6bc5 | P1-1 correlation Redis persistence (store-checkpoint, 179 tests). P0-3 billing priceInr fix. P0-4 IOC lifecycle FSM (138 ioc-intelligence tests). P2-1 normalization unknownTypeCount (157 tests). P2-2 stage2Factor DI + BYOK backend+frontend (241 customization, 713 frontend). D1 analytics enrichment-quality. D2 dashboard widget. ~5,617 monorepo total. |
| 68 | 2026-03-25 | etip_frontend updated | ⏳ CI triggered | 1ff8c88, 17e60be | Mobile responsive grid fixes (9 pages), api-gateway rate-limit, ConfidenceBreakdown component, P2-3 ticket guard, P3-5 analytics staleness indicator. 734 frontend tests. |
| 69 | 2026-03-25 | etip_ingestion updated (3 new connectors) | ⏳ CI triggered | 886e4b3, d298226 | P3-1/P3-2/P3-3: NVD + STIX/TAXII + REST_API feed connectors. 32 new tests (392 total ingestion). TI_NVD_API_KEY, TI_TAXII_URL/USER/PASSWORD env vars. Only MISP remains 501. |
| 70 | 2026-03-26 | etip_ingestion + shared-utils updated, all 32 containers recreated | ✅ All 32 healthy | 8c201b9→79ec3bf (6 commits) | P3-4: 4 per-feed-type queue lanes (RSS c=5, NVD c=2, STIX c=2, REST c=3). P3-7: per-tenant BullMQ fairness (Redis counter + DelayedError + Lua safe DECR). Review fixes: C1 feedType select, C2 close() cleanup, C3 DelayedError, W1 atomic pipeline, W2 safe DECR. 405 ingestion tests. Grafana dashboards also deployed (aed6e73). Manual VPS deploy after CI SSH timeout. |
| 71 | 2026-03-26 | etip_admin + etip_frontend + shared-utils updated | ✅ CI green (23561851508) | aa8400f | P2-1 queue alerting: QueueAlertEvaluator (Redis debounce, QUEUE_ALERT/RESOLVED), GET /queues/alerts, AdminOpsPage red banner. 190 admin tests, 739 frontend tests, 5,692 total. |
| 72 | 2026-03-26 | etip_ingestion updated (MISP connector + deploy.yml) | ✅ CI green (23565670507) | 1754609 | P3-6 MISP connector: 15 improvements, 81 tests, 486 ingestion total. All 5 connectors functional. Deploy.yml RCA #41 orphan cleanup fix. 33 containers healthy. |
| 73 | 2026-03-26 | All 23 backend services updated (Prometheus metrics) | ✅ CI green (23574054284) | 050eb58 | prom-client wired to all 23 services via shared-utils registerMetrics(). Prometheus scrape config: 23 targets. Deploy.yml orphan cleanup improved. 12 new tests, 5,785 total. |
| 76 | 2026-03-26 | No deploy (frontend-only, code session) | — | 75b5657 | Frontend interactivity: VulnDetailPanel, SearchPage drill-down, IOC enrichment/relations wiring, sort on 4 pages. 16 new tests, 755 frontend. |
| 77 | 2026-03-26 | All 33 containers redeployed (backend image rebuild) | ✅ All 33 healthy | 75c733b→cd194ad (5 commits) | Live feed activation: DemoSeeder 3-bug fix (type/feedType/parseConfig), 10 OSINT feeds, seed-feeds.sh script, billing unused import fix, deploy timeout 25m. 12 new tests. Neo4j transient health delay (recovered). Seed script blocked by SSH timeout. |
| 78 | 2026-03-26 | etip_api, etip_alerting, etip_correlation rebuilt | ✅ 31 healthy | 2425673 | INTEGRATION_PUSH payload shape fix (alerting+correlation→integration). Pipeline health check script. 19 wiring tests. Deploy via nohup (CI SSH broken pipe). Caddy restarted. |
| 81 | 2026-03-27 | etip_frontend + etip_billing rebuilt | ✅ CI triggered | b4d3832, 29a0ad1 | VPS feed activation: 20 feeds live (2 tenants), 17K+ articles, 1.5K+ IOCs. Enterprise plan assigned. Fix: api.ts x-tenant-id header injection (MISSING_TENANT 400). Billing: pro→teams rename + DECISION-024 price alignment. |
| 82 | 2026-03-27 | etip_frontend updated | ✅ CI triggered | 68a6adb, 6fcdc85 | Frontend UX: error toasts (useApiError), search debounce (useDebouncedValue 300ms), loading skeletons (TableSkeleton on 3 pages). 15 new tests, 770 frontend total. |
| 83 | 2026-03-27 | etip_billing + etip_admin updated | ⏳ CI triggered | bc6f392 | Billing: all 4 stores Prisma-backed (Usage, Invoice, Coupon + PlanStore from S74). Admin: 10s queue cache. 21 new tests. 190 billing + 195 admin tests. |
| 84 | 2026-03-27 | etip_ingestion + etip_frontend updated | ⏳ CI triggered | d2ff728, a97b8ff | Scheduler: exponential backoff + circuit breaker. Frontend: feed health indicators (HealthDot, FailureSparkline, overdue). 19 new tests. 5,953 total. |
| 85 | 2026-03-27 | etip_api + etip_frontend updated | ⏳ CI triggered | 1420c77 | API Gateway: tiered rate limits (search/write/read), error alerting (5-min window, QUEUE_ALERT), @fastify/compress (gzip >1KB), GET /gateway/error-stats. Frontend: GET request dedup (100ms). 12 new tests. ~5,965 total. |
| 86 | 2026-03-27 | etip_frontend updated | ⏳ CI triggered | 426794d | Fix 14 TS errors, notifyApiError wired to 7 hooks (20 catches), useDebouncedValue on 3 pages, TableSkeleton on 2 pages. 8 new tests. 794 frontend tests. ~5,973 total. |
| 88 | 2026-03-27 | No deploy (planning session) | — | 8d3e078, b66affd, f1238bf | DECISION-029 v2: Global processing + 27 improvements (12 orig + 15 standards). NATO Admiralty Code, Bayesian confidence, MISP Warninglists, EPSS, CPE 2.3, ATT&CK weighting, Shodan/GreyNoise. Docs only. |
| 89 | 2026-03-27 | No deploy (code pushed to master) | ⏳ CI triggered | 8f12b7e, cc79a43, 2ced273, 30147db | DECISION-029 Phase A1: 7 Prisma models, Feed Catalog API (7 routes), Admiralty Code, CPE 2.3, STIX Sighting, 6 queue constants, 2 events. 95 new tests. 3 CI fixes. |
| 90 | 2026-03-27 | No deploy (code pushed to master) | ⏳ CI triggered | af55748 | DECISION-029 Phase A2: Bayesian confidence, STIX 2.1 tiers, EPSS client+cron, GlobalAiStore (15 subtasks), CostPredictor, 8 new routes. 102 new tests. ~6,083 total. |
| 89 | 2026-03-27 | All 33 containers redeployed (shared-utils queue changes) | ✅ All 33 healthy | 8f12b7e, cc79a43, 2ced273, 30147db | DECISION-029 Phase A1: 7 Prisma models, NATO Admiralty Code, CPE 2.3 parser, STIX Sighting, 6 global queues, 2 events, Catalog API (7 routes). 95 new tests. 3 CI fixes. |
| 91 | 2026-03-27 | Code pushed to master | ⏳ CI triggered | 283d7d8 | DECISION-029 Phase B1: 5 global fetch workers, GlobalFeedScheduler, MISP warninglists, ATT&CK weighting. 77 new tests. ~6,160 total. Feature-gated (TI_GLOBAL_PROCESSING_ENABLED=false). |

## E2E Verification Results (Session 13)

```
Feed: US-CERT Alerts (CISA advisories) — */30 cron
Articles: 30 (Russian Intel, Schneider Electric, CISA KEV advisories)
IOCs: 301 total — 209 CVE, 46 URL, 27 IP, 17 domain, 2 email
Lifecycle: 285 NEW, 16 ACTIVE (multi-article corroboration)
Severity: 255 medium, 46 low (auto-classified)
Enrichment: 19 enriched, 282 pending (VT rate-limited at 4/min)
All endpoints verified: /feeds, /articles, /iocs, /iocs/stats, /enrichment/stats, /enrichment/pending
```

## Environment Notes
- VPS: 72.61.227.64, 8GB RAM (~8GB estimated by 33 containers), 96GB disk (16% used, daily Docker cleanup cron active)
- CI/CD: GitHub Actions deploy.yml → VPS, last run green
- Caddy: routing ti.intelwatch.in → etip_nginx
- SSH: Port 22 filtered, use GitHub Actions vps-cmd.yml or Cloudflare Tunnel
- API keys configured: TI_VIRUSTOTAL_API_KEY (free, 4/min), TI_ABUSEIPDB_API_KEY (free, 1000/day), TI_AI_ENABLED=true
