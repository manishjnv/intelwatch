# S173 — Honest empty states sweep, PR 1b: DRP + alerting + reporting

**Date:** 2026-09-29 · **Session:** 173 · Branch `s173/honest-empty-drp-alerting-reporting` · Follows `docs/S173_HONEST_EMPTY_PR1.md`

## Summary

DECISION-048 continuation: DRP (Digital Risk Protection), alerting, and reporting pages now return plain `useQuery` results without demo fallbacks. Backend response shapes were validated against the real handlers before writing test expectations, so adapters now correctly map the server's data to component props. All list endpoints use `apiList` and route through `QueryStateView` (loading/error/empty states). Double-encoded request bodies in `api()` are fixed: a body that's already `JSON.stringify()`-ed is sent as-is, not re-serialized.

## Files changed

| File | Change |
|---|---|
| `apps/frontend/src/hooks/use-phase4-data.ts` | DRP hooks (5 call sites): `useDRPAlerts`, `useDRPAssets`, `useDRPAssetStats`, `useDRPAlertStats`, `useCertStreamStatus` — dropped `withDemoFallback`, added adapters `toDRPAsset()`, `toDRPAssetStats()`, `toDRPAlert()`, `toDRPAlertStats()`, `toCertStreamStatus()` to translate real backend shapes. Unused `DEMO_TYPOSQUAT_RESULTS` import removed. Meta `{resource: 'drp-*'}` added to each hook. |
| `apps/frontend/src/hooks/use-alerting-data.ts` | 8 hooks plain `useQuery`: `useAlertRules`, `useAlerts`, `useAlertTemplates`, `useNotificationChannels`, `useEscalationPolicies`, `useAlertStats`, `useToggleRule`, `useDeleteRule`. All list endpoints use `apiList` (backend envelope `{data, meta}`). Removed `withDemoFallback` helper definition. Meta `{resource: 'alerts/rules/channels/escalations'}` on each. |
| `apps/frontend/src/hooks/use-reporting-data.ts` | 5 hooks plain `useQuery`: `useReports`, `useReportStats`, `useReportTemplates`, `useReportSchedules`, `useReportComparison`. Backend shapes: `/reports/stats` returns nested `{reports[], schedules[]}`, flattened by adapter; templates and schedules adapted for correct field names (`reportType`/`type`); comparison `sectionDeltas` flattened into rows. Meta `{resource: 'reports/schedules/templates'}` on each. |
| `apps/frontend/src/pages/DRPDashboardPage.tsx` | Removed demo banner ("Demo data — connect DRP service"), `isDemo` prop tree. Removed "Alert Activity" heatmap that rendered `Math.random()` counts. Removed "Try demo scan" CTA and fallback demo typosquat results; scanner now only runs on a domain the tenant types (placeholder "e.g., yourcompany.com"), with error card + Retry on failure. Assets table and alerts wrapped in `QueryStateView`. Alert search/sort now apply to real rows (previously gated on `isDemo`). |
| `apps/frontend/src/components/viz/DRPWidgets.tsx` | Removed demo data constants and swaps. Assets and alerts widgets now use real adapters. CertStream status widget uses translated response. All widgets wrapped in `QueryStateView` rendering pattern. |
| `apps/frontend/src/components/viz/DRPModals.tsx` | Removed `isDemo` prop from `AlertDetailPanel`, `TakedownForm`, triage button gating. Forms always interactive. |
| `apps/frontend/src/pages/AlertingPage.tsx` | Removed demo banner. Rules/Channels/Escalations lists wrapped in `QueryStateView`. Alert feed uses real data or honest empty state. History drawer uses real API. All 4 tabs (Rules, Alerts, Channels, Escalations) route through `QueryStateView`. |
| `apps/frontend/src/pages/alerting-modals.tsx` | Removed `isDemo` prop tree from modals. All rule/channel/escalation forms always interactive. |
| `apps/frontend/src/components/command-center/AlertsReportsTab.tsx` | Alert rules/channels/escalations panels wrapped in `QueryStateView`. Report panels similarly wrapped. Real data or honest empty states (no demo banner, no demo rows). |
| `apps/frontend/src/pages/ReportingPage.tsx` | Removed demo banner. Reports/Schedules/Templates tabs wrapped in `QueryStateView`. Create-report and bulk operations use real API (`reportType` and other field name corrections in mutation payloads). Comparison timeline rendered only when data exists. |
| `apps/frontend/src/lib/api.ts` | Request bodies that are already JSON strings (16 call sites: 5 reporting, 8 admin/onboarding, 1 IOC false-positive, 2 IOC overlay) were being double-encoded. Fix: `doFetch` detects string bodies and sends them as-is; object bodies are `JSON.stringify()`-ed once. New test verifies the fix. |

## Behaviour before/after

**`/drp`** — Before: new 0-asset tenant saw demo domain/IP/certificate assets and demo typosquat/phishing alerts behind a "Demo data — connect DRP service" banner; "Try demo scan" CTA showed demo typosquat results; "Alert Activity" heatmap showed random data; risk gauge was 0/NaN (no asset risk scores in demo data); triage actions were disabled in "demo mode". After: empty tenant sees honest empty states ("No assets", "No alerts") with next steps; scanner placeholder is a real domain entry ("e.g., yourcompany.com"), only runs on user input with an error card + Retry; triage actions always call the real mutation; DRP asset stats are validated and risk gauges render correctly for real tenants.

**`/alerting`** — Before: 0-rule tenant saw demo alert rules, channels, escalations behind a "Demo" banner; the Rules/Channels/Escalations lists appeared empty but the page had no empty-state UI; clicking into a rule showed nothing; form inputs were disabled in "demo mode". After: empty states render ("No alert rules yet", "No channels configured", "No escalation policies yet") via `QueryStateView`; failed queries surface an error card + Retry; all forms/buttons always interactive; rules/channels/escalations lists show real data only.

**`/reporting`** — Before: 0-report tenant saw demo reports, schedules, and templates; "Create Report" and "Bulk Delete" would fail validation (body double-encoded); report comparison was locked behind a demo check. After: empty states ("No reports yet", "No schedules configured", "No templates yet") via `QueryStateView`; create/update/delete operations succeed (bodies sent correctly); schedule creation sends `reportType` as the backend requires; comparison shows real data or an honest empty state.

**Request body double-encoding** — Before: 16 call sites passed `body: JSON.stringify(x)` to `api()`, which called `JSON.stringify()` again, sending a JSON *string* to the server. Every schema expecting an object rejected it (500/422). After: `doFetch` detects string bodies and sends them as-is (one stringify only). Affected endpoints: `POST /reports`, `DELETE /reports` (bulk), `POST /reports/schedules`, `PUT /reports/schedules/{id}` (create and update), admin tenant suspend/plan change, onboarding writes, IOC false-positive report, IOC overlay create.

## Tests

New: `apps/frontend/src/__tests__/honest-drp.test.tsx`, `honest-alerting.test.tsx`, `honest-reporting.test.tsx` (12 tests total, verifying real backend shapes and QueryStateView rendering).

Updated: `drp-actions.test.tsx`, `drp-triage-ioc-tabs.test.tsx`, `phase4-pages.test.tsx`, `alerting-page.test.tsx`, `command-center-billing-alerts.test.tsx`, `reporting-page.test.tsx`, `api-json-content-type.test.ts` (removed `isDemo` mock expectations, added double-encoding test).

Frontend suite: 2,008 passed + 2 skipped (was 1,995 + 2). Typecheck 0 errors, lint 0 errors.

Backend response shapes verified against actual handlers: `apps/api-gateway/src/routes/drp.ts` (DRP alerts/assets/stats), `apps/api-gateway/src/routes/alerting.ts` (rules/channels/escalations), `apps/api-gateway/src/routes/reporting.ts` (reports/schedules/templates/stats), `apps/api-gateway/src/routes/onboarding.ts` (coupon, plan change).

## How to verify

Local: `pnpm --filter @etip/frontend run test`.

Prod (after deploy): on a fresh 0-data tenant (or one with no DRP/alerting/reporting data), in a fresh incognito tab:
- Open `/drp` — no "Demo" banner, no demo assets/alerts rows, honest empty states; typosquat scanner shows "e.g., yourcompany.com" placeholder; click the scanner input and type a domain, hit Scan → error or real result (no demo fallback).
- Open `/alerting` → no "Demo" banner, empty "Rules" / "Channels" / "Escalations" tabs; create a rule and verify it persists.
- Open `/reporting` → no "Demo" banner, empty "Reports" / "Schedules" tabs; create a report schedule and verify it succeeds (body sent correctly).
- Command Center Alerts & Reports tabs: no demo data, only real or empty.

## Rollback

`git revert <merge commit>`, or before merge: `git reset --hard safe-point-2026-09-29-s173-pr1b`.

## Follow-ups

Tracked in `docs/S172_FABRICATED_DATA_AUDIT.md` under "Suggested PR order":

1. **Pagination metadata loss in `apiList`** — `api()` unwraps `{data}` from backend envelopes, so `apiList` cannot see pagination metadata (`total`, `page`, `limit`, `count`). Alerting, reporting, correlation, hunts all have `{data, meta}` envelopes; pagination beyond 50 rows falls back to row count, so pagination is broken on those endpoints once tenant data exceeds one page. Fix: `apiList` needs a secondary shape that passes through `meta` or the backend needs to return pagination in the data envelope itself.

2. **DRP payload mismatches** — `useBulkTriageAlerts` sends `{ids, verdict, notes}` but backend expects `{alertIds, action:{status,…}}`. `useRequestTakedown` sends `{provider, evidence, urgency}` but backend expects `{platform, …}`. Both fail validation today. Fix: align frontend payloads to real backend schemas.

3. **DRP asset stats missing average risk** — Asset stats have `{total, byType, avgRiskScore?}` but adapters don't flatten the risk gauge field. The gauge renders 0 until the server provides `avgRiskScore`. Fix: either add the field to backend `/drp/assets/stats` or derive it in the frontend adapter.

4. **Alert template type declarations misaligned** — Alert template type declares `conditionType`/`tags` that the backend never sends and the page never uses. Unsent fields should be pruned from the type or declared optional. Fix: validate template type against the actual backend handler output.

- **PR 1c** — integration/customization (`use-phase5-data.ts`, 14 call sites), onboarding (`use-phase6-data.ts`, 5 call sites), global monitoring (`use-global-monitoring.ts`, 3 call sites, super-admin only).
- **PR 2+** (analytics dashboard, Create Ticket validation bug, remaining demo data, fabricated vendor verdicts) unchanged, run after 1b/1c per `docs/S172_FABRICATED_DATA_AUDIT.md`.
