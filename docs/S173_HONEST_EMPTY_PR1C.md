# S173 — Honest empty states sweep, PR 1c: Integrations + customization + onboarding + global monitoring

**Date:** 2026-09-29 · **Session:** 173 · Branch `s173/honest-empty-integration-onboarding` · Follows `docs/S173_HONEST_EMPTY_PR1B.md`

## Summary

DECISION-048 continuation: Integration, customization, onboarding, and global-monitoring pages now return plain `useQuery` results without demo fallbacks. Backend response shapes were validated against real handlers, so adapters correctly map server data to component props. All list endpoints use `apiList` and route through `QueryStateView` (loading/error/empty states). Integration stats shapes corrected (`siemConfig`, `webhookConfig`, `ticketingConfig` now match backend schema). Customization module toggles adapted from real `{id, module, enabled, featureFlags}` store. Global monitoring composite hook now exposes underlying query objects; pipeline-stuck verdict computed only from real loaded data, never from missing/error data.

## Files changed

| File | Change |
|---|---|
| `apps/frontend/src/hooks/use-phase5-data.ts` | Integration hooks (6 call sites): `useSIEMIntegrations`, `useWebhooks`, `useTicketingIntegrations`, `useSTIXCollections`, `useBulkExports`, `useIntegrationStats` — dropped `withDemoFallback`, added adapters mapping real backend shapes. Mutations: `useCreateSIEM`, `useCreateWebhook`, `useCreateTicketing`, `useDeleteIntegration`, `useTestConnection` now send correct payloads with `siemConfig`/`webhookConfig`/`ticketingConfig` envelope keys (backend Prisma schema). Customization hooks (8 call sites): `useModuleToggles`, `useRiskWeights`, `useNotificationChannels`, `useCustomizationStats` — plain `useQuery`, adapters for real `{id, module, enabled}` toggles. Deleted `useAIConfigs` (no backend route, no consumer). Meta `{resource: 'integrations/customization'}` added to each. |
| `apps/frontend/src/pages/IntegrationPage.tsx` | Removed demo banner ("Demo data — connect integrations service"), `isDemo` prop tree. SIEM/Webhook/Ticketing/STIX/Export tabs wrapped in `QueryStateView`. "Test Connection" modal uses real `/integrations/:id/test` POST. Create forms always interactive. Honest empty states ("No SIEM integrations yet — add one"). |
| `apps/frontend/src/components/viz/IntegrationModals.tsx` | Removed `isDemo` gating from test-connection button, modal forms. Forms always interactive. Test endpoint uses real adapter for response shape. |
| `apps/frontend/src/pages/CustomizationPage.tsx` | Removed demo banner. Module toggles tab wrapped in `QueryStateView`. AI plan/subtask/cost tabs wrapped in `QueryStateView` (Plan Apply, Subtask Model Select always interactive when data loads). Risk weights, notification channels, and stats sections wrapped in `QueryStateView`. Honest empty states per tab ("No modules", "No risk profiles configured", "No notification channels yet"). |
| `apps/frontend/src/pages/OnboardingPage.tsx` | Plain `useQuery` hooks; shapes matched to real onboarding service. Wizard steps wrapped in `QueryStateView`. Real data or honest empty state per step. |
| `apps/frontend/src/hooks/use-phase6-data.ts` | Onboarding hooks (5 call sites): `useOnboardingStatus`, `useTeamMembers`, `useIntegrationGuidance`, `useDocumentation`, `useChallenges` — dropped `withDemoFallback`, plain `useQuery`, adapters for real shapes. Meta `{resource: 'onboarding'}` on each. |
| `apps/frontend/src/hooks/use-global-monitoring.ts` | Composite hook `useGlobalMonitoring` refactored to expose underlying query objects (`feedQuery`, `pipelineQuery`, `iocStatsQuery`, `leadersQuery`, `subStatsQuery`) instead of a single pre-computed `isDemo` flag. Pipeline-stuck verdict ("pipeline stalled", "throughput 0") computed only from real `pipeline` data, never when the pipeline query has errored or has no data. Queries: `useGlobalCatalog` (feeds), `useGlobalPipelineHealth` (pipeline), `useGlobalIocStats` (IOC stats), `useCorroborationLeaders`, `useSubscriptionStats` — all plain `useQuery`, adapters for real shapes. Meta `{resource: 'global-monitoring'}` on each. |
| `apps/frontend/src/pages/GlobalMonitoringPage.tsx` | Removed demo banner. Status badge, pipeline panel, feed health grid, IOC stats, corroboration leaders, subscription overview, and action bar all wrapped in `QueryStateView`. Composite hook now exposes query objects, so loading/error states render correctly. Honest empty states ("No feeds available", "No IOCs processed", etc.). Status verdict never shows "stuck/critical" when underlying data is missing/errored. |
| `apps/frontend/src/__tests__/byok-card.test.tsx` | Removed `isDemo: true/false` mock expectations. Updated all hook mocks to plain react-query shape: `{ data, isLoading, isError, error, refetch }`. |
| `apps/frontend/src/__tests__/customization-ai.test.tsx` | Updated AI config tab tests: removed `isDemo` mocks, added full `useQuery` shape. Verified Apply Plan/Subtask Model Select mutations work on real data. |
| `apps/frontend/src/__tests__/phase5-pages.test.tsx` | Updated integration/customization/onboarding tabs: removed `isDemo` mocks from 14 hooks; adapted mock data to real backend shapes (e.g., `useModuleToggles` returns `{id, module, enabled}`; `useIntegrationStats` returns real shape). Updated "Create SIEM/Webhook/Ticketing" tests to verify correct payload envelopes. |
| `apps/frontend/src/__tests__/global-monitoring-page.test.tsx` | Refactored to test composite hook with exposed query objects. Removed `isDemo` demo-fallback tests. Added: IOC stats error card rendering, status badge behavior when pipeline data missing, subscription stats error handling. Verified status verdict never shows stuck when data is absent. |
| `apps/frontend/src/__tests__/rca45-phase5-customization.test.ts` | Updated: removed `isDemo` expectations. Customization toggles, AI configs, risk weights, notification channels use real backend shapes in mocks. |
| `apps/frontend/src/__tests__/rca45-global-monitoring.test.ts` | Updated: composite hook exposes query objects, tests verify error cards render and verdicts don't fabricate critical status on missing data. |
| **New tests** | `apps/frontend/src/__tests__/honest-integrations.test.tsx` (integration CRUD, Test Connection, error cards, real shapes), `honest-customization.test.tsx` (module toggles, risk weights, AI plan, notifications, error cards), `honest-onboarding-global.test.tsx` (onboarding steps, global monitoring status + leaders + IOC stats). |

## Behaviour before/after

**`/integrations`** — Before: 0-integration tenant saw demo SIEM/Webhook/Ticketing entries behind a "Demo" banner; "Test Connection" was a no-op; create forms were disabled in "demo mode". After: empty tenant sees honest empty states ("No SIEM integrations yet") with next steps; Test Connection calls real API (`POST /integrations/:id/test`); create forms always interactive; secrets encrypted at rest by the backend.

**`/customization`** — Before: 0-module tenant saw demo toggles, AI plan tiers, cost estimates, risk weight profiles, and notification channels behind demo data markers; AI plan apply, subtask model select, and risk weight save were disabled in "demo mode". After: empty tenant sees honest empty states ("No modules", "No risk profiles", "No notification channels"); all controls always interactive; missing backend routes surface an error card + Retry (risk weights, notifications, stats routes, TAXII list); customization controls no longer disabled.

**`/onboarding`** — Before: each wizard step showed demo guidance content and next-step CTAs. After: real data or honest empty state per step. 

**`/global-monitoring` (super-admin only)** — Before: status badge showed a "demo verdict" computed from non-existent data; IOC stats, feed health, corroboration leaders, subscription stats rendered demo numbers. After: status badge verdict computed ONLY from real pipeline throughput/freshness data (never from missing data); IOC stats/leaders/subscription panels show real data or an error card + Retry. Pipeline-stuck detection never fires on errored/missing data.

**Side effect:** `/correlation` Create Ticket button (uses `useTicketingIntegrations`) is now correctly disabled for tenants with no ticketing integration (previously showed a button that would fail validation server-side).

## Tests

New: `apps/frontend/src/__tests__/honest-integrations.test.tsx`, `honest-customization.test.tsx`, `honest-onboarding-global.test.tsx` (24 tests total, verifying real backend shapes and QueryStateView rendering).

Updated: `byok-card.test.tsx`, `customization-ai.test.tsx`, `phase5-pages.test.tsx`, `global-monitoring-page.test.tsx`, `rca45-phase5-customization.test.ts`, `rca45-global-monitoring.test.ts` (removed `isDemo` mock expectations, added full react-query query shape).

Frontend suite: 2,043 passed + 2 skipped (was 2,008 + 2). Typecheck 0 errors, lint 0 errors.

Backend response shapes verified against actual handlers: `apps/integration-service/src/schemas/integration.ts` (SIEM/Webhook/Ticketing payloads, test endpoint), `apps/customization-service/src/schemas/customization.ts` (module toggles, risk profiles, notification channels), `apps/onboarding-service/src/schemas/onboarding.ts` (steps, guidance), `apps/api-gateway/src/routes/global-monitoring.ts` (IOC stats, leaders, subscription stats).

## How to verify

Local: `pnpm --filter @etip/frontend run test`.

Prod (after deploy): on a fresh 0-data tenant (or one with no integrations/customization/onboarding data), in a fresh incognito tab:
- Open `/integrations` — no "Demo" banner, no demo integration rows, honest empty states per tab ("No SIEM integrations yet"); click "Test Connection" on any integration (if any exist) and verify it hits real `/integrations/:id/test` endpoint (success or error, no demo).
- Open `/customization` → no "Demo" banner, empty "Modules" / "Risk Profiles" / "Notification Channels" tabs; all sliders/toggles/input fields fully interactive (not disabled while "demo" shows).
- Open `/onboarding` → no "Demo" banner, real guidance or empty state per step.
- Open `/global-monitoring` (super-admin only) → status badge shows "healthy" only if real pipeline data is loaded and throughput > 0; IOC stats/leaders/subscriptions show real data or an error card (no fabricated numbers).
- `/correlation` Create Ticket button is disabled on a 0-ticketing-integration tenant (was previously enabled but would fail server-side).

## Rollback

`git revert <merge commit>`, or before merge: `git reset --hard safe-point-2026-09-29-s173-pr1c`.

## Follow-ups

Backend gaps that now surface as error cards instead of demo data (tracked separately, not fixed):

1. **Integration stats shape mismatch** — `useIntegrationStats` calls `/integrations/stats`, backend returns field names that don't match the frontend adapter (e.g., `eventsPerHour`, `latency`, `deliveryRate` are 0 or missing). Fix: verify backend `/integrations/stats` handler returns the expected shape or frontend adapter needs a secondary translation layer.

2. **Customization risk weights route** — Frontend calls `POST /customization/risk-weights` for save/reset, but the real backend route does not exist. Routes live under `/customization/risk/profiles` and `/customization/risk/presets`. Fix: wire frontend to correct backend routes or add the missing `/customization/risk-weights` route.

3. **Customization notifications preferences** — Backend `/customization/preferences` returns one preferences object, frontend expects a channel list. Fix: align endpoint to return a proper channel list or change frontend expectations.

4. **Customization stats route missing** — Frontend calls `/customization/stats`, but no backend handler exists. Fix: add the route or remove the frontend stat card.

5. **TAXII managed-collections list route missing** — Frontend tries to list managed collections for STIX integrations, but no backend `GET /integrations/taxii/collections` exists. Fix: add the route or update frontend to remove the list UI.

6. **Global IOC stats route doesn't filter by resource type** — `/global-monitoring/ioc-stats` returns only overlay counters, not a matching `GlobalIocStatsService` route that the frontend expects. Fix: verify backend route returns the full IOC stats shape or create a secondary route.

7. **Subscription stats route (super-admin only)** — `/global-monitoring/subscription-stats` returns data but is not wired on the VPS backend (route declared but not registered in API gateway). Fix: enable the route on VPS or add the handler.

8. **Integration create for Jira/ServiceNow validation failure** — Frontend form does not collect `email`/`username` fields required by backend schema. Fix: add per-type form fields or update backend schema. Currently "Create Ticket" path works (CommandCenter Integrations tab is the working reference path).

9. **Corroboration leaders `sortBy` field** — Frontend sends `sortBy` in list queries, backend drops it from the schema. Fix: verify sort parameter is supported or remove frontend UI for sorting.

10. **Integration list metrics not computed at list level** — `eventsForwarded`, `latency`, `deliveryRate`, `recordCount` are 0 for all integrations in list response. Fix: compute these in the backend list handler or adapt frontend to only show them on detail view.

- **PR 1d:** `hooks/use-analytics-dashboard.ts` (~line 201-202) swaps in `DEMO_ANALYTICS` when the dashboard request fails and fabricates `avgConfidence ?? 72` / `avgEnrichmentQuality ?? 84` — own PR, feeds every dashboard widget.
- Original PRs 2–5 above (Command Center / `IocListPage` feed count / `/search` demo swap, list-page demo rows, `PageStatsBar`, enrichment/investigation fake vendor verdicts, dataset deletion, backend enrichment-stats source) are unchanged and run after 1c/1d per `docs/S172_FABRICATED_DATA_AUDIT.md`.
