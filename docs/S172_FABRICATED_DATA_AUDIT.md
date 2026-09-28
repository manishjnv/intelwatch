# S172 — Fabricated-data audit of customer-facing frontend (UNVERIFIED — verify each before fixing)

**Date:** 2026-09-28 · **Source:** read-only Sonnet sweep of `apps/frontend/src` (+ `packages/shared-ui` where pages depend on it) · **Rule:** production never presents invented data as real (DECISION-035/036 honest UI).

**Owner decision (2026-09-28, to be logged as DECISION-048): honest empty states.** A real customer tenant never sees demo data. Every page shows real data or an empty state with a next step ("No hunts yet — Start a hunt", "Activate a feed"). Demo content only in an explicit demo tenant / demo mode for sales. Labelled demo for real tenants is not acceptable.

Owner-observed in production on a new tenant (in addition to the table below): `/iocs` summary "12 active feeds" / "62% covered" while Total = 0; `/search` 20 demo IOCs with only a small "demo" chip; `/hunting` and `/correlation` full demo workbenches behind a "Demo data — connect … service" banner (one demo hunt is credited "by Manish" and references "@intelwatch.in credentials"); most Command Center tabs show default data. A page-by-page audit of every route is being added below.

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

**Demo datasets contain the owner's name and domain** (`phase4-demo-data.ts`: hunts `createdBy: 'Manish'`, "@intelwatch.in credentials"; DRP alerts "Manish Kumar", `intelwatch.in`) — remove regardless.

**Suggested PR order (frontend unless noted):**
1. `withDemoFallback` → never swaps demo data for a real tenant; distinguish empty (200 + `[]`) from error (surface via `QueryStateView`, DECISION-035) — fixes hunting, correlation, analytics widgets at once.
2. `use-command-center.ts` same change; `IocListPage` `feedCount`; `use-es-search.ts` demo swap.
3. List-page demo rows + `PageStatsBar` (shared-ui — owner approval) + enrichment/investigation fake vendor verdicts (#2, #3 above).
4. Delete demo datasets that are no longer referenced (incl. the owner-name/domain ones).
5. Backend: enrichment stats source (private notes).
