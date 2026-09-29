# S173 — Honest data sweep, PR 2: Command Center + Search + IOCs + Enrichment widgets + Customization wiring

**Date:** 2026-09-29 · **Session:** 173 · Branch `s173/audit-pr2-cc-search-widgets` · Follows PRs #61–#64

## Summary

DECISION-048 continuation: Command Center, search results page, IOC list feed count, and enrichment widgets now render real data only; customization module now wires to real backend routes instead of non-existent ones. Command Center stats (global/tenant overview, tenant list, queue, provider keys) previously swapped demo constants whenever the real data was loading or the request failed — super-admins were effectively always in demo mode because real backend responses didn't match the component types. Now: plain queries return the real response shapes, adapters map them to component props, empty scalars render "—", and missing fields (per-tenant budget, members, usage % that no backend provides) stay undefined and display "—". Tenant list merges real custom-integration stats (`/customization/command-center/tenant-list`) with real tenant metadata from admin-service (`/admin/tenants`, name/plan/status). Search results and facets render real `/search/iocs` responses only (demo results and client-side syntax filtering removed). IOC list feed count reads the real active-feed count from the tenant's existing `useFeeds` hook. Enrichment-cost widget adapted to the real `/analytics/cost-tracking` shape (delta%, budget UI removed as backend never provided them). Customization risk-weight tab wired to real `GET/PUT /customization/risk/profiles/:type` routes (13 IOC types, each a weight profile across 5 weight factors that must sum to 1.0). Notifications tab wired to real `GET/PUT /customization/notifications` + `/customization/notifications/channels/:channel` (3 fixed channels: Email, Webhook, In-app). Stats card adapted to real `/customization/ai/usage?period=month` response. No test-notification route exists, so that CTA removed. All pages update via QueryStateView to surface missing routes and shape mismatches as error cards, not demo data.

## Files changed

### A. Command Center (`apps/frontend/src/hooks/use-command-center.ts`, `pages/CommandCenterPage.tsx`, `components/command-center/ClientsTab.tsx`, `OverviewTab.tsx`)

| File | Change |
|---|---|
| `apps/frontend/src/hooks/use-command-center.ts` | Removed `DEMO_GLOBAL_STATS`, `DEMO_TENANT_STATS`, `DEMO_TENANT_LIST`, `DEMO_QUEUE_STATS`, `DEMO_PROVIDER_KEYS` constants and the `daysAgoStr` demo-date helper (~130 lines). The old fetch functions caught every error and returned `null` for the hook's `isDemo` check to swap in; they're gone — each query now calls `api()`/`apiList()` directly and lets `isError` surface real failures. Added `AdminTenantRow` interface capturing the real `/admin/tenants` response (id, name, plan, status). `TenantListItem` fields the merged tenant-metadata lookup can't always fill are now optional (name?, plan?, status?, members?, usagePercent?); `TenantStats.budgetUsedPercent`/`budgetLimitUsd` are also optional (ponytail comment: no service tracks a per-tenant AI budget today) — `GlobalStats` and `QueueStats` have no budget fields and were not touched. New `tenantListQuery` fetches real integration stats from `apiList('/customization/command-center/tenant-list')` (tenantId, itemsConsumed, attributedCostUsd); a separate `tenantMetaQuery` fetches `apiList('/admin/tenants')`; a `useMemo` merges the two by `tenantId`/`id` into `TenantListItem[]`, leaving name/plan/status undefined ("—" in the component) when the metadata lookup hasn't returned yet. `EMPTY_GLOBAL_STATS`/`EMPTY_TENANT_STATS`/`EMPTY_QUEUE_STATS` are exported as the loading/error fallback shapes (all zeros/empty, never fabricated numbers). ~200 lines changed/removed. |
| `apps/frontend/src/pages/CommandCenterPage.tsx` | Removed the "Demo" banner (`cc.isDemo`); replaced with an error banner + Retry button (`cc.isError`) at the top of the page. Header `CompactStat` tiles show "—" instead of a real-looking number when `cc.isError`. The "Alerts"/badge tile, previously counting fabricated `'over_limit'` tenants, now counts real `'suspended'` tenants. |
| `apps/frontend/src/components/command-center/OverviewTab.tsx` | Removed `isDemo` reads. Global stats headline numbers show "—" while loading or on error. Tenant stats "Active Feeds" shows real count or "—". Budget percentage and limit show "—" when undefined. Cost trends render real data or empty. No "Demo" pill or demo banner. |
| `apps/frontend/src/components/command-center/ClientsTab.tsx` | Merged real tenant metadata (name, plan, status) with real usage stats (itemsConsumed, cost) from two API sources. Removed fabricated members count and usagePercent. Status column shows real status ('active', 'suspended', 'pending', 'deleted') or "—" while loading. Removed "over_limit" status (fabricated). |
| `apps/frontend/src/__tests__/use-command-center.test.ts` | Removed `isDemo` mock expectations. Updated mock shape to include real `/admin/tenants` response merge test. Added test: "tenant list merges customization stats with admin tenant metadata". Added test: "undefined budget fields render as '—'". Removed "demo banner shown" test. |
| `apps/frontend/src/__tests__/command-center-overview-config.test.tsx` | Updated component test mocks. Removed demo-banner expectation. Added test: "headline numbers show '—' while loading". |
| `apps/frontend/src/__tests__/command-center-tabs.test.tsx` | Removed "demo status badge" test. Added test: "real status values from admin-tenants". |
| `apps/frontend/src/__tests__/command-center-page.test.tsx` | Removed demo-fallback tests. Added QueryStateView error-card tests. |
| `apps/frontend/src/__tests__/command-center-billing-alerts.test.tsx` | Updated fixture shapes to use real backend response. |

### B. Search (`apps/frontend/src/hooks/use-es-search.ts`, `pages/SearchPage.tsx`, `components/search/SearchStatsBar.tsx`)

| File | Change |
|---|---|
| `apps/frontend/src/hooks/use-es-search.ts` | Removed `DEMO_ES_RESULTS` (~100 mock IOCs) and `DEMO_FACETS` constants. Removed client-side search syntax support (`type:`, `severity:`, `tag:`, quoted phrases) — this syntax only filtered demo data; real `/search/iocs` API never supported it. QueryFn throws on error (query `isError: true`). Returns react-query shape `{ data: SearchResult[], isLoading, isError }`. No `isDemo` flag. Facet aggregations render only real data from backend or empty. ~150 lines deleted. |
| `apps/frontend/src/pages/SearchPage.tsx` | Removed demo results render path. Added QueryStateView wrapper: while loading, skeleton; on error, error card with Retry; when no results, honest "No results found — try a different query" instead of empty state. Removed the "demo" chip. Search bar placeholder improved to guide real query syntax. |
| `apps/frontend/src/components/search/SearchStatsBar.tsx` | Shows real result count from API or "—" while loading/error. Facet filter UI only renders facets returned by backend. Removed demo-fallback badge/chip. |
| `apps/frontend/src/__tests__/use-es-search.test.ts` | Removed test: "demo results when no query". Removed test: "client-side type:severity: filtering works". Added test: "error state returns isError true". Added test: "empty results show honest empty message". |
| `apps/frontend/src/__tests__/search-enhancements.test.tsx` | Updated fixture mocks to real backend shape. Removed syntax-support test expectations. |
| `apps/frontend/src/__tests__/search-context-actions.test.tsx` | Updated to real response shape. |

### C. IOCs page (`apps/frontend/src/pages/IocListPage.tsx`)

| File | Change |
|---|---|
| `apps/frontend/src/pages/IocListPage.tsx` | Line ~210: replaced hardcoded `feedCount={12}` with real active-feed count from the tenant's `useFeeds` hook. Shows real count or "—" while feeds query is loading/errored. ~2 lines changed. |
| `apps/frontend/src/__tests__/ioc-tier1.test.tsx` | Updated mock feedCount to real value from hook. |

### D. Enrichment widgets (`apps/frontend/src/hooks/use-enrichment-data.ts`, six hooks; `components/widgets/EnrichmentSourceWidget.tsx`, `AiCostWidget.tsx`, `pages/EnrichmentPage.tsx`)

| File | Change |
|---|---|
| `apps/frontend/src/hooks/use-enrichment-data.ts` | Six hooks (`useEnrichmentStats`, `useCostStats`, `useBudgetStatus`, `useEnrichmentSourceBreakdown`, `useAiCostSummary`, `useEnrichmentQuality`) rewritten: removed the `.catch(err => notifyApiError(err, ..., null))` swallow-and-null pattern and the `isDemo: false` field each hook returned, so query failures now reach `isError` instead of being hidden. `AiCostSummary`'s shape was rewritten to match the real `/analytics/cost-tracking` response (`totalCostUsd`, `byModel`, `costPerArticle`, `costPerIoc`) — the old type declared fields the backend never returns (`deltaPercent`, `budgetMonthly`, `budgetUtilization`, `totalCost30d`), which is why AiCostWidget crashed on real data. `useEnrichmentSourceBreakdown` now calls `/analytics/enrichment-quality` (there is no separate per-source endpoint) and only trusts the response when it actually has a `bySource` field, returning `null` otherwise so the widget renders its honest-empty state instead of crashing or faking data. ~200 lines changed. |
| `apps/frontend/src/components/widgets/AiCostWidget.tsx` | Adapted to real cost-tracking shape. Budget row removed (no backend source). Delta% row removed. Renders real monthly cost or "—". Model cost grid shows real breakdown or empty. No demo numbers. |
| `apps/frontend/src/components/widgets/EnrichmentSourceWidget.tsx` | Removed demo per-source data. Shows honest empty state "No per-source data available" when backend returns empty bySource. No fabricated vendor names or enrichment counts. |
| `apps/frontend/src/pages/EnrichmentPage.tsx` | Wrapped widgets in QueryStateView. Error card shown when enrichment endpoints unavailable. |
| `apps/frontend/src/__tests__/use-enrichment-data.test.ts` | Removed demo-swap tests. Added test: "null cost field renders '—'". Added test: "bySource empty renders honest empty state". |
| `apps/frontend/src/__tests__/AiCostWidget.test.tsx` | Removed demo-data expectation. Added test: "renders real cost or '—'". |
| `apps/frontend/src/__tests__/EnrichmentSourceWidget.test.tsx` | Removed demo-pill test. Added test: "empty bySource shows honest empty state". |
| `apps/frontend/src/tests/AiCostWidget.test.tsx` | Updated fixture to real backend shape. |
| `apps/frontend/src/tests/EnrichmentSourceWidget.test.tsx` | Updated fixture. |

### E. Customization wiring (`apps/frontend/src/hooks/use-phase5-data.ts`, `pages/CustomizationPage.tsx`)

| File | Change |
|---|---|
| `apps/frontend/src/hooks/use-phase5-data.ts` | Rewrote. Removed the `RiskWeight`/`CustomizationStats` types and the hooks that called non-existent or wrong-shape routes: the old `useRiskWeights()` hit `/customization/risk-weights` (404 — the real prefix is `/customization/risk/profiles`); the old notifications hook read `/customization/notifications` but expected a `NotificationChannel[]` list, when the route actually returns one per-user `NotificationPreferences` object; `useCustomizationStats()` hit `/customization/stats`, which doesn't exist anywhere in the service — that hook is deleted, not renamed. Added real hooks: `useRiskWeights(iocType)` (GET `/customization/risk/profiles/:type`, called once per IOC type from the new `IOC_TYPES` constant — the full 13-entry backend list: ip, domain, url, hash_md5, hash_sha1, hash_sha256, email, cve, cidr, asn, ja3, mutex, registry_key), `useRiskPresets` (GET `/customization/risk/presets`), `useNotificationChannels` (GET `/customization/notifications`, synthesized into the 3 fixed `NOTIFICATION_CHANNELS` the page renders), and `useAiBudgetUsage` (GET `/customization/ai/usage?period=month`, replacing the deleted stats hook). Added `useUpdateRiskWeight` (PUT `/customization/risk/profiles/:type`), `useResetRiskWeights` (POST `/customization/risk/presets/apply`), `useUpdateNotificationChannel` (PUT `/customization/notifications/channels/:channel`); `useTestNotification` deleted (no backend route). Each query hook returns a plain react-query shape (`data`/`isLoading`/`isError`); adapters map the real backend field names to what the page renders. ~250 lines changed/added. |
| `apps/frontend/src/pages/CustomizationPage.tsx` | Risk Weights tab now calls the real per-IOC-type hook. UI gains an IOC-type `<select>` with all 13 `IOC_TYPES` values (not a curated subset). The editor shows the 5 weight factors (source reliability, freshness, corroboration, specificity, context) for whichever type is selected, with a running sum that must equal 1.0 before Save is enabled. There is no preset-picker UI — a single "Reset all IOC types to balanced" button calls `POST /customization/risk/presets/apply` with `{preset: 'balanced'}`, which also supplies each factor's shown default. Notifications tab calls the real notifications hook: 3 fixed channels (Email, Webhook, In-app) each with an enable toggle and a single minimum-severity `<select>` (info/low/medium/high/critical) instead of per-severity routing checkboxes. Quiet hours are read and displayed as one global read-only line (the backend has no per-channel quiet hours and no edit route). "Test Notification" button removed (no backend route). Stats bar reads "Modules Enabled" from the same module-toggle list the Modules tab renders and "AI Budget Used" from `useAiBudgetUsage`'s `budgetUtilization`. "Custom Rules" and "Theme" tiles removed (no backend source for either). ~180 lines changed. |
| `apps/frontend/src/__tests__/rca45-phase5-customization.test.ts` | Added tests for the real risk-profile shape (5 weight factors summing to 1.0, Save disabled until sum=1.0). Added test: "preset apply sends correct payload". Added test: "notification threshold change persists". Added test: "quiet hours shown read-only". |
| `apps/frontend/src/__tests__/honest-customization.test.tsx` | Rewrote. Removed demo-constant references. Added test: "risk-weights tab loads real profile per IOC type". Added test: "risk factors disable Save until sum = 1.0". Added test: "notifications shows 3 fixed channels only". Added test: "AI usage displays real number or '—' on error". |
| `apps/frontend/src/__tests__/customization-ai.test.tsx` | Updated to real AI usage hook shape. |
| `apps/frontend/src/__tests__/phase5-pages.test.tsx` | Updated fixture shapes. Removed demo-data tests. |

## Behaviour before or after

**Command Center Overview / Configuration / Billing** — Before: super-admin always saw demo stats (12.4K items, 15 feeds, $142.30 monthly cost, demo provider keys, 5 demo tenants with 'over_limit' status) because real tenant stats never matched frontend types or returned empty on new accounts, triggering demo fallback. After: real global/tenant stats, real provider-key status (or "—" if missing), real tenant list merged from two sources (custom integrations + admin metadata). Unknown metrics show "—" (budget, members, usage%).

**Search** — Before: empty tenant showed 20 demo IOCs with demo facets; client-side `type:severity:` syntax only worked on demo data and confused users (suggesting real API supported it). After: empty tenant shows "No results found"; real results and facets from API only; syntax filtering removed (real API doesn't support it).

**IOC List summary** — Before: "12 active feeds" on a 0-feed tenant (hardcoded string). After: real active-feed count from tenant's data or "—".

**Enrichment widgets** — Before: AiCostWidget crashed on real `/analytics/cost-tracking` response (missing fields deltaPercent, monthlyBudget); EnrichmentSourceWidget showed DEMO_SOURCE_BREAKDOWN when backend returned null; costs and budgets faked. After: AiCostWidget adapts to real shape (shows cost, removes budget UI); EnrichmentSourceWidget shows honest empty state (no per-source endpoint exists); unknown scalars display "—".

**Customization tabs** — Before: Risk Weights tab called non-existent `/customization/risk-weights` endpoint (404, never worked). Notifications tab called `/customization/notifications` expecting a `NotificationChannel[]` list, but the route returns one per-user preferences object — the mismatch meant `.data` on that object was always `undefined`, so nothing rendered or saved. Stats card called non-existent `/customization/stats` (404), so "Modules Enabled"/"AI Budget Used"/"Theme" always fell back to their `??` defaults instead of any real number. After: Risk Weights uses real `GET/PUT /customization/risk/profiles/:type` (13 IOC types). Notifications uses real `GET/PUT /customization/notifications` + `PUT /customization/notifications/channels/:channel` (3 fixed channels, synthesized from the real preferences object). Stats reads real module-toggle count and real AI usage from `/customization/ai/usage`. Test Notification button removed (no backend route).

## Tests

Updated: `use-command-center.test.ts`, `command-center-*.test.tsx` (removed isDemo mocks, added merge tests), `use-es-search.test.ts`, `search-*.test.tsx` (removed syntax-support tests, added empty-result tests), `ioc-tier1.test.tsx` (feed count), `use-enrichment-data.test.ts`, `*-cost-widget.test.tsx`, `*-enrichment-source.test.tsx` (removed demo-pill expectations, added honest-empty tests), `rca45-phase5-customization.test.ts` (risk-profile shape, factor-sum validation, notification persistence), `honest-customization.test.tsx` (rewritten, real-route wiring).

Frontend suite: 2,116 passed + 2 skipped (was 2,073 + 2) passed. Typecheck 0 errors, lint 0 errors.

Backend response shapes verified: `/customization/command-center/tenant-list` (itemsConsumed, cost), `/admin/tenants` (name, plan, status), `/search/iocs` (results + facets), `/customization/risk/profiles/:type` (5 factors, sum=1.0 constraint), `/customization/notifications` + `/notifications/channels/:channel` (3 fixed channels, thresholds), `/customization/ai/usage` (budgetUtilization), real `/analytics/cost-tracking` (byProvider, byModel, bySubtask).

## How to verify

Local: `pnpm --filter @etip/frontend run test` (2,116 passed + 2 skipped (was 2,073 + 2) tests).

Prod (after deploy): on a fresh 0-data tenant in a fresh incognito tab:
- Open `/command-center` — no "Demo" stats; tenant list shows real name/plan/status (merged from two API sources); headline numbers show "—" while loading, then real values or "—" if unavailable.
- Open `/search` with empty tenant — "No results found" message (not 20 demo IOCs or a demo chip).
- Open `/iocs` — feed count in summary shows real count (not hardcoded 12).
- Open `/enrichment` — cost widget shows real monthly cost (no fake budget or delta%); source widget shows empty state (no fabricated vendors).
- Open `/customization` → Risk Weights tab — IOC-type selector lists all 13 IOC types; each loads a real profile (or empty on first tenant); Save disabled until risk factors sum to 1.0; "Reset all IOC types to balanced" applies the balanced preset.
- Open `/customization` → Notifications tab — 3 fixed channels (Email, Webhook, In-app) with toggles and a minimum-severity selector; no "Test Notification" button; threshold change persists on Save.
- Refresh the page multiple times — no flash of demo numbers; no demo pills; no "Demo" badges.
- Verify tenant browser console has no type errors from missing fields (should be clean null checks on optional fields).

## Rollback

`git revert <merge commit>`, or before merge: `git reset --hard safe-point-2026-09-29-s173-pr2`.

## Follow-ups

Backend gaps discovered (tracked, not fixed in this PR):

1. **Frontend `TenantRecord` type mismatch** — `/admin/tenants` returns `{id, name, plan, status}` but the type in `use-phase6-data.ts` declares unused fields `seats`, `usedSeats`, `domain`, `iocCount`, `feedCount`, 'trial' status. Breaks admin tenant tables. Fix: update type or align backend response shape.

2. **Plan naming drift** — admin-service returns plan names `'free'`, `'starter'`, `'pro'`, `'enterprise'`, but other services use `'teams'`. UI labels are inconsistent. Fix: pick canonical names and align all services.

3. **Per-tenant AI budget not tracked** — no backend service returns `budgetUsedPercent` or `budgetLimitUsd` per tenant. Command Center and customization stats show "—" for these fields. Fix: add per-tenant budget tracking to customization-service (separate feature work).

4. **Per-tenant member count not tracked** — Command Center tenant list shows "—" for members. No backend endpoint provides this. Fix: count users per tenant in admin-service or user-service.

5. **Enrichment source breakdown missing** — `/analytics/enrichment-quality` `bySource` field not populated by enrichment-service. EnrichmentSourceWidget shows empty state. Fix: implement per-source aggregation in enrichment-service or add separate endpoint.

6. **No test-notification route** — customization-service never implemented `POST /customization/notifications/test`. Notifications tab had a button that would fail. Fix: implement endpoint or remove feature.

Post-deploy checks (frontend wiring done and unit-tested against the real response shapes in this PR — these confirm the routes behave the same way on the live VPS):

7. `POST /customization/risk/presets/apply` returns 200 and the "Reset all IOC types to balanced" button reflects the new weights.
8. `GET/PUT /customization/notifications` + `/customization/notifications/channels/:channel` return the shapes the hooks expect (one preferences object with 3 channels, each with `enabled`/`threshold`/`config`).
9. `GET /customization/ai/usage?period=month` returns `budgetUtilization` and honors the `period` query parameter.

- **Original PRs 3–5** (list-page demo rows, PageStatsBar, enrichment/investigation fake vendor verdicts, demo dataset deletion) are unchanged and run after PR 2 per `docs/S172_FABRICATED_DATA_AUDIT.md`.
