# S173 — Honest empty states sweep, PR 1d: Dashboard analytics hook + 12 widgets

**Date:** 2026-09-29 · **Session:** 173 · Branch `s173/honest-dashboard-analytics` · Follows `docs/S173_HONEST_EMPTY_PR1C.md`

## Summary

DECISION-048 continuation: Dashboard analytics hook and all 12 dashboard widgets now render honest empty or error states instead of demo data. The `useAnalyticsDashboard` hook no longer fabricates `avgConfidence ?? 72` or `avgEnrichmentQuality ?? 84` when enrichment data is missing (both return `null` instead, displaying "—" in UI). Hook drops the `isDemo` field; on all-sources-failed it throws an error (query `isError: true`), triggering a global error banner with Retry on both `/dashboard` and `/analytics`. While loading and on error, widget headline numbers show "—" instead of demo values. Partial failures still leave other sections populated. Twelve widget components (`AttackTechniqueWidget`, `FeedHealthWidget`, `FeedValueWidget`, `IocTrendWidget`, `ProfileMatchWidget`, `RecentAlertsWidget`, `SeverityTrendWidget`, `ThreatBriefingWidget`, `ThreatLandscapeBanner`, `ThreatScoreWidget`, `TopActorsWidget`, `TopCvesWidget`) drop demo fallback pills and render only real data or empty arrays. Demo dataset constants are no longer referenced in dashboard surfaces.

## Files changed

| File | Change |
|---|---|
| `apps/frontend/src/hooks/use-analytics-dashboard.ts` | Removed `withDemoFallback` pattern (lines ~65-95); hook no longer swaps `DEMO_ANALYTICS` when all endpoints fail. On all-sources-failed, throws (caught by `useQuery` as error). Deleted `DEMO_ANALYTICS` constant. Exported `EMPTY_ANALYTICS` (zeros or null values) for loading or error fallback. `avgConfidence` and `avgEnrichmentQuality` are now `number or null` (null when enrichment stats missing); callers must map null → "—". Hook returns `isError` instead of `isDemo`. Each request wrapped in `queryFn` with `meta: {resource: 'analytics/dashboard'}` for error toast routing. |
| `apps/frontend/src/pages/DashboardPage.tsx` | Added single shared error banner (when analytics query `isError`) with Retry button; removed per-widget error states. All 12 widgets wrapped in conditional rendering based on query state. Loading state shows all widgets but with skeleton placeholders. |
| `apps/frontend/src/pages/AnalyticsPage.tsx` | Removed demo banner. Added error banner (replaces demo banner) with Retry when analytics fails. IOC stat headline shows "—" while loading or error. All trend charts and summary cards render real data or empty. Date-range picker and auto-refresh always visible. |
| `apps/frontend/src/components/analytics/ExecutiveSummary.tsx` | Removed `isDemo` prop from signature and all internal branches (e.g. demo pill render). Removed demo fallback banner. `avgConfidence` and `avgEnrichmentQuality` render "—" when null (was `?? 72` or `?? 84`). KPI card value shows "—" during loading instead of demo number. Component now pure presenter — all state management in hook. |
| `apps/frontend/src/components/widgets/ExecSummaryCards.tsx` | Removed `isDemo` reads. Risk-level derived only from real severity data or empty object. AI cost card shows "$0.00" + "—" tier on error. Model cost breakdown empty array while loading or error (no fabricated per-model data). |
| `apps/frontend/src/components/widgets/AttackTechniqueWidget.tsx` | Removed `isDemo` read and demo-pill logic. Widget skeleton during load, empty array when data missing. No "Beta" or "Demo" badges. (3 tests deleted that checked demo badge rendering). |
| `apps/frontend/src/components/widgets/FeedHealthWidget.tsx` | Removed `isDemo` read. Feed health grid shows real feeds or empty state. Health dot colors only from real `reliability` values. (1 test expectation removed). |
| `apps/frontend/src/components/widgets/FeedValueWidget.tsx` | Removed `DEMO_QUALITY` constant and fallback logic (lines ~9-21); no longer shows fake feed-score list when feed health is empty. Widget now renders honest "No feed data available" state or real feed bars. Removed 6 lines of demo logic. |
| `apps/frontend/src/components/widgets/IocTrendWidget.tsx` | Removed demo headline numbers. Headline count shows "—" while loading or error (instead of DEMO count). Trend chart renders real data or empty. Arrow/growth indicator hidden when data empty. |
| `apps/frontend/src/components/widgets/ProfileMatchWidget.tsx` | Removed `isDemo` read and demo-gating of visibility. Match % shows "—" on error. Real profile data or empty state. (1 test expectation removed). |
| `apps/frontend/src/components/widgets/RecentAlertsWidget.tsx` | Removed `isDemo` read. Alert list renders real alerts or empty state. Relative-time formatter handles undefined dates gracefully. (1 test expectation removed). |
| `apps/frontend/src/components/widgets/SeverityTrendWidget.tsx` | Removed `isDemo` read. Severity bars render real data or empty. Sparkline values show real counts or zero. (1 test expectation removed). |
| `apps/frontend/src/components/widgets/ThreatBriefingWidget.tsx` | Removed demo headline numbers and `isDemo` flag. Top threat text shows "—" while loading or error. Briefing markdown renders real data or empty. (1 test deleted checking demo badge). |
| `apps/frontend/src/components/widgets/ThreatLandscapeBanner.tsx` | Removed `isDemo` read from render logic. Banner color/icon based only on real threat levels or defaults to neutral on missing data. |
| `apps/frontend/src/components/widgets/ThreatScoreWidget.tsx` | Removed demo pill logic and `isDemo` read (7 lines deleted). Score gauge shows real value or neutral state. Industry/tech boost only applied when profile data loaded. (1 test deleted checking demo badge). |
| `apps/frontend/src/components/widgets/TopActorsWidget.tsx` | Removed `isDemo` read. Top actors list renders real data or empty state. No fabricated actor names or IOC counts. |
| `apps/frontend/src/components/widgets/TopCvesWidget.tsx` | Removed `isDemo` read. Top CVEs list renders real data or empty state. EPSS scores and affected products from real data only. |
| `apps/frontend/src/__tests__/ExecutiveSummary.test.tsx` | Updated mock: removed `isDemo: true/false` parameter. Added test "null avgConfidence renders — instead of fabricated tier" (verifies null → "—" behavior). Updated demo-fallback test to verify no demo banner appears with fixture data. |
| `apps/frontend/src/__tests__/analytics-page.test.tsx` | Updated mock: `isDemo: false` → `isError: false`. Changed "demo banner shown when isDemo" to "error banner with Retry shown when isError". Added "no error banner when isError is false" test. Removed "full demo fallback" test; replaced with "renders complete page even with fixture data". |
| `apps/frontend/src/__tests__/dashboard-s137.test.tsx` | Removed 3 tests that checked for "Demo badge when isDemo=true" (lines ~166-173, ~246-253, ~273-280 deleted). ThreatScoreWidget, ThreatBriefingWidget, AttackTechniqueWidget demo-badge tests removed entirely. |
| `apps/frontend/src/__tests__/mobile-responsive.test.tsx` | Updated mock: `isDemo: true` → `isError: false` (line 42). |
| `apps/frontend/src/__tests__/rca45-remaining-sites.test.ts` | Updated assertion: `expect(result.current.isDemo).toBe(false)` → `expect(result.current.isError).toBe(false)` (line 61). |
| `apps/frontend/src/__tests__/use-analytics-dashboard.test.ts` | Rewrote core test expectations. Removed `notifyApiError` mock (error handling now via query state). Added tests: "partial failure still populates unaffected sections", "all endpoints fail → isError true + honest empty fields + no isDemo key", "enrichment data missing → avgConfidence and avgEnrichmentQuality are null". Swapped `DEMO_ANALYTICS` → `EMPTY_ANALYTICS` constant. Updated date-range, cache, and error-handling tests to verify null-instead-of-fabricated behavior. |
| **New tests** | `apps/frontend/src/__tests__/honest-dashboard-widgets.test.tsx` (29 tests: AttackTechniqueWidget, FeedHealthWidget, FeedValueWidget, IocTrendWidget, ProfileMatchWidget, RecentAlertsWidget, SeverityTrendWidget, ThreatBriefingWidget, ThreatLandscapeBanner, ThreatScoreWidget, TopActorsWidget, TopCvesWidget — verifying no "Demo" pills, headline "—" on error/loading, real data or empty arrays). |

## Behaviour before or after

**Dashboard + `/analytics`** — Before: on page load every widget briefly rendered demo numbers (because the hook defaulted to DEMO_ANALYTICS before real data returned); when all analytics endpoints failed, hook returned demo data with `isDemo: true`; `avgConfidence ?? 72` and `avgEnrichmentQuality ?? 84` showed fake tiers when enrichment stats were unavailable. After: widgets render skeleton placeholders during load (no demo numbers); on all-endpoints-failed, hook throws error (query `isError: true`), and both pages show one error banner with Retry; unknown confidence or enrichment-quality values show "—" (null rendering); partial failures leave available sections populated (e.g., IOC trend succeeds but cost stats fail → ioc-trend and summary populate, cost-stats empty).

**Headline scalars** — Before: ThreatBriefingWidget and IocTrendWidget showed demo trend numbers even on first page load. Before: when alerts or IOCs trend data was missing, number showed DEMO value. After: all headline numbers show "—" while loading (not demo numbers); on error, headline shows "—" (not demo value). Trend charts render real data or empty.

**Confidence or enrichment-quality metrics** — Before: `avgConfidence ?? 72` and `avgEnrichmentQuality ?? 84` fabricated tiers when enrichment service had no data. After: both are `null` when enrichment stats missing or request fails; components map null → "—" (displayed as-is, not a fake percentage or letter grade).

**Per-widget demo pills** — Before: 12 widgets had `useAnalyticsDashboard` wired for `isDemo` detection and rendered amber "Demo" pills in their headers or on data values. After: no widgets render "Demo" pills; all demo-pill logic deleted. Demo badge styling remains in CSS but is never applied.

## Tests

New: `apps/frontend/src/__tests__/honest-dashboard-widgets.test.tsx` (29 tests across 12 widgets, verifying honest empty state rendering and no "Demo" badge presence).

Updated: `ExecutiveSummary.test.tsx`, `analytics-page.test.tsx`, `dashboard-s137.test.tsx`, `mobile-responsive.test.tsx`, `rca45-remaining-sites.test.ts`, `use-analytics-dashboard.test.ts` (removed `isDemo` mock expectations, added full react-query shape with `isError`, added null → "—" behavior tests, removed demo-fallback tests).

Tests removed: 3 tests checking demo-badge rendering on ThreatScoreWidget, ThreatBriefingWidget, AttackTechniqueWidget.

Frontend suite: 2,073 passed + 2 skipped. Typecheck 0 errors, lint 0 errors.

Backend response shapes verified against actual handlers: `apps/analytics-service/src/routes/` (trends, distributions, cost-tracking, enrichment-quality, feed-performance endpoints), verified null fields when upstream sources fail.

## How to verify

Local: `pnpm --filter @etip/frontend run test`.

Prod (after deploy): on a fresh 0-data tenant (or one with analytics service down), in a fresh incognito tab:
- Open `/dashboard` — no "Demo" pills on any widget; all headline numbers show "—" while page loads (first second or two); once data arrives, real numbers appear or widget shows empty state if no data.
- Open `/analytics` — no demo trend lines during load; one error banner at top with Retry button if analytics service fails; date-range picker and auto-refresh work regardless of data state.
- Refresh the page multiple times — widgets should never flash demo numbers during initial load.
- If analytics service is degraded (some endpoints respond, some fail) — some widgets populate (e.g., trends succeed, cost fails) and cost section shows empty state.
- Verify tenant browser console has no `undefined` or type warnings from `avgConfidence ?? <number>` logic (should be clean null checks).

## Rollback

`git revert <merge commit>`, or before merge: `git reset --hard safe-point-2026-09-29-s173-pr1d`.

## Follow-ups

Backend gaps and frontend wire-ups that remain (tracked in `docs/S172_FABRICATED_DATA_AUDIT.md`):

1. **Feed-performance stats shape** — `/analytics/feed-performance` returns `{totalFeeds, byStatus, byType, totalItemsIngested, avgReliability}`, but hook reads `totalArticles` and `feeds` array. Article-total row and feed-health sub-table always empty (honest, but unfilled). Backend route may need to return mapped shape or frontend adapter needs a secondary translation.

2. **Enrichment stats bySource** — `/analytics/enrichment-quality` response includes `bySource` field but backend schema may not populate it. `EnrichmentSourceWidget` reads `isDemo` from `useEnrichmentSourceBreakdown` hook (not covered by PR 1d, needs own follow-up).

3. **AI cost widget** — `useAiCostSummary` hook also reads `isDemo` (not covered by PR 1d, needs own follow-up).

- **Original PRs 2–5** (Command Center demo stats, IocListPage feed count, /search demo swap, list-page demo rows, PageStatsBar, enrichment/investigation fake vendor verdicts, demo dataset deletion, backend enrichment-stats source) are unchanged and run after 1d per `docs/S172_FABRICATED_DATA_AUDIT.md`.
