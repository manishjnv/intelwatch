# S172 — Fabricated-data audit of customer-facing frontend (UNVERIFIED — verify each before fixing)

**Date:** 2026-09-28 · **Source:** read-only Sonnet sweep of `apps/frontend/src` (+ `packages/shared-ui` where pages depend on it) · **Rule:** production never presents invented data as real (DECISION-035/036 honest UI).

**Owner decision (2026-09-28, to be logged as DECISION-048): honest empty states.** A real customer tenant never sees demo data. Every page shows real data or an empty state with a next step ("No hunts yet — Start a hunt", "Activate a feed"). Demo content only in an explicit demo tenant / demo mode for sales. Labelled demo for real tenants is not acceptable.

Owner-observed in production on a new tenant (in addition to the table below): `/iocs` summary "12 active feeds" / "62% covered" while Total = 0; `/search` 20 demo IOCs with only a small "demo" chip; `/hunting` and `/correlation` full demo workbenches behind a "Demo data — connect … service" banner (one demo hunt is credited to the owner by name and references the company's own domain); most Command Center tabs show default data. A page-by-page audit of every route is being added below.

Found after the owner's live test showed fake numbers on a brand-new tenant's dashboard. Already fixed in S172 (PRs #57, #59 and the honest-dashboard-widgets PR): Today's Briefing IOC-trend pill, analytics demo trend seeding, Threat Activity Timeline stub events, Geo Threat Map `DEMO_GEO_DATA`, ATT&CK Tactics weight heuristic.

**Each row below is an agent finding with file:line — confirm in code (and in the browser on a 0-IOC tenant) before changing anything.** Item 1 touches `packages/shared-ui` (Tier 1 frozen — owner approval needed).

| # | Where | What is fabricated | Labelled Demo? | Severity | Real source? |
|---|---|---|---|---|---|
| 1 | `packages/shared-ui/src/components/PageStatsBar.tsx:39` — used by `/alerting`, `/reporting`, `/onboarding` (and the list pages' demo pattern relies on it) | Declares `isDemo`/`title` props but only destructures `children, className`, so the intended "Demo" badge never renders | No (intended yes) | High | Yes — `isDemo` is computed correctly upstream |
| 2 | `components/viz/EnrichmentDetailPanel.tsx:124-125` — IOC detail on `/iocs`, `/search` | `enrichment ?? DEMO_ENRICHMENT_RESULT`, `costData ?? DEMO_IOC_COST`: fake VirusTotal / AbuseIPDB / AI verdicts and cost for any IOC without real enrichment | No | High | Yes — show "not enriched yet" |
| 3 | `components/investigation/InvestigationDrawer.tsx:32-56, 89` — dashboard drawer (Recent IOCs, Threat Score, Top CVEs) | `DEMO_ENRICHMENT[payload.type]`: hardcoded VirusTotal / Shodan / GreyNoise / WHOIS verdicts | No | High | Partial — wire real enrichment or empty state |
| 4 | `pages/IocListPage.tsx`, `MalwareListPage.tsx`, `VulnerabilityListPage.tsx`, `ThreatActorListPage.tsx` (+ `DEMO_MITRE` `ThreatActorListPage.tsx:49/66`) | With 0 rows the hooks' demo fallback fills tables with demo records; no visible indicator (see #1). Actors with no techniques get 3 fake MITRE IDs | No | High | Yes — hooks hit real endpoints |
| 5 | `components/viz/ConfidenceBreakdown.tsx:35-37` — IOC detail | `feedReliability`, `corroborationCount`, `aiConfidence` synthesized from `record.confidence` when absent | No | Medium | No field — show "—" |
| 6 | `hooks/use-global-iocs.ts:131` (`useGlobalIocDetail`) — `/global-monitoring` overlay | On fetch error returns `DEMO_GLOBAL_IOCS[0]` as the real detail; no `isDemo` | No | Medium | Yes — surface the error |
| 7 | `components/command-center/BackupsPanel.tsx:10-19` — Command Center → System | Static `DEMO_BACKUPS` always shown; "Backup Now"/"Restore" are `setTimeout` fakes | No | Medium | None wired — empty state + disable buttons |
| 8 | `hooks/use-analytics-dashboard.ts` (~201-202) | `avgConfidence ?? 72`, `avgEnrichmentQuality ?? 84` | No | Medium | Yes — show "—" |
| 9 | `components/widgets/FeedValueWidget.tsx:15-21, 59` — dashboard | `DEMO_QUALITY` feed scores when feed health empty | **Yes** (Demo pill) | Low | Yes |
| 10 | `components/command-center/TenantSettings.tsx:39` | `DEMO_ORG_PROFILE` as initial form state | No (form default) | Low | n/a |

**Suggested order:** 2 + 3 (fake vendor verdicts — highest trust risk) → 1 + 4 (one shared-component root cause) → 5–8 → 9–10. Pattern that works and can be reused: the `isDemo` + visible amber "Demo" pill (e.g. FeedValueWidget); better still for a paying tenant, an honest empty state.

## Page-by-page audit (second sweep, 2026-09-28) — root causes and fix plan

Spot-verified in code: `IocListPage.tsx:210` `feedCount={12}` literal; `withDemoFallback` definition below.

**Root cause (shared):** `withDemoFallback()` in `apps/frontend/src/hooks/use-analytics-data.ts:22-29` sets `isDemo = !isLoading && !hasData(data)` and swaps in demo data. Almost every `queryFn` also does `.catch(() => empty)`, so a legitimate empty tenant (200 + `[]`) and a failed request look identical → **every new tenant is guaranteed to see demo data**. Same pattern in `hooks/use-command-center.ts:221-227` (Command Center Overview / Configuration / Billing header stats) and `hooks/use-es-search.ts:297` (/search).

| Route | What a new tenant sees | Source | Fix |
|---|---|---|---|
| `/iocs` summary | "12 active feeds" | `IocListPage.tsx:210` hardcoded `feedCount={12}` | real tenant feed count or "—" |
| `/iocs` summary | "62 % covered" enrichment | backend stats source needs fixing (details in private notes) | backend fix, then honest value |
| `/search` | 20 demo IOCs, small chip | `use-es-search.ts:297-484` (`DEMO_ES_RESULTS`, `DEMO_FACETS`) | empty → "No results" |
| `/hunting` | 5 demo hunts behind a banner | `use-phase4-data.ts:375-397` via `withDemoFallback`; data `phase4-demo-data.ts:239-243` | empty → "No hunts yet — Start a hunt" |
| `/correlation` | 6 demo correlations + campaigns | `use-phase4-data.ts:295-330` | empty → "No correlations yet" |
| `/drp` | demo assets/alerts + "Try demo scan" CTA | `DRPWidgets.tsx:204-230`, `phase4-demo-data.ts:58-73` | empty state + real scan CTA |
| `/command-center` Overview, Configuration, Billing headers | `DEMO_TENANT_STATS` / `DEMO_GLOBAL_STATS` / `DEMO_QUEUE_STATS` / `DEMO_PROVIDER_KEYS` | `use-command-center.ts:71-114, 221-227` | real or "—" |
| `/command-center` Settings | `DEMO_BACKUPS` (fake backup/restore buttons), `DEMO_ORG_PROFILE` form default | `BackupsPanel.tsx:10-19`, `TenantSettings.tsx:39` | empty/disabled; blank form |
| `/threat-actors`, `/malware`, `/vulnerabilities`, `/iocs` lists | demo rows when empty (+3 fake MITRE IDs on actors) | list hooks + `ThreatActorListPage.tsx:49/66` | empty states |
| Real already | Users & Access tab, Billing plan panels, Graph exploration (404 → empty) | — | keep |

**Demo datasets contain the owner's name and domain** (`phase4-demo-data.ts`: a hunt's `createdBy` and DRP alert text use the owner's name and the company domain) — remove regardless.

**Suggested PR order (frontend unless noted):**
1. `withDemoFallback` → never swaps demo data for a real tenant; distinguish empty (200 + `[]`) from error (surface via `QueryStateView`, DECISION-035) — fixes hunting, correlation, analytics widgets at once.
2. `use-command-center.ts` same change; `IocListPage` `feedCount`; `use-es-search.ts` demo swap.
3. List-page demo rows + `PageStatsBar` (shared-ui — owner approval) + enrichment/investigation fake vendor verdicts (#2, #3 above).
4. Delete demo datasets that are no longer referenced (incl. the owner-name/domain ones).
5. Backend: enrichment stats source (private notes).

**Correction (2026-09-29, S173).** `withDemoFallback` above is not one shared helper — it is 7 identical private copies, one each in `use-analytics-data.ts`, `use-phase4-data.ts`, `use-alerting-data.ts`, `use-reporting-data.ts`, `use-phase5-data.ts`, `use-phase6-data.ts`, `use-global-monitoring.ts`, with roughly 63 call sites across them. There is no single fix location — each file needs its own PR.

- **PR 1 — DONE in S173** (branch `s173/honest-empty-analytics-hooks`, see `docs/S173_HONEST_EMPTY_PR1.md`): hunting + correlation hooks and analytics executive/service-health hooks in `use-phase4-data.ts` / `use-analytics-data.ts`.
- **PR 1b — DONE in S173** (branch `s173/honest-empty-drp-alerting-reporting`, see `docs/S173_HONEST_EMPTY_PR1B.md`): DRP (5 hooks in `use-phase4-data.ts` + adapters + `DRPWidgets.tsx` + `DRPModals.tsx`), alerting (`use-alerting-data.ts`, 8 call sites + adapters), reporting (`use-reporting-data.ts`, 5 call sites + adapters). Also: request body double-encoding fix in `lib/api.ts` (16 call sites across reporting, admin, onboarding, IOC mutations were re-stringifying JSON bodies).
  - **Follow-ups found (not fixed, tracked separately):** (1) `apiList` loses pagination metadata because `api()` unwraps `{data}` — `{data, meta}` envelopes on alerting/reporting/correlation/hunts need secondary handling; (2) DRP triage/takedown payloads mismatched (`{ids, verdict}` vs `{alertIds, action:{}}`) — fail validation; (3) DRP asset stats missing `avgRiskScore` field for risk gauges; (4) alert template type declares unused fields `conditionType`/`tags`.
- **PR 1c — DONE in S173** (branch `s173/honest-empty-integration-onboarding`, see `docs/S173_HONEST_EMPTY_PR1C.md`): integration/customization (`use-phase5-data.ts`, 14 call sites + adapters for `siemConfig`/`webhookConfig`/`ticketingConfig`), onboarding (`use-phase6-data.ts`, 5 call sites), global monitoring (`use-global-monitoring.ts`, 3 call sites, super-admin only — composite hook exposes query objects, status verdict computed only from real pipeline data). Also: `/correlation` Create Ticket button correctly disabled for 0-ticketing-integration tenants.
  - **Follow-ups found (not fixed, tracked separately):** (1) integration stats shape mismatch (`eventsPerHour`, `latency`, `deliveryRate` are 0 or missing); (2) customization risk-weights route missing (backend routes under `/customization/risk/profiles|presets`); (3) customization notifications backend returns one object, frontend expects channel list; (4) customization stats route missing; (5) TAXII managed-collections list route missing; (6) global IOC stats does not return matching route data; (7) subscription stats route not wired on VPS (route declared but not registered); (8) integration create for Jira/ServiceNow fails validation (form missing `email`/`username`); (9) corroboration leaders `sortBy` dropped by backend; (10) integration list metrics (`eventsForwarded`, `latency`, `deliveryRate`, `recordCount`) are 0.
- **PR 1d — DONE in S173** (branch `s173/honest-dashboard-analytics`, see `docs/S173_HONEST_EMPTY_PR1D.md`): analytics hook + 12 dashboard widgets (`use-analytics-dashboard.ts` removes `DEMO_ANALYTICS` swap and fabricated confidence/enrichment values; `avgConfidence` or `avgEnrichmentQuality` are `null` → "—" when enrichment stats missing). Twelve widgets (AttackTechniqueWidget, FeedHealthWidget, FeedValueWidget, IocTrendWidget, ProfileMatchWidget, RecentAlertsWidget, SeverityTrendWidget, ThreatBriefingWidget, ThreatLandscapeBanner, ThreatScoreWidget, TopActorsWidget, TopCvesWidget) drop `isDemo` reads and demo pills; error banner with Retry on `/dashboard` or `/analytics` when analytics service fails.
  - **Follow-ups found (not fixed, tracked separately):** (1) feed-performance stats shape mismatch (`totalArticles` and `feeds` list always empty because backend returns different field names); (2) enrichment stats `bySource` field not populated by backend; (3) EnrichmentSourceWidget and AiCostWidget still read `isDemo` from their own hooks (not covered by PR 1d, need own follow-up).
- **Bug:** on `/correlation`, "Create Ticket" always fails validation. Frontend `useCreateTicket` (`use-phase4-data.ts`) sends `{correlationId, tenantId, title, description}`, but integration-service's `POST /integrations/tickets` schema (`apps/integration-service/src/schemas/integration.ts:250-251`) requires `integrationId` (uuid) + `alertId`, neither of which the frontend sends. Tenant is taken from the JWT server-side — the `tenantId` field in the request body is ignored, so this is not a security issue, just a broken request shape. The button is disabled unless a ticketing integration is configured, so this is low-traffic but still needs its own fix.
- Original PRs 2–5 above (Command Center / `IocListPage` feed count / `/search` demo swap, list-page demo rows, `PageStatsBar`, enrichment/investigation fake vendor verdicts, dataset deletion, backend enrichment-stats source) are unchanged and run after 1c/1d.
