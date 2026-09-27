# S161b PR 1 — RCA #45 bug-class sweep: `api<{data}>` double-unwrap fix

**Date:** 2026-09-27 · **Branch:** `s161b/honest-ui-remaining-hooks` · **Module:** frontend only · **RCA:** `docs/DEPLOYMENT_RCA.md` Issue 45

## Summary
RCA #45 (found post-deploy in S161a PR B) identified a bug class: `api<T>()` already unwraps the gateway's
`{data}` envelope, but a number of hooks were typed `api<{data: X}>` and then read `.data` off the result — that
`.data` was always `undefined`, so the hook silently fell back to demo/empty data. This PR sweeps the whole
`hooks/` directory for the pattern and fixes every site found: ~40 sites across 17 hook files. List-returning
calls switched to `apiList()`; single-object calls switched to `api<X>()` with the wrapper type dropped. Error-path
fallbacks (`withDemoFallback`, `isDemo` flags) are intentionally left alone here — converting those to
throw + `QueryStateView` is PRs 2–4 of this sequence.

`grep -rnE "api<\{\s*data" apps/frontend/src/hooks` now returns only 3 documented BLOCKED hooks in
`use-phase5-data.ts` (backend routes don't exist yet, kept until S162/S163) plus one comment in
`use-break-glass.ts` (prose, not code).

## Live bugs fixed (real data now shows instead of silent demo/empty)
- Analytics: `iocTrend` / `alertTrend` were always empty — trend charts now render.
- Onboarding: catalog list and feed validator result were empty/wrong.
- Customization: cost estimate (the double-wrap was masking a real `cost.perStage.map` crash in an old test
  mock), Anthropic key status, module toggles, AI plan tiers/subtask mappings/recommended models.
- Hunt templates list.
- Enrichment pending queue total.
- Typosquat scanner in `DRPWidgets.tsx` — the real backend field is `topCandidates`, not `candidates`.
- Global catalog / subscriptions.
- Global IOC list, detail, corroboration, severity votes, false-positive summary.
- Tenant overrides.

## Mappers added (backend shape ≠ frontend type)
- `mapQuarterly` (`use-access-reviews.ts`) — without it, `Object.entries(roleBreakdown)` would crash on the
  real response shape.
- `mapPlan` (`use-plan-limits.ts`) — backend sends `planId`/`maxGlobalSubs`/`minFetchInterval` as strings; mapped
  to the frontend's expected shape.
- `toCorroborationLeader` (`use-global-monitoring.ts`) — defaults `sightingSources` to `[]` when absent.

## Type-only fixes (mutation results unused, but typed wrong)
Plan-builder create/update, compliance report/DSAR generate, tenant override create/update, IOC lifecycle,
Anthropic key put/delete, apply plan, set subtask model.

## Cleanup
- Deleted dead component `components/QuotaWarningBanner.tsx` (not imported anywhere — flagged as dead code in
  S161a PR B) and its 2 test blocks in `plan-builder-quota.test.tsx`.
- Added `'critical'` to `ServiceStatus` (`phase6-demo-data.ts` and `AdminOpsPage.tsx`'s local copy + its
  `STATUS_CONFIG` entry) — the real backend can report a status value the frontend union didn't cover.

## Tests
6 new test files mocking REAL backend response bodies: `rca45-enrichment-pending.test.ts`,
`rca45-global-monitoring.test.ts`, `rca45-phase4-data.test.ts`, `rca45-phase5-customization.test.ts`,
`rca45-remaining-sites.test.ts`, `use-rca45-group-a-hooks.test.ts`. Fixed 4 existing test files whose mocks
encoded the buggy double-wrapped shape: `byok-card.test.tsx`, `customization-ai.test.tsx`,
`phase5-pages.test.tsx`, `use-analytics-dashboard.test.ts`.

Full suite: 1,944 pass / 2 skipped, `tsc` 0 errors, `eslint` 0 errors.

## Verification
Independent Sonnet adversarial shape review of the diff — no crash risks found. One wrong-data item was
deferred rather than fixed here (see below).

## Files touched
```
M  apps/frontend/src/__tests__/byok-card.test.tsx
M  apps/frontend/src/__tests__/customization-ai.test.tsx
M  apps/frontend/src/__tests__/phase5-pages.test.tsx
M  apps/frontend/src/__tests__/plan-builder-quota.test.tsx
M  apps/frontend/src/__tests__/use-analytics-dashboard.test.ts
?? apps/frontend/src/__tests__/rca45-enrichment-pending.test.ts
?? apps/frontend/src/__tests__/rca45-global-monitoring.test.ts
?? apps/frontend/src/__tests__/rca45-phase4-data.test.ts
?? apps/frontend/src/__tests__/rca45-phase5-customization.test.ts
?? apps/frontend/src/__tests__/rca45-remaining-sites.test.ts
?? apps/frontend/src/__tests__/use-rca45-group-a-hooks.test.ts
D  apps/frontend/src/components/QuotaWarningBanner.tsx
M  apps/frontend/src/components/viz/DRPWidgets.tsx
M  apps/frontend/src/hooks/phase6-demo-data.ts
M  apps/frontend/src/hooks/use-access-reviews.ts
M  apps/frontend/src/hooks/use-analytics-dashboard.ts
M  apps/frontend/src/hooks/use-compliance-reports.ts
M  apps/frontend/src/hooks/use-enrichment-data.ts
M  apps/frontend/src/hooks/use-global-catalog.ts
M  apps/frontend/src/hooks/use-global-iocs.ts
M  apps/frontend/src/hooks/use-global-monitoring.ts
M  apps/frontend/src/hooks/use-intel-data.ts
M  apps/frontend/src/hooks/use-onboarding-feeds.ts
M  apps/frontend/src/hooks/use-phase4-data.ts
M  apps/frontend/src/hooks/use-phase5-data.ts
M  apps/frontend/src/hooks/use-plan-builder.ts
M  apps/frontend/src/hooks/use-plan-limits.ts
M  apps/frontend/src/hooks/use-tenant-overrides.ts
M  apps/frontend/src/pages/AdminOpsPage.tsx
M  apps/frontend/src/pages/CustomizationPage.tsx
```

## Backend gaps found (NOT fixed here — hand-off to S163 / later)
Hooks keep their existing demo fallback for these, documented in code with BLOCKED comments:
- No route `/access-reviews/stats`.
- No route `POST /customization/plans/:id/reset`.
- `GET /customization/ai` has no handler.
- `/customization/risk-weights` is the wrong path — the real route is `/customization/risk/profiles`.
- `/customization/notifications` returns a single per-user prefs object, not a channel list.
- No `/ingestion/catalog/subscription-stats`.
- Ingestion `catalogRoutes` is not registered in `apps/ingestion/src/app.ts`.
- Frontend calls `/ingestion/feeds/validate` but the route is actually mounted at `/api/v1/feeds/validate`.
- `useDsarExport` is unused and the backend returns a `ComplianceReport`, not a DSAR export shape.
- `POST /customization/ai/plans/apply` — the top-level `plan`/`total` fields are dropped by `api()`'s unwrap
  (currently unused by the caller, so harmless today).

## Deferred to PR 4
The compliance report viewer reads `fullReport.data`, but the backend record field is `reportData` — this
means the viewer spins forever rather than crashing. It needs a shape mapping of
`generateSoc2Report`/`generatePrivilegedAccessReport` output to `ComplianceReportData` before it can be wired
up. Not a crash today, so left for PR 4.

## How to verify after deploy
Owner, in a FRESH browser tab:
- Analytics → trends chart shows data.
- Customization → AI cost estimate + API key card.
- DRP → typosquat scan results.
- Hunting → templates list.
- Enrichment → pending queue.
- Global Catalog.
- Access Review → quarterly section.
- Plan Limits page → names/intervals render correctly.
- Check all of the above at 375px width (feedback_mobile_first.md).

## Rollback
`git revert <merge commit>`; restore point tag `safe-point-2026-09-27-s161b-start`.

## Remaining S161b plan
- **PR 2:** alerting/reporting/analytics `withDemoFallback` → throw + `QueryStateView`; report template / alert
  rule / pipeline throughput / queue-stats audit fixes.
- **PR 3:** phase4 (DRP / graph / correlation / hunting).
- **PR 4:** phase5/6 rest + global-monitoring + command-center + break-glass + Command Center stats + Admin Ops
  tiles + compliance `reportData` mapping, then delete `withDemoFallback` and the unused demo constants.
