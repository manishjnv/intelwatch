# ETIP Roadmap — Session 149 onward

**Written:** 2026-09-25 (after the S148 review). **Status:** proposed plan. The owner approves each phase before it starts.
**Replaces:** the "Next tasks" list in PROJECT_STATE.md (which now points here). Older plans that remain valid: docs/SEO_PLAN.md (Phase 2–4), docs/S147_APP_WIRING_FOLLOWUPS.md (details for Phase 2 below).

**Rules:** one module per session (CLAUDE.md scope lock). Size: S = 1–2 files, M = 3–5 files (plan mode), L = split it. A 🔒 marks security-adjacent work, which needs an adversarial review before push.

---

## 1. Where we stand (short)

- **Done:** 23 backend services, frontend with 24 pages + Command Center, 13 feed connectors, global feed processing (DECISION-029), RBAC/SSO/MFA/SCIM, billing, TAXII 2.1, SEO phase 1 + pricing page, offboarding purge (#32), exec-bit fix (#31).
- **Rough completion:** features coded ~90% · wired end to end in production ~60% · production-ready (data kept, monitored, paid signup) ~50%. **Overall ~70%.**

## 2. Weak points (verified 2026-09-25)

| # | Weak point | Evidence | Fixed in |
|---|---|---|---|
| W1 | No outside uptime alert. A 46 h outage went unseen | S148 incident | Phase 0 |
| W2 | A deploy's SSH drop can leave containers half-started | S148 (nginx `Created`) | Phase 0 |
| W3 | ⌘K search is empty: ES holds 0 docs vs 5,934 IOCs | S147 follow-up A | Phase 0 |
| W4 | Business data lives only in memory and is lost on every restart: **alerting** (rules, channels, alerts, escalations), **integration** (integrations, webhooks, DLQ, tickets, export schedules), **drp**, **hunting** | `new Map<` stores, no repo or checkpoint. DECISION-027 migration unfinished for these | Phase 1 |
| W5 | App connects to Postgres as a superuser with BYPASSRLS, so RLS is not a safety net | S147 notes | Phase 1 |
| W6 | UI shows demo data when an API **fails**, so users can't tell real data from fake | S147 follow-up B | Phase 2 |
| W7 | UI calls ~8 endpoints that don't exist | S147 follow-up C | Phase 2 |
| W8 | Command Center "Clients" is an in-memory registry, not the real tenants | DECISION-013 leftover | Phase 2 |
| W9 | 23+ processes on one VPS. Each one is another thing to fail, watch and deploy | 32 containers | Phase 3 |
| W10 | 11 empty or duplicate folders in `apps/` (`auth`, `billing`, `reporting`, `websocket`, `threat-hunting`, …) | `ls apps` | Phase 3 |
| W11 | 39 source files over the 400-line limit | `wc -l` | Phase 3 (as touched) |
| W12 | No self-serve payment; every paid plan is set by hand | DECISION-031 | Phase 4 |
| W13 | Enrichment is idle (AI off by default), so IOCs have no verdicts | "Enriched today 0" | Phase 2 |
| W14 | More in-memory state: **caching-service** archive manifests (MinIO archive index — restore may break after restart), **analytics** trend snapshots, **onboarding** module-readiness | `new Map<` in `archive-store.ts`, `trend-calculator.ts`, `module-readiness.ts` | Phase 1 |
| W15 | No tested backup/restore and no failover: one VPS, one Postgres | single KVM4 | Phase 0 (backups) / later (failover) |
| W16 | CI deploy sometimes fails with `websocket: bad handshake` (Cloudflare tunnel SSH); fixed today by a manual re-run | S147 notes | Phase 0 |
| W17 | Demo annual prices in `use-plan-builder.ts` (99,999 / 189,999 / 499,999) differ from the seeds | DECISION-030 note | Phase 2 |
| W18 🔒 | Cross-tenant reads: es-indexing search, alerting and reporting take `tenantId` from the query string with no JWT check | `search.ts:19-31`, `alerts.ts:29`, `reports.ts:38` | Step 0B |
| W19 🔒 | Secrets with repo defaults: integration encryption key (not set in compose); Grafana public with default password. Razorpay placeholders are expected (deferred, DECISION-031) but the webhook route should be off until live | STEP_00B U4–U6 | Step 0B |
| W20 | Redis `allkeys-lru` 256 MB can evict BullMQ jobs and Redis-JSON config | compose:45-48 | Step 0B |
| W21 | Deploy: schema push after restart and failures ignored; no `concurrency:`; docs-only merges redeploy | deploy.yml:192,197 | Step 1 |
| W22 | Global MISP + REST workers share one queue → REST feeds auto-disabled (global mode only) | ingestion scheduler:26-28 | Step 0B |
| W23 | Fake data in the backend: every report uses hard-coded numbers (`data-aggregator.ts`); 7 DRP engines use `Math.random`; caching archives upload `sample-*` records | reporting, drp, caching | Steps 3, 5, before F7 |
| W24 | More in-memory stores: **reporting** (reports, schedules, templates), user-management teams/roles/MFA policy, global AI config, customization BYOK | STEP_03 | Step 3 |
| W25 | RLS is not applied anywhere: `withRls` never called; 6 tenant tables have no policy; policies were applied by hand | STEP_04 | Step 4 |
| W26 | Service-to-service JWT never verified (`verifyServiceToken` unused); hunting→graph pivot calls a route that doesn't exist | STEP_10 | Step 4/10 |
| W27 | 4 connectors unusable (threatfox, urlhaus, malwarebazaar, feodo missing from API + DB enum); 6 DB types rejected by API | STEP_09 | Step 9 |
| W28 | (Deferred by decision) Razorpay path broken end to end (webhook signs re-serialised JSON, no invoice, `teams` vs `pro` plan id) | PARALLEL_REVENUE_GROWTH | Parallel track |
| W29 | `TI_AI_ENABLED=false` also switches off free VT/AbuseIPDB lookups; `TI_IOC_INDEX_ENABLED="false"` reads as true | ai-enrichment | Steps 2, 5 |
| W30 | Hard-coded old model IDs and stale prices (~15 places) | ai-enrichment, customization | Step 10 |

## 3. Implementation order (master sequence)

Build in this order. **Don't start a step until the step before it is green in production.** The reason for each position is in the "Why here" column. Session-level detail is in §4. **Implementation specs** (flow, backend, frontend, data model, tests, acceptance, rollback) for each step are in `docs/roadmap/` — start each session by reading the matching `STEP_XX_*.md`.

| Step | What | Architecture piece (§6) | Why here |
|---|---|---|---|
| 0 | **Dev workflow:** one `git worktree` per Claude session, only one session deploys at a time, a review/test subagent before push | Dev: one module per session | Costs nothing, and prevents the S148 two-sessions-one-tree mess for every step after it |
| 0B | **Urgent fixes (STEP_00B):** cross-tenant reads, default secrets, Grafana, Redis eviction, MISP/REST queue, fake MFA secret | Security base | Real data leaks and silent data loss. Small, isolated, and must land before search is filled (step 2) |
| 1 | **Stay up:** uptime alert, safer deploy + retry for SSH flake, cleanup cron, backup + restore drill (S149) | Ops base | Nothing else matters while the site can be down for 46 h unnoticed |
| 2 | **Search works:** index at normalization + backfill + ⌘K fix (7 sessions, see STEP_02) | Pipeline workers own indexing | Core product promise. Copilot and hunting (steps 10–13) need a working index |
| 3 | **No data in memory:** alerting, integration, DRP, hunting, caching archives, analytics trends, onboarding readiness → Postgres/Redis (S154–159b) | Rule: stateless processes | Required **before** merging processes (step 7). Stateless services can be moved or restarted safely |
| 4 | **Least-privilege DB role + real RLS** (S160) 🔒 | Tenant isolation at the DB | Must exist before AI agents (step 10) can query data on a tenant's behalf |
| 5 | **Honest UI + missing endpoints + auto-enrich critical IOCs** (S161–166) | One API/error pattern | Users (and you) can trust what they see. Needed before selling |
| 6 | **Cleanup:** delete 11 empty folders; accept or reject DECISION-032 (S167–168) | Decision gate | A clean map before moving things around |
| 7 | **Consolidate the runtime** (baseline: the 26 Node services use only ~1.2 GiB in total, so the gain is fewer moving parts, not RAM): pilot 3 small services in one process, then roll out group by group to ~7 deployables (S169+) | Modular core + workers | Do it **before** adding new modules, so steps 9–14 land in the new layout rather than as 3 more containers |
| 8 | **Observability:** Grafana alerts, request-ID across services | Ops | Fewer processes = easier to watch. Needed before autonomous agent actions |
| 9 | **Connector plugin interface** (fetch / map / health) in ingestion + integration | Plug-in connectors (OpenCTI model) | Makes new feeds (CERT-In) and new tools (sandbox, SIEM push) small plug-ins instead of services |
| 10 | **Agent foundation:** one `agent-service` with a tool layer over existing APIs, tenant-scoped auth, cost cap, audit log, human approval for actions | AI agent layer | One base for all AI features. Build it once |
| 11 | **F1 AI Copilot** (read-only Q&A with citations) | Agent layer, read tools | Safest first agent (no actions), biggest market gap |
| 12 | **F2 Detection rules** (Sigma/YARA/KQL/SPL) + SIEM push | Agent tool + integration plug-in | Uses copilot tools. High SOC value |
| 13 | **F3 Playbooks** (trigger → conditions → actions, with approval) + **F4 Retro-hunt** | Agent actions + workers | Needs step 8 (monitoring) and step 10 (approval flow) |
| 14 | **F5 Sandbox, F6 ATT&CK heatmap, F7 Vendor risk (make DRP engines real first — W23), F8 India feeds, F9 Browser extension** | Plug-ins + frontend | Each is small once steps 9–10 exist. Pick by customer demand |
| ∥ | **Parallel track (any time after step 1):** SEO pages, weekly threat brief; Razorpay checkout after step 5 (needs a new DECISION) | — | Growth doesn't depend on the architecture work, but paid signup needs an honest UI first |

**In one line:** stabilise → make data correct and persistent → make the UI truthful → simplify the runtime → add plug-in and agent foundations → then build competitor features on top.

## 4. Session plan

_Renumbered 2026-09-26 (S150): Step 1 took S150; Step 2 expanded to 7 sessions (S151–S157); later sessions shifted +4._

### Phase 0 — Stay up, and search that works (S149–S157)
| S | Module | Task | Size |
|---|---|---|---|
| 149 | ops (`.github/workflows`, `scripts/`) | External uptime check (UptimeRobot or Cloudflare health check → email/Telegram) on `/` and `/api/v1/health`. Deploy step: run the VPS side under `setsid nohup`, SSH `ServerAliveInterval=15`, then `compose up -d` a second time as a final check. Install the docker-cleanup cron. Verify `health-recovery.sh` is `-rwx` on the VPS. Retry wrapper for the tunnel-SSH `bad handshake` flake (W16). Check backups exist for Postgres/Neo4j/ES/MinIO and do one restore drill (W15). **✅ Done in S150 (Step 1, PR #36 → 112c39f); Step 0B was S149 (PR #35)** | M |
| — | owner | Click through the logged-in app: dashboard, IOCs, Command Center, billing, reports. **✅ S149 (post-0B login + click-through)** | — |
| 151 | packages/shared-utils | Shared `IocDocumentSchema` v2, `IocIndexJobSchema`, job ID generation, toIocDocument helper. DECISION-033 (global vs tenant index option A now, B later) | S |
| 152 | elasticsearch-indexing-service 🔒 | Type mapping, update/delete on missing docs, JWT search validation, revoked filter, simple_query_string fallback | M |
| 153 | normalization | IOC_INDEX queue at upsert, backfill config flag, job production with versioned jobId | M |
| 154 | ai-enrichment | Enrichment update jobs with full payload, queue options, config boolean fix | S |
| 155 | api-gateway 🔒 | Backfill endpoint `/api/v1/gateway/search/backfill`, page-per-tenant reindex, audit log, dryRun mode | M |
| 156 | frontend | GlobalSearch + /search page: use `/api/v1/search/iocs` with Bearer token, map result shape, error handling | M |
| 157 | ioc-intelligence | Index jobs on create, update (lifecycle), delete, bulk, all operation types | S |

### Phase 1 — Don't lose data (S158–S164), per DECISION-027
| S | Module | Task | Size |
|---|---|---|---|
| 158 | alerting-service | Prisma models + repos for rules, channels, alerts, escalation policies, maintenance windows (dual-mode store pattern from billing) | L → 2 |
| 160 | integration-service | Prisma for integrations, webhook deliveries + DLQ, tickets, export schedules. Encrypt stored credentials | L → 2 |
| 162 | drp-service | Prisma for monitored assets + findings (store used by 20 files) | L → 2 |
| 162b | reporting-service | Persist reports, schedules, templates; replace hard-coded report data with real aggregation (W23, W24) | L → 2 |
| 163 | hunting-service | Redis JSON via `@etip/shared-persistence` for hunts, saved queries, evidence | M |
| 163b | caching-service / analytics-service / onboarding | Persist archive manifests (Postgres), trend snapshots and module-readiness (Redis JSON) (W14). One module per session | S each |
| 164 | prisma / ops 🔒 | Least-privilege app role (no superuser, no BYPASSRLS); test RLS per tenant; keep a migration role for deploys | M |

Rule from now on: **no business data in memory.** Maps are allowed only for caches, rate limits and short buffers.

### Phase 2 — Make the UI honest (S165–S170)
| S | Module | Task | Size |
|---|---|---|---|
| 165 | frontend | Replace `withDemoFallback` on error paths with a "Couldn't load — Retry" state. Demo data only for brand-new empty tenants, clearly labelled | M |
| 166 | user-management-service | `GET /users` (member list), teams, roles, audit, stats. Where a backend route already exists, fix the UI path instead | M |
| 167 | frontend | Fix the remaining wrong paths/shapes: MFA policy, ticketing create, AI global config shape | S |
| 168 | ai-enrichment | `GET /enrichment/ioc/:id`. Auto-enrich **critical/high** IOCs by default with a daily cost cap (W13) | M |
| 169 | threat-graph | Graph overview endpoint (top entities/clusters) for the graph landing page | S |
| 169b | frontend | Align demo annual prices in `use-plan-builder.ts` with the seeds (W17) — fold into S165 if that session touches it | S |
| 170 | admin-service | Command Center "Clients" reads real tenants (via user-service/billing APIs), not the in-memory registry | M |

### Phase 3 — Simpler runtime (S171+) — needs an owner decision; do before Phase 5 adds new modules
| S | Module | Task | Size |
|---|---|---|---|
| 171 | chore | Delete the 11 empty `apps/` folders. Update PROJECT_STATE module table | S |
| 172 | docs | **DECISION-032 (proposed): consolidate the runtime into ~7 deployables** (see §6). Design + pilot plan | S |
| 173+ | per group | Pilot: host 3 small services (analytics, caching, admin) as Fastify plugins in one process. Measure RAM + deploy time. Roll out group by group only if the pilot is clean | M each |
| ongoing | any | Split files >400 lines when a session touches them | — |
| later | ops | Failover: second VPS or managed Postgres, once there are paying customers (W15) | L |
| later | ops | Grafana alert rules → email/Telegram. Request-ID tracing across services (OpenTelemetry later) | M |

### Phase 4 — Revenue + growth (parallel track)
| Module | Task |
|---|---|
| billing-service + frontend 🔒 | Razorpay self-serve checkout: order → checkout → signature-verified webhook → plan applied. Needs a new DECISION that updates DECISION-031 |
| frontend / vulnerability-intel | SEO_PLAN Phase 2.2–2.4 (feature pages, glossary) then Phase 3 (public CVE pages, free tools) |
| reporting-service | Weekly India + global threat brief from pipeline data (for SEO and customers) |

### Phase 5 — Competitor gaps (after Phase 3 + agent foundation — see §3 steps 9–14)
Ordered by value to a mid-market SOC ÷ effort.

| # | Feature | Who has it | Module | Size |
|---|---|---|---|---|
| F1 | **AI Copilot**: ask questions in plain language ("which IOCs hit our assets this week?"). Uses tool calls to existing service APIs, answers with citations, tenant-scoped, with a cost cap | Recorded Future AI, Google TI (Gemini), MS Security Copilot, CrowdStrike Charlotte | new `agent-service` | L → 3 |
| F2 | **Detection rules from intel**: Sigma / YARA / KQL / SPL from IOCs + ATT&CK techniques; one-click push to SIEM | Recorded Future, SOC Prime, Google TI | hunting-service (+ integration push) | M → 2 |
| F3 | **Light playbooks**: trigger → conditions → actions (block on firewall, Jira ticket, Slack, enrich) with approval step | ThreatConnect, Anomali, Cyware | new `playbook-service` or integration-service | L → 3 |
| F4 | **Retro-hunt**: when a new IOC arrives, check the last 90 days of customer SIEM logs | Anomali Match, Google TI | hunting-service | M |
| F5 | **Sandbox link**: send hashes/URLs to ANY.RUN / Hybrid Analysis / Triage, store the report | Mandiant, Recorded Future | malware-intel | M |
| F6 | **ATT&CK Navigator heatmap** of techniques seen per tenant | most Tier-1 | frontend | S |
| F7 | **Third-party / vendor risk**: watch vendor domains for leaks, typosquats, exposed services (reuse DRP engines) | Recorded Future, Cyble, CloudSEK, SecurityScorecard | drp-service | M → 2 |
| F8 | **India focus**: CERT-In advisories feed, DPDP/RBI mapping in reports | Cyble, CloudSEK (partly) | ingestion + reporting | M |
| F9 | **Browser extension**: highlight IOCs/CVEs on any web page and show the ETIP verdict | Recorded Future, ThreatConnect | new package | M |

## 5. Better implementation of existing features

- **Indexing:** index at normalization time. Enrichment only *updates* the doc. Search should not depend on AI being on.
- **Enrichment:** tiered. Free sources for everything, paid APIs + AI only for high/critical, and a per-tenant daily budget (Command Center already tracks cost).
- **Alerts:** one alert store in Postgres. Dedup keys persisted, so a restart doesn't re-fire.
- **Integrations:** credentials encrypted at rest. Webhook retries and DLQ survive restarts.
- **Frontend:** one `apiList()` / error-state pattern everywhere. No silent fallback.
- **Connectors:** treat each feed/integration as a small plugin with a common interface (fetch, map, health) inside ingestion/integration, not as a new service.

## 6. Architecture direction (DECISION-032 proposal — not yet accepted)

**Problem:** 23 services, each ~one feature, on one VPS with one developer. Every service adds a container, a port, a healthcheck, an nginx route and a failure point.

**Proposal: "modular core + workers + agent layer"**
1. **Keep code modular.** `apps/*` stay as separate packages with the same boundaries and tests. Nothing is rewritten.
2. **Run fewer processes (~7 deployables).** Group modules as Fastify plugins:
   - `gateway` (api-gateway + user-service auth)
   - `intel-core` (ioc, threat-actor, malware, vulnerability, correlation)
   - `graph-hunt` (threat-graph, hunting)
   - `platform` (user-management, customization, onboarding, billing, admin, analytics, caching)
   - `integrations` (integration, alerting, reporting)
   - `pipeline-workers` (ingestion, normalization, ai-enrichment, es-indexing — BullMQ workers, scaled by replica count)
   - `drp`
3. **Scale the workers, not the APIs.** The heavy load is the feed → normalize → enrich → index chain, and BullMQ lets it scale per queue.
4. **AI agents are a layer on top**, not a new service per feature: one `agent-service` that calls the existing APIs as tools (MCP-style), with humans approving actions.

DECISION-026 (one backend image) and DECISION-028 (CI-built images) make this cheap: same image, fewer `command:` entries.

## 7. "Build each feature as its own agent?" — recommendation

| Meaning | Verdict | Why |
|---|---|---|
| Each feature = its own microservice | ❌ Not at this stage | This is what we have now (W9). Too many moving parts for one VPS and one developer. Split a module out only when it needs its own scaling |
| Each feature = its own AI agent at runtime | ⚠️ Only for AI tasks | The pipeline must stay deterministic (rules, queues, DB). Use agents for triage, copilot Q&A, hunting, report writing. One agent service with many tools, not many agent services |
| Each feature = its own Claude Code dev session | ✅ Yes | One module per session + `git worktree` per session + a subagent for review/tests. Matches the scope-lock rules and avoids the two-sessions-one-tree problem from S148 |

**How competitors build it:**
- **OpenCTI** (open source): one core platform (Node + GraphQL) + many small **connector** workers for feeds and integrations. Closest model to follow.
- **MISP:** one monolith + optional enrichment modules.
- **Recorded Future / Google Threat Intelligence / CrowdStrike:** one big data platform (an "intelligence graph") with **AI agents on top** (RF AI, Gemini in TI, Charlotte AI) that answer questions and run tasks across the whole platform.
- **Microsoft Security Copilot:** one copilot plus task agents (phishing triage, threat intel briefing) that call platform tools, with human approval.

**Pattern:** a strong core platform with one data model, plug-in connectors, and an AI agent layer on top. Nobody runs one service per feature at our size.
