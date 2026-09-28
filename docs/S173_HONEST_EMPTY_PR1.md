# S173 — Honest empty states sweep, PR 1: hunting + correlation + analytics

**Date:** 2026-09-29 · **Session:** 173 · Branch `s173/honest-empty-analytics-hooks` · Follows `docs/S172_FABRICATED_DATA_AUDIT.md`

## Summary

DECISION-048 (honest empty states, 2026-09-28): a real tenant never sees demo/fabricated data — only real data or an honest empty state with a next step. The S172 audit (`docs/S172_FABRICATED_DATA_AUDIT.md`) found the shared cause is `withDemoFallback()` — 7 near-identical private copies across the hook files, each swapping in demo data whenever a query "looks empty," and each paired with a `.catch(() => empty)` in the `queryFn` that makes a failed request indistinguishable from a legitimately empty tenant.

This is PR 1 of that sweep: the `use-phase4-data.ts` hunting/correlation hooks and the `use-analytics-data.ts` executive/service-health hooks. Both now return plain `useQuery` results — no demo swap, no swallowed errors. A failed request sets `isError`, which the global `QueryCache.onError` in `main.tsx` already toasts, and pages that render lists route the loading/error/empty states through the existing `QueryStateView` component instead of an ad hoc `isDemo` branch.

DRP hooks in `use-phase4-data.ts` still use `withDemoFallback` — out of scope for this PR (tracked as PR 1b below).

## Files changed

| File | Change |
|---|---|
| `apps/frontend/src/hooks/use-phase4-data.ts` | `useCorrelations`, `useCorrelationStats`, `useCampaigns`, `useHuntSessions`, `useHuntStats`, `useHuntHypotheses`, `useHuntEvidence`, `useHuntTemplates` — dropped `withDemoFallback` + `.catch(() => empty)`, added `meta: { resource: '<name>' }` to each `useQuery`. Unused `DEMO_CORRELATIONS`/`DEMO_CORRELATION_STATS`/`DEMO_CAMPAIGNS`/`DEMO_HUNT_*` imports removed. DRP hooks untouched. |
| `apps/frontend/src/hooks/use-analytics-data.ts` | Deleted dead `useAnalyticsWidgets`/`useAnalyticsTrends` (no consumers) and the module's local `withDemoFallback` helper. `useExecutiveSummary`/`useServiceHealth` are now plain `useQuery` calls with `meta.resource`. |
| `apps/frontend/src/pages/CorrelationPage.tsx` | Removed the `isDemo` demo banner, `isDemo` prop on `CorrelationDetail`, the fake "(demo)" success toasts on Create Ticket / Add to Hunt, and the fake 2-second Auto-Correlate timer with its hardcoded "3 new correlations" toast. Auto-Correlate always calls the real `POST /correlations/run` (`useTriggerCorrelation`); result renders in the existing banner, failure gets a toast. Search / kill-chain filter / sort were gated behind `isDemo` (dead on real data) — now always applied to the loaded page. Correlations table and Campaigns tab wrapped in `QueryStateView` (error card + Retry). |
| `apps/frontend/src/pages/HuntingWorkbenchPage.tsx` | Removed the `isDemo` demo banner and the `isDemo` props passed to `HuntStatusControls`/`AddHypothesisForm`. Hunt session list wrapped in `QueryStateView` with an honest empty state ("No hunts yet — start a hunt"). |
| `apps/frontend/src/components/viz/HuntingModals.tsx` | Removed the `isDemo` prop from `HuntStatusControls`, `AddHypothesisForm`, `AddEvidenceForm` — it previously disabled every hunt form input/button whenever the page was in demo mode; forms are always interactive now. |

## Behaviour before/after

**`/hunting`** — Before: a real 0-hunt tenant saw 5 demo hunts (one credited to the owner by name) behind a green "Demo data — connect Hunting service" banner; status controls and the hypothesis/evidence forms were disabled. After: an empty tenant sees "No hunts yet — start a hunt" with a next step; a request failure shows the error card + Retry instead of silently falling back to demo rows; all hunt forms and controls are always interactive.

**`/correlation`** — Before: a real 0-correlation tenant saw 6 demo correlations + demo campaigns behind a "Demo data — connect Correlation Engine" banner; search / kill-chain filter / sort silently did nothing on real data (only worked in demo mode); Create Ticket / Add to Hunt showed fake "(demo)" success toasts without calling anything; Auto-Correlate ran a 2-second fake timer and always reported "3 new correlations, 1 campaign detected" regardless of what ran. After: empty/error states go through `QueryStateView`; search, kill-chain filter and sort work on the loaded page (the ponytail comment at `CorrelationPage.tsx:465` notes this covers only the loaded 50 rows — server-side filtering is a follow-up once tenants exceed one page); Create Ticket / Add to Hunt always call the real mutations; Auto-Correlate always calls `POST /correlations/run` and its real result shows in the banner.

**`/analytics`** — Before: `useExecutiveSummary`/`useServiceHealth` silently swapped in demo executive-summary/service-health data whenever the real response didn't match a has-data check, indistinguishable from a legitimate empty/failed call. After: both are plain queries; a real empty or failed response surfaces normally (page-level handling unchanged in this PR — the hooks themselves no longer fabricate).

## Tests

New: `apps/frontend/src/__tests__/honest-hunting-correlation-analytics.test.tsx` (8 tests, mocked against the real backend response shapes for `/correlations`, `/correlations/stats`, `/correlations/campaigns`, `/hunts`, `/hunts/stats`, `/analytics/executive`, `/analytics/service-health`).

Updated for the removed `isDemo` props/branches: `apps/frontend/src/__tests__/phase4-pages.test.tsx`, `correlation-actions.test.tsx`, `correlation-mutations.test.tsx`, `rca45-phase4-data.test.ts`, `analytics-page.test.tsx`, `mobile-responsive.test.tsx`.

Frontend suite: 1,995 passed + 2 skipped (was 1,990 + 2). Typecheck 0 errors, lint 0 errors.

Backend response shapes were verified against the actual route handlers before writing hook/test expectations: `apps/correlation-engine/src/routes/correlations.ts`, `apps/hunting-service/src/routes/hunts.ts` + `routes/advanced.ts`, `apps/analytics-service/src/routes/executive.ts` — all match what the hooks now expect.

## How to verify

Local: `pnpm --filter @etip/frontend run test`.

Prod (after deploy): on a fresh 0-data tenant, in a fresh incognito tab, open `/hunting`, `/correlation`, `/analytics` — no "Demo" banner, no demo rows anywhere, honest empty states with a next step. On `/correlation`, click Auto-Correlate and confirm it runs the real correlation engine (result count in the banner matches what the engine actually found, not a fixed "3 new correlations").

## Rollback

`git revert <merge commit>`, or before merge: `git reset --hard safe-point-2026-09-28-s173-pr1`.

## Follow-ups

Tracked in `docs/S172_FABRICATED_DATA_AUDIT.md` under "Suggested PR order":
- **PR 1b** — DRP (5 hooks in `use-phase4-data.ts` + `DRPWidgets.tsx` "Try demo scan" CTA + `DRPModals.tsx`), alerting (`use-alerting-data.ts`, 8 call sites), reporting (`use-reporting-data.ts`, 5 call sites).
- **PR 1c** — integration/customization (`use-phase5-data.ts`, 14 call sites), onboarding (`use-phase6-data.ts`, 5 call sites), global monitoring (`use-global-monitoring.ts`, 3 call sites, super-admin only).
- `hooks/use-analytics-dashboard.ts` swaps in `DEMO_ANALYTICS` on a failed dashboard request and fabricates `avgConfidence ?? 72` / `avgEnrichmentQuality ?? 84` — own PR, feeds every dashboard widget.
- Bug found while auditing Create Ticket: it always fails validation server-side (see RCA #57) — needs its own fix, not covered here.
- Original audit PRs 2–5 (list-page demo rows, `PageStatsBar`, enrichment/investigation fake vendor verdicts, dataset deletion, backend enrichment-stats source) unchanged, run after 1b/1c.
