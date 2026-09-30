# Pending work — consolidated backlog

**Last reviewed:** 2026-09-30, session 177 part 2 (after Step 3 rows S159/S159d/S159e went live, PR #70, `47201c0`). Built from a full sweep of `docs/` (roadmap specs, PROJECT_STATE, SESSION_HANDOFF, DECISIONS_LOG, stats page, session docs, module docs, runbooks, architecture docs) with code spot-checks.

**How to use:** the session task queue in `docs/SESSION_HANDOFF.md` says what is *next*; this file is the full list behind it. When an item closes, mark it here in the same commit. Self-serve payments are deliberately left out (owner-deferred).

## 1. Roadmap steps (`docs/roadmap/`)

| Step | Status | What's left |
|---|---|---|
| 0, 0B, 2 | ✅ Done | — |
| 1 · Stay up | ✅ Done | Off-site backup copy (rclone); failover option not chosen (`STEP_01_STAY_UP.md` §later) |
| **3 · Persistence** | 🔨 In progress — rows 154-0 (S175), 154 (S176), 155/156/157/158a/158b (S177 PR #69, `e10897d`), and 159/159d/159e (S177 part 2, PR #70, `47201c0`) done and live | **NEXT** = wire the offboarding purge scheduler (owner go-ahead needed — destructive), then owner decision on onboarding's "Seed Demo Data" button, then **S159b** caching-service archive rebuild from MinIO, then S159c analytics tenant trends (belongs with the owner-scheduled security fix). Backlog: reporting, customization, user-management, correlation |
| 4 · DB roles + RLS | ⏳ Not started (after Step 3) | Sessions 160a–m; owner decisions E1–E7; must cover the new alert tables |
| 5 · Honest UI | 🔨 Mostly done | S173 wiring fixes (see §3); real Clients tenant list; remaining `isDemo` hooks; SparklineCell fake trend (`generateStubTrend`); owner decisions O1–O4. Status line in the spec is stale |
| 6 · Cleanup | 🔨 PR1 done (S171) | DECISION-032 proposal (not yet accepted); split files >400 lines as they are touched |
| 7 · Consolidate runtime | ⏳ Blocked on DECISION-032 | ~7 deployables, runtime-host pilot |
| 8 · Observability | ⏳ Not started | 8a–e + per-service adoption; 6 owner decisions |
| 9 · Connector plugins | ⏳ Not started | 9-0 (can go first) → 9-G; 6 owner decisions |
| 10 · Agent foundation | ⏳ Not started | 10a–g; owner decisions D1–D8 |
| 11–13 · Copilot, rules, playbooks, retro-hunt | ⏳ After Step 10 | F1–F4 |
| 14 · More features | ⏳ Not started | Sandbox, ATT&CK heatmap, vendor risk (DRP engines are simulated today — make real first), India focus, browser extension |
| 15 · SIEM / threat exposure | 🔨 Phase 1 done (S168) | Phase 2 needs 7 owner decisions; the architecture/UI spec is not built. Spec status line is stale |

## 2. Parallel track — SEO + weekly threat brief (`docs/roadmap/PARALLEL_REVENUE_GROWTH.md`, `docs/SEO_PLAN.md`)

- **SEO done:** robots, sitemap, OG image, JSON-LD, true 404/noindex, lazy pages, prerender + page meta, `/pricing` (S147).
- **SEO pending** (code-checked 2026-09-30: `apps/frontend/src/seo/public-routes.ts` lists only `/` and `/pricing`; sitemap hand-written with 2 URLs):
  - G1 — sitemap generated from `public-routes.ts` + self-host fonts (S)
  - G2 — `/features/*` (8 pages) (M)
  - G3 — `/solutions/*` + about/contact/privacy/terms/security (M; privacy/terms need owner text)
  - G4 — glossary (M)
  - G5–6 — public CVE pages (L; needs owner decision O-S1, global data source)
  - G7+ — free tools, starting with EPSS/CVE lookup (L)
  - IndexNow ping; compare pages; India cluster
- **Weekly threat brief:** B1 real reporting aggregator (today's reports use hard-coded/random numbers) → B2 brief builder + routes → B3 `/blog` + RSS. Owner decisions O-B1–O-B3.

## 3. Standing backlog (outside the steps)

- **Offboarding purge worker is never scheduled** (S177 part 2, PR #70 finding): `runPurgeCheck` exists but no daily job calls it, `ExternalPurger.fromEnv` is never invoked, and `etip_user_management` lacks the Neo4j/ES env it would need — offboarded tenants are never hard-deleted. Wire the scheduler + compose env; destructive, needs care and an owner go-ahead. Known gap since S148.
- **Onboarding "Seed Demo Data" writes fabricated data into the tenant's real stores** (S177 part 2, PR #70 finding): the button (`apps/frontend/src/pages/OnboardingPage.tsx:257`, `POST /onboarding/welcome/seed-demo`) and the "real" path's `POST /welcome/seed-demo` (`apps/onboarding/src/routes/welcome.ts:62–64`) seed fabricated IOCs/actors/malware/vulnerabilities — conflicts with DECISION-048. Owner decision: remove the button/route, or restrict to a demo tenant.
- **Wiring fixes from the S173 sweep:** `apiList` drops pagination totals; broken request bodies (correlation Create Ticket, DRP bulk triage + takedown, Jira/ServiceNow form); admin `TenantRecord` type vs real `/admin/tenants`; missing/mismatched routes (TAXII managed-collection list, global IOC stats, `/ingestion/catalog/subscription-stats`, `/analytics/feed-performance` shape, per-source enrichment breakdown, test-notification route).
- **AI enrichment runner** (DECISION-045) — also replaces fake vendor verdicts; batch path needs a tenant-budget check and a per-IOC trigger cooldown before `TI_BATCH_ENABLED` is used (`docs/S164_AI_ENRICHMENT_AUTO_ENRICH.md`).
- **Real user & tenant provisioning** — invite, SSO/JIT, Add-Client.
- **Alert notification delivery** — Slack/webhook/email are log-only in `apps/alerting-service/src/services/notifier.ts`.
- **Graph visual redesign** — needs owner reference designs.
- **Owner-scheduled security fix** — needs owner go-ahead + adversarial review, before the first real customer.
- **Plan-gate leftovers (S174):** usage counters on nginx-proxied routes; Command Center Alerts & Reports tab plan check; stale `apps/api-gateway/src/config/feature-routes.ts` entries.
- **Audit leftovers:** demo rows on IOC/malware/vuln/actor lists, fake MITRE IDs on actors, `PageStatsBar` Demo badge (shared-ui, owner OK needed), `EnrichmentSourceWidget`/`AiCostWidget` `isDemo`, dead demo code (old audit PR 4).
- **Quality:** check other services' error handlers for 4xx masked as 500 (RCA #49 pattern); route-permission coverage test.
- **Ops:** Shodan/GreyNoise API keys not set on VPS; GitHub Actions Node 20 → 24 migration.
- **UI polish** (`docs/FUTURE_IMPROVEMENTS.md`): timeline animation, graph node click-through/hover, EntityChip/SeverityBadge case convention.
- **S177 follow-ups (Step 3 persistence, RCA #66–#68):** admin-service `queue-alert-evaluator.ts:210` LPUSHes raw JSON into `bull:etip-alert-evaluate:wait` — should use `Queue.add`; api-gateway `plugins/quota-enforcement.ts:200` `lpush(QUEUES.ALERT_EVALUATE, …)` onto a plain Redis list nobody consumes; ALERT_EVALUATE producers (correlation-engine, normalization) set no `attempts`/backoff, so a job failed by `DB_UNAVAILABLE` is not retried; integration DLQ "retry" only flips status to `retrying` — nothing re-sends; exports support only `iocs` — other entity types return 400; Redis queue `etip-cache-invalidate` had 550,602 waiting jobs on 2026-09-30 — consumer fixed in S177 (RCA #66: dropped Redis password + wrong prefix); backlog confirmed drained 550,602 → 0 within ~10 min of the S177 deploy; `@etip/shared-persistence` `RedisJsonStore` data-loss traps (DECISION-051) — fix or retire before any app uses it; alert worker concurrency 5 — a burst can race dedup/cooldown and create a duplicate alert; escalation dispatcher assumes one alerting instance; `apps/integration-service/src/services/integration-store.ts` is at 397/400 lines — split before the next change.

## 4. Owner inputs pending

Graph reference designs · security-fix go-ahead · `PageStatsBar` OK · Step 15 Phase-2 decisions (7) · DECISION-032 · decisions for Steps 4 (E1–E7), 5 (O1–O4), 8, 9, 10 (D1–D8) · SEO O-S1 · brief O-B1–O-B3 · privacy/terms text · confirm Search Console / Bing / IndexNow setup · Step 1 failover choice.

## 5. Stale docs to sync (small docs task)

- Status lines in `STEP_03_PERSISTENCE.md` (header), `STEP_05_HONEST_UI.md`, `STEP_15_SIEM_INTEGRATIONS.md` lag the real state.
- `docs/QA_CHECKLIST.md` last updated session 95 — not reliable for current state.
- `docs/PHASE1_AUDIT.md`, `docs/PROJECT_ASSESSMENT.md`, `docs/ETIP_Strategic_Architecture_Review.md` — historical snapshots; the 8-phase plan in `docs/architecture/ETIP_Architecture_Blueprint_v4.html` is superseded by the STEP roadmap.
- `docs/SEO_PLAN.md` still says Phase 1 "not yet deployed" (it is, S147).
