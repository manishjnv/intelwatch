# ETIP Project State
**Last updated:** 2026-03-24 (update at end of EVERY session via /session-end)
**Session counter:** 46

## Deployment Status
| Service | Status | Version | Last Deploy | Notes |
|---------|--------|---------|-------------|-------|
| etip_api | ✅ Running | 0.1.0 | 2026-03-21 | Health check passing |
| etip_frontend | ✅ Running | 0.3.5 | 2026-03-24 | Dashboard + 16 data pages + demo fallbacks. All phases complete. Phase 6: Billing (pricing v3) + Admin Ops + Onboarding (8-step wizard, pipeline health, module readiness, quick start). 500 frontend tests (502 total, 2 skipped). Phase 6 frontend 3/3 COMPLETE. |
| etip_nginx | ✅ Running | - | 2026-03-23 | Reverse proxy for ti.intelwatch.in. Routes: graph(3012), correlation(3013), hunting(3014), drp(3011). |
| etip_postgres | ✅ Running | 16 | 2026-03-15 | Schema migrated, RLS enabled |
| etip_redis | ✅ Running | 7 | 2026-03-15 | Cache + BullMQ queues |
| etip_ingestion | ✅ Running | 0.1.0 | 2026-03-21 | Feed pipeline + 11 modules |
| etip_normalization | ✅ Running | 0.1.0 | 2026-03-21 | IOC upsert + 18 accuracy improvements |
| etip_enrichment | ✅ Running | 0.3.0 | 2026-03-22 | VT + AbuseIPDB + Haiku AI triage. 15/15 accuracy improvements. 5 endpoints + batch API. Prompt caching, cost persistence, re-enrichment scheduler. |
| etip_ioc_intelligence | ✅ Running | 0.1.0 | 2026-03-21 | Port 3007. 15 endpoints, 13 accuracy improvements |
| etip_threat_actor_intel | ✅ Running | 0.1.0 | 2026-03-21 | Port 3008. 28 endpoints, 15 accuracy improvements |
| etip_malware_intel | ✅ Running | 0.1.0 | 2026-03-21 | Port 3009. 27 endpoints, 15 accuracy improvements |
| etip_vulnerability_intel | ✅ Running | 0.1.0 | 2026-03-21 | Port 3010. 28 endpoints, 15 accuracy improvements |
| etip_threat_graph | ✅ Deployed | 2.0.0 | 2026-03-24 | Port 3012. Neo4j knowledge graph. 32 endpoints, 20 improvements (#1-20), 294 tests. |
| etip_correlation | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3013. 20 endpoints, 15/15 improvements, 166 tests. |
| etip_hunting | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3014. 47 endpoints, 15/15 improvements, 222 tests. |
| etip_drp | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3011. 36 endpoints, 310 tests. |
| etip_integration | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3015. 24 endpoints, 174 tests. SIEM + webhooks + ticketing + STIX/TAXII. |
| etip_user_management | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3016. 32 endpoints, 185 tests. RBAC + teams + SSO + MFA + break-glass. |
| etip_customization | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3017. 35 endpoints, 159 tests. Module toggles + AI model selection + risk weights + dashboard customization + notification preferences. |
| etip_onboarding | ✅ Deployed | 0.1.0 | 2026-03-23 | Port 3018. 32 endpoints, 190 tests. Setup wizard, data source connectors, pipeline health, module readiness, progress tracker. Added to deploy.yml + nginx + docker-compose. |
| etip_billing | ✅ Deployed | 0.1.0 | 2026-03-23 | Port 3019. 28 endpoints, 149 tests. Plan management, usage metering, Razorpay billing, GST invoices, upgrade/downgrade, coupon codes. Added to deploy.yml + docker-compose. |
| etip_admin | ✅ Deployed | 0.1.0 | 2026-03-24 | Port 3022. 28 endpoints, 147 tests. System health monitoring, maintenance windows, backup/restore, tenant administration, audit dashboard + 5 P0 improvements. |
| etip_prometheus | ✅ Running | - | 2026-03-15 | Metrics on port 9190 |
| etip_grafana | ✅ Running | - | 2026-03-15 | Dashboards on port 3101 |
| intelwatch.in | ⛔ DO NOT TOUCH | - | - | Live production site |

## Module Development Status
| Module | Phase | Status | Last Worked | Blockers |
|--------|-------|--------|-------------|----------|
| api-gateway | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-types | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-utils | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-auth | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-cache | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-audit | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-normalization | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-enrichment | 1 | ✅ Deployed | 2026-03-15 | None |
| shared-ui | 1 | ✅ Deployed | 2026-03-15 | None |
| user-service | 1 | ✅ Deployed | 2026-03-15 | None |
| frontend | 1 | ✅ UI FROZEN | 2026-03-24 | **16 data pages** (IOC, Feed, Actor, Malware, Vuln, Enrichment, DRP, Graph, Correlation, Hunting, Integration, User Management, Customization, Billing, Admin Ops, **Onboarding**). 19 viz components. 500 tests (502 total, 2 skipped). Phase 6 pages: Billing (pricing v3, plan cards, usage, upgrade) + Admin Ops (health, maintenance, tenants, audit) + Onboarding (8-step wizard, pipeline health, module readiness, quick start). All 16 pages COMPLETE. **Existing pages FROZEN.** |
| ingestion | 2 | ✅ Deployed | 2026-03-21 | Feed pipeline + 11 modules. 276 tests. Wired to normalization. |
| normalization | 2 | ✅ Deployed | 2026-03-21 | Port 3005. 18 accuracy improvements. 139 tests. Wired to enrichment. Lifecycle cron every 6h. |
| ai-enrichment | 2 | ✅ Deployed | 2026-03-22 | Port 3006. VT + AbuseIPDB + Haiku AI triage. Cost transparency (3 endpoints) + batch API (2 endpoints). 253 tests. Differentiator A+ COMPLETE (15/15 accuracy improvements). STIX labels, quality score, prompt caching, geo, batch, persistence, scheduler. |
| ioc-intelligence | 3 | ✅ Deployed | 2026-03-21 | Port 3007. 15 endpoints, 13 accuracy improvements, 119 tests. Campaign detection, multi-dimensional search. |
| threat-actor-intel | 3 | ✅ Deployed | 2026-03-21 | Port 3008. 28 endpoints, 15 accuracy improvements, 190 tests. CRUD + profiles + IOC linkage + MITRE + search + export. |
| malware-intel | 3 | ✅ Deployed | 2026-03-21 | Port 3009. 27 endpoints, 15 accuracy improvements, 149 tests. |
| vulnerability-intel | 3 | ✅ Deployed | 2026-03-21 | Port 3010. 28 endpoints, 15 accuracy improvements, 119 tests. Phase 3 complete. |
| digital-risk-protection | 4 | 🔨 WIP | 2026-03-23 | Port 3011. **15/15 improvements COMPLETE + typosquat accuracy**. 36 endpoints, 310 tests. 4 detection engines (typosquat 12-algo, dark web, credential leak, attack surface). Typosquat accuracy: 7 new methods (combosquatting, bitsquatting, keyboard proximity, vowel-swap, repetition, hyphenation, subdomain), composite scoring (Jaro-Winkler + soundex + TLD risk + phonetic), CertStream real-time monitor, domain enricher. P0-P2 all COMPLETE. FEATURE-COMPLETE. |
| threat-graph | 4 | 🔨 WIP | 2026-03-23 | Port 3012. 20 improvements complete (#1-20). 32 endpoints, 294 tests. Neo4j graph, risk propagation, STIX export, cluster detection, batch import, decay cron, merge/split, trending. Ready for deploy. |
| correlation-engine | 4 | 🔨 WIP | 2026-03-23 | Port 3013. **15/15 improvements COMPLETE** (#1-15). 20 endpoints, 166 tests. In-memory. P1: co-occurrence, infra clustering, temporal waves, TTP similarity, DBSCAN campaigns, confidence scoring, Diamond Model, Kill Chain, FP suppression, BFS inference. P2: AI pattern detection (Sonnet), rule templates (6), confidence decay, batch re-correlation, graph integration. |
| threat-hunting | 4 | 🔨 WIP | 2026-03-23 | Port 3014. **15/15 improvements COMPLETE**. 47 endpoints, 222 tests. Hunt query builder, session manager, IOC pivot, saved hunts, hypothesis engine, AI suggestions, timeline, evidence, collaboration, pattern recognition, playbooks, scoring, import/export. |
| enterprise-integration | 5 | 🔨 WIP | 2026-03-23 | Port 3015. **Core + 5 P0 improvements COMPLETE**. 24 endpoints, 174 tests. SIEM (Splunk/Sentinel/Elastic), webhooks (HMAC+DLQ), ticketing (ServiceNow/Jira), STIX/TAXII 2.1, bulk export. Event router, credential encryption, rate limiter, health dashboard. FEATURE-COMPLETE. |
| user-management | 5 | 🔨 WIP | 2026-03-23 | Port 3016. **Core + 5 P0 improvements COMPLETE**. 32 endpoints, 185 tests. RBAC (15 resources, 6 built-in roles, custom role builder, inheritance). Team mgmt (invite, roles, deactivate). SSO config (SAML 2.0 + OIDC per-tenant). MFA (TOTP + backup codes + enforcement). Break-glass (recovery codes, 30-min sessions, audit). P0: permission inheritance, SOC2 audit trail, brute-force protection, session management, password policy. FEATURE-COMPLETE. |
| customization | 5 | ✅ Complete | 2026-03-23 | Port 3017. **Core + 5 P0 improvements COMPLETE**. 35 endpoints, 159 tests. Module toggles (per-tenant enable/disable, feature flags). AI model selection (Claude model per task, token budget/cost limits). Risk score weight customization (composite confidence weights, decay rate overrides). Dashboard customization (widget layout, default filters/time ranges). Notification preferences (per-user alert channels, severity thresholds). P0: config inheritance, versioning, validation engine, import/export, audit trail. FEATURE-COMPLETE. **Phase 5 COMPLETE (3/3).** |
| onboarding | 6 | ✅ Deployed | 2026-03-23 | Port 3018. **Core + 5 P0 improvements COMPLETE**. 32 endpoints, 190 tests. 8-step wizard (welcome → org → team → feeds → integrations → dashboard → readiness → launch). Data source connectors (8 types). Pipeline health checker. Module readiness with dependency validation. Progress tracker with readiness scoring. P0: prerequisite validation, demo data seeding (150 IOCs, 10 actors, 20 malware, 50 CVEs), integration testing (DNS→TCP→auth→data), checklist persistence, welcome dashboard with guided tips. Phase 6: 1/3. |
| billing | 6 | ✅ Complete | 2026-03-23 | Port 3019. 28 endpoints, 5 P0 improvements, 149 tests. Plan management (Free/Starter/Pro/Enterprise), usage metering (80/90/100% alerts), Razorpay subscriptions/webhooks, GST invoices (18%), upgrade/downgrade with 72hr grace, coupon codes. FEATURE-COMPLETE. |
| admin-ops | 6 | ✅ Complete | 2026-03-23 | Port 3022. **Core + 5 P0 improvements COMPLETE**. 28 endpoints, 147 tests. System health (18 services), maintenance windows (CRUD + activate/deactivate), backup/restore, tenant admin (CRUD + suspend/reinstate/plan/usage), audit log (CSV export). P0: dependency map, alert rules (seeded 5 defaults), scheduled maintenance (cron), tenant analytics, admin activity log. FEATURE-COMPLETE. **Phase 6 COMPLETE (3/3).** |

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
user-service          → shared-types, shared-utils, shared-auth
api-gateway           → shared-types, shared-utils, shared-auth, user-service
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
onboarding            → shared-types, shared-utils, shared-auth (Phase 6)
billing-service       → shared-types, shared-utils, shared-auth, razorpay (Phase 6)
admin-service         → shared-types, shared-utils, shared-auth (Phase 6)
frontend              → shared-types, shared-ui, d3 (Phase 1+)
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

- **Current phase:** Phase 6 COMPLETE — All 28 modules built + deployed. Phase 6 frontend 3/3 COMPLETE (Billing + Admin Ops + Onboarding). All 16 pages done. 4311 tests (500 frontend + 3811 backend).
- **Last session outcome:** Session 46 (2026-03-24). OnboardingPage complete (Phase 6 frontend 3/3). 4 tabs: Setup Wizard (8-step stepper with CURRENT badge + Complete/Skip buttons), Pipeline Health (5 stage cards), Module Status (grid with status badges), Quick Start (stat chips, tips, Seed Demo Data). 7 files: phase6-demo-data.ts, use-phase6-data.ts, OnboardingPage.tsx (312 lines), ModuleIcons.tsx (IconOnboarding), modules.ts, App.tsx, phase6-pages.test.tsx (+25 tests). 500 frontend tests. CI green (run 23461768159). Session was verification — commits already existed from session 45 continuation (85c4bc7 → b2f1e98).
- **Known issues:** Raw GH_TOKEN + SSH key previously committed — rotated, history not purged. VPS SSH occasionally times out (RCA #6). VT/AbuseIPDB free-tier keys exposed in chat — rotate after testing. Bundle at 710KB (D3 added 190KB — consider code-splitting). Demo fallback code should be gated by VITE_DEMO_MODE env var before production users. QA_CHECKLIST.md needs updating (stale since session 23). Razorpay keys need real values in VPS .env. Pre-existing TS errors in VulnerabilityListPage.tsx + shared-ui PageStatsBarProps (missing title/isDemo — cosmetic, tests pass).
- **Next tasks:** (1) Update docs/QA_CHECKLIST.md (stale since session 23). (2) Elasticsearch IOC indexing service (Phase 7 — module 20, port 3020). (3) Frontend code-splitting for D3 bundle (710KB → target <400KB).

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
- VPS: 72.61.227.64, 8GB RAM (~8GB estimated by 20 containers), 96GB disk (26% used)
- CI/CD: GitHub Actions deploy.yml → VPS, last run green
- Caddy: routing ti.intelwatch.in → etip_nginx
- SSH: Port 22 filtered, use GitHub Actions vps-cmd.yml or Cloudflare Tunnel
- API keys configured: TI_VIRUSTOTAL_API_KEY (free, 4/min), TI_ABUSEIPDB_API_KEY (free, 1000/day), TI_AI_ENABLED=true
