# ETIP Project State
**Last updated:** 2026-03-23 (update at end of EVERY session via /session-end)
**Session counter:** 33

## Deployment Status
| Service | Status | Version | Last Deploy | Notes |
|---------|--------|---------|-------------|-------|
| etip_api | ✅ Running | 0.1.0 | 2026-03-21 | Health check passing |
| etip_frontend | ✅ Running | 0.2.0 | 2026-03-23 | Dashboard + 10 data pages + demo fallbacks. Phase 4 frontend live. |
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
| etip_threat_graph | ⏳ Deploy triggered | 2.0.0 | 2026-03-23 | Port 3012. Neo4j knowledge graph. 32 endpoints, 20 improvements (#1-20), 294 tests. Added to deploy.yml + nginx. |
| etip_correlation | ⏳ Deploy triggered | 0.1.0 | 2026-03-23 | Port 3013. 20 endpoints, 15/15 improvements, 166 tests. Added to deploy.yml + nginx. |
| etip_hunting | ⏳ Deploy triggered | 0.1.0 | 2026-03-23 | Port 3014. 47 endpoints, 15/15 improvements, 222 tests. Added to deploy.yml + nginx. |
| etip_drp | ⏳ Deploy triggered | 0.1.0 | 2026-03-23 | Port 3011. 36 endpoints, 310 tests. Added to deploy.yml + nginx. |
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
| frontend | 1 | ✅ UI FROZEN | 2026-03-23 | **10 data pages** (IOC, Feed, Actor, Malware, Vuln, Enrichment, DRP, Graph, Correlation, Hunting). 17 viz components. 273 tests. All 4 Phase 4 pages fully interactive (CRUD, triage, path finder, feedback). **Existing pages FROZEN.** |
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
| enterprise-integration | 5 | 🔨 WIP | 2026-03-23 | Scaffolded. Port 3015. 3 tests. |
| user-management | 5 | 📋 Not started | - | Phase 5 gate |
| customization | 5 | 📋 Not started | - | Phase 5 gate |
| onboarding | 6 | 📋 Not started | - | Phase 6 gate |
| billing | 6 | 📋 Not started | - | Phase 6 gate |
| admin-ops | 6 | 📋 Not started | - | Phase 6 gate |

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

- **Current phase:** Phase 4 COMPLETE — backend + frontend + deploy. All 4 Phase 4 modules FEATURE-COMPLETE with frontend pages. Phase 3 + Differentiators A/A+/B all COMPLETE. Ready for Phase 5.
- **Last session outcome:** Session 33 (2026-03-23). Phase 4 Frontend: 4 new pages + full interactivity for all 4 pages. 7 commits. DRP: asset CRUD, alert triage, typosquat scanner. Graph: path finder, add node, STIX export, node size=risk. Correlation: TP/FP feedback, auto-correlate results. Hunting: create hunt, status controls, add hypothesis/evidence. Deploy pipeline: 4 backend services added. 273 frontend tests (was 217). Commits: f3ed4b5→81aa53a.
- **Known issues:** Raw GH_TOKEN + SSH key previously committed — rotated, history not purged. VPS SSH occasionally times out (RCA #6). VT/AbuseIPDB free-tier keys exposed in chat — rotate after testing. Bundle at 710KB (D3 added 190KB — consider code-splitting). Demo fallback code should be gated by VITE_DEMO_MODE env var before production users. QA_CHECKLIST.md needs updating. DRP + hunting + correlation all use `alert:read`/`alert:create` permissions — needs dedicated permissions. 1 pre-existing test failure in shared-auth (not new). Phase 4 backend deploy CI pending — verify health checks after CI completes.
- **Next tasks:** (1) Verify Phase 4 deploy health after CI completes. (2) Phase 5: Enterprise Integration (Module 15). (3) Add dedicated RBAC permissions for Phase 4 services. (4) Elasticsearch IOC indexing. (5) Update QA_CHECKLIST.md. (6) Mobile responsive testing at 375px/768px for Phase 4 pages.

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
- VPS: 72.61.227.64, 8GB RAM (~8GB estimated by 19 containers), 96GB disk (26% used)
- CI/CD: GitHub Actions deploy.yml → VPS, last run green
- Caddy: routing ti.intelwatch.in → etip_nginx
- SSH: Port 22 filtered, use GitHub Actions vps-cmd.yml or Cloudflare Tunnel
- API keys configured: TI_VIRUSTOTAL_API_KEY (free, 4/min), TI_ABUSEIPDB_API_KEY (free, 1000/day), TI_AI_ENABLED=true
