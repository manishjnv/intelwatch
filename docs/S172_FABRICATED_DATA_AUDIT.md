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
