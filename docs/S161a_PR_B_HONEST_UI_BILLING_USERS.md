# S161a — Honest UI, PR B: billing/admin/users hooks + screens (Step 5)

**Date:** 2026-09-27 · **Branch:** `s161a/honest-ui-billing-users` · **Module:** frontend only · **Spec:** `docs/roadmap/STEP_05_HONEST_UI.md` §5, §8, §12
**Restore point:** `git tag safe-point-2026-09-27-pre-pr-b`
**Follows:** `docs/S161a_HONEST_UI_CORE.md` (PR A — pattern + security screens, PR #44, deployed)

## Summary
PR A built the shared honest-UI pattern (`QueryStateView`, `QueryCache.onError` toasts, throw-on-failure hooks)
and applied it to the security-sensitive screens. PR B applies the same pattern to billing, admin ops, and user
management: `use-phase6-data.ts`, `use-phase5-data.ts`, `use-plan-builder.ts`, and the screens that render them.
No backend changes. Converting these hooks surfaces real path/shape mismatches between the frontend and several
billing/admin routes that were previously hidden behind demo fallback data — documented below for S163.

## What changed (by area)

**Hooks — throw + `meta.resource` pattern (same as PR A):**
- `use-phase6-data.ts`: `useBillingPlans`, `useUsageMeters`, `useCurrentSubscription`, `usePaymentHistory`,
  `useBillingStats`, `useSystemHealth`, `useMaintenanceWindows`, `useAdminTenants`, `useAdminAuditLog`,
  `useAdminStats`, `useDlqStatus`, `useQueueHealth`, `useQueueAlerts` converted to `meta: { resource }` +
  throwing `queryFn`s. `withDemoFallback` kept only for the onboarding/integration/customization hooks in this
  file (S161b).
- `use-phase5-data.ts`: `useUsers`, `useTeams`, `useRoles`, `useSessions`, `useAuditLog`,
  `useUserManagementStats` converted the same way.
- `use-plan-builder.ts`: `usePlanBuilder` — `DEMO_PLANS` fallback deleted; hook now exposes
  `isError`/`error`/`refetch` instead of silently substituting demo plans on failure.
- Demo constants deleted from `phase5-demo-data.ts` and `phase6-demo-data.ts` (the ones only used by the
  hooks above; `withDemoFallback` itself stays for the S161b hooks still using it).

**Shape guards:** where the old demo predicate checked a field to decide "this looks fake, show demo instead",
the `queryFn` now throws `Unexpected response from <path>` on a wrong-shaped response. The single-object hooks
(usage, billing stats, system health, admin stats, DLQ, queue health) also throw on `null`. `useCurrentSubscription`
passes `null` straight through — `null` is a valid state (no subscription), not an error. Empty lists are valid
data (empty state), not an error.

**Screens wired to `<QueryStateView>`:**
- Pages: `BillingPage.tsx`, `AdminOpsPage.tsx`, `UserManagementPage.tsx` (+ `UserDetailPanel` in
  `viz/UserManagementModals.tsx`).
- Command Center panels: `BillingPlansTab.tsx`, `SystemTab.tsx`, `PipelinePanel.tsx`, `PlanBuilderPanel.tsx`,
  `UsersAccessTab.tsx`, `ComplianceReportsPanel.tsx`.
- `QuotaWarningBanner.tsx` — `QuotaUpgradeModal` shows "Plans unavailable — contact sales" when the plans
  query has no data instead of rendering an empty/broken upgrade grid.
- `ComplianceReportsPanel.tsx` — the DSAR user-picker dropdown now shows "Couldn't load users. <reason>."
  instead of silently listing nobody. Previously, on a users-fetch failure it fell back to demo users, so a
  DSAR request could be started for a user id that doesn't exist in this tenant.
- All `isDemo` badges/banners and demo-only disabled buttons removed from the above screens.
- Stat tiles across these screens show `—` on missing/errored data, never a fake `0`.

**`BillingPlansTab.tsx` specifics:**
- The hardcoded fake super-admin tenant table (Acme Corp, SecOps Ltd, ThreatLab, CyberShield) was replaced
  with a real `/admin/tenants` call via `useAdminTenants`, in its own `AdminTenantSubscriptions` component
  (`BillingPlansTab.tsx:112`). It is only mounted when `isSuperAdmin` (`:166`), so a tenant admin never fires
  a request that would 403. Columns are Tenant / Plan / Status / Seats — Usage% and Renewal columns were
  dropped because `TenantRecord` has no such fields.
- Fake coupon codes (LAUNCH50, TEAMS20, ANNUAL15) were replaced with "Offers aren't available yet" copy —
  billing-service has a `GET /coupons/:code` and `POST /coupons/apply`, but no LIST route, so there is nothing
  to show as a coupon catalog. Applying a coupon by code still works via `useApplyCoupon`.
- The tenant Subscription panel no longer defaults to a fake "Free Plan · active · monthly" when no
  subscription record exists. Plan name now comes from, in order: the real subscription, else the tenant's
  plan from the login session mapped through `data/plans.ts` `PLANS`, else `—`. Cycle/status/discount show
  `—` when there is no subscription. The "Your Plan Includes" feature list is hidden when the plan is unknown.

**`UserManagementPage.tsx`:** the audit log `action` filter is a server-side query param. The free-text audit
search box has no matching server param, so it stays a client-side filter over the currently loaded page (same
behavior as before, just noted here since it's easy to assume it was upgraded alongside the rest).

**Tests:** new — `use-phase5-no-demo.test.ts`, `use-phase6-no-demo.test.ts`, `plan-builder-no-demo.test.ts`,
`users-honest-ui.test.tsx`. Deleted — `plan-builder-prices.test.ts` (it only guarded the now-removed
`DEMO_PLANS` constant; the W17 price assertion itself is unaffected — the real prices in `use-plan-builder.ts`
didn't change in this PR). Updated — `admin-queue-alerts.test.tsx`, `command-center-billing-alerts.test.tsx`,
`compliance-reports-panel.test.tsx`, `phase5-pages.test.tsx` to the honest-UI behavior (error/empty states
instead of demo fallback).

Full suite before review fixes: 126 test files, 1,908 passed, 2 skipped; `tsc` 0 errors; `eslint` 0 errors.
Final count (after review fixes): 126 files, 1,920 passed, 2 skipped (was 1,858 after PR A); `tsc --noEmit` 0 errors; eslint 0 errors.

## Files touched
```
M  apps/frontend/src/__tests__/admin-queue-alerts.test.tsx
M  apps/frontend/src/__tests__/command-center-billing-alerts.test.tsx
M  apps/frontend/src/__tests__/compliance-reports-panel.test.tsx
M  apps/frontend/src/__tests__/phase5-pages.test.tsx
D  apps/frontend/src/__tests__/plan-builder-prices.test.ts
?? apps/frontend/src/__tests__/plan-builder-no-demo.test.ts
?? apps/frontend/src/__tests__/use-phase5-no-demo.test.ts
?? apps/frontend/src/__tests__/use-phase6-no-demo.test.ts
?? apps/frontend/src/__tests__/users-honest-ui.test.tsx
M  apps/frontend/src/components/QuotaWarningBanner.tsx
M  apps/frontend/src/components/command-center/BillingPlansTab.tsx
M  apps/frontend/src/components/command-center/ComplianceReportsPanel.tsx
M  apps/frontend/src/components/command-center/PipelinePanel.tsx
M  apps/frontend/src/components/command-center/PlanBuilderPanel.tsx
M  apps/frontend/src/components/command-center/SystemTab.tsx
M  apps/frontend/src/components/command-center/UsersAccessTab.tsx
M  apps/frontend/src/components/viz/UserManagementModals.tsx
M  apps/frontend/src/hooks/phase5-demo-data.ts
M  apps/frontend/src/hooks/phase6-demo-data.ts
M  apps/frontend/src/hooks/use-phase5-data.ts
M  apps/frontend/src/hooks/use-phase6-data.ts
M  apps/frontend/src/hooks/use-plan-builder.ts
M  apps/frontend/src/pages/AdminOpsPage.tsx
M  apps/frontend/src/pages/BillingPage.tsx
M  apps/frontend/src/pages/UserManagementPage.tsx
```

## Owner decisions / defaults taken
- **Owner decision (2026-09-27): ship honest now.** Reviewing this PR surfaced the billing/admin path+shape
  mismatches below (they were hidden by the demo fallback). The owner chose to merge and deploy PR B as-is —
  tenant `/billing` shows error cards for Plans and Usage and '—' stat tiles until S163 fixes the paths/shapes —
  rather than holding the merge or adding a partial `priceInr→price` adapter. Same stance as the Users screens
  (404 → "Not available yet" until S162). Rationale: keeps the PR frontend-only / one module; no customers yet.
- O1 (sample data) does not apply — none of these screens are
  showcase pages, so sample data stays off regardless of how O1 is eventually answered (already noted in
  `STEP_05_HONEST_UI.md` §12).
- `AdminTenantSubscriptions` is gated on `isSuperAdmin` client-side, matching the existing pattern for other
  super-admin-only panels in this file — not a new pattern.

## Found, not fixed (hand-off to S162/S163)
Converting these hooks to throw-on-failure surfaced real path/shape mismatches that were previously invisible
because a failed or malformed response silently fell back to demo data. None of these are bugs introduced by
this PR — they are pre-existing backend/frontend mismatches this PR makes visible for the first time.

| Screen / call | Backend reality (verified in code) | What the UI shows |
|---|---|---|
| Users screens: `/users`, `/users/teams`, `/users/roles`, `/users/sessions`, `/users/audit`, `/users/stats` | Routes don't exist yet in user-management-service (S162 adds them) | "Couldn't load users · Not available yet" |
| `GET /billing/plans` | Returns `priceInr`/`priceUsd`; frontend `BillingPlan` type expects `price` (`billing-service/src/services/plan-store.ts`) | Billing plans grid shows an "Unexpected response" error card |
| `GET /billing/usage` | Returns flat snake_case `{api_calls, iocs_ingested, enrichments, storage_kb, …}`; frontend expects nested `{apiCalls:{used,limit,resetAt}, …}` (`billing-service/src/routes/usage.ts:30`) | Usage meters show an error card |
| `GET /billing/subscription` | Only `GET /billing/subscriptions` (plural) exists (`billing-service/src/routes/subscriptions.ts:67`) → 404 on the singular path | Subscription fields show `—`; plan name falls back to the login-session plan |
| `GET /billing/stats` | No route (closest is `/billing/admin/dashboard`, admin-only) → 404 | Billing stat tiles show `—` |
| `GET /admin/stats` | No route (closest is `/admin/audit/stats`) → 404 | Admin Ops stat tiles show `—` |
| `GET /admin/system/health`, `GET /admin/queues`, `GET /admin/dlq` | Match the frontend shape | Real data renders normally |

Before this PR every row above silently rendered demo data, which hid all of these mismatches from both users
and from testing.

Also carried forward, not fixed here:
- S163 must fix the billing path/shape mismatches above (adapt the frontend types/paths, or add/rename backend
  routes — whichever the owner picks per row).
- S162 adds the `/users` routes in user-management-service.
- `apiList()`'s `normalizeList` silently returns an empty envelope for a response shape it doesn't recognize
  (pre-existing, not touched here).
- `BillingPage.tsx` (~770 lines) and `AdminOpsPage.tsx` (~800 lines) both exceed the 400-line file-size rule.
  Pre-existing, not addressed in this PR — split later.
- No coupon list endpoint exists in billing-service; the coupon catalog UI stays a "not available yet" message
  until one is added.

## How to verify

**Local:**
```
cd apps/frontend
pnpm exec vitest run
pnpm exec tsc -b --force tsconfig.build.json
pnpm exec eslint .
```

**Production (after merge + deploy):**
1. Log in as a tenant admin and as a super-admin.
2. `/billing` — plans grid shows an error card (not a fake plan grid), usage section shows an error card, stat
   tiles show `—`, no "Acme Corp"/"LAUNCH50" text anywhere.
3. Command Center → Billing → Subscription: real plan name shown (no fake "Free Plan" default for a paid
   tenant); super-admin sees the real tenant list in `AdminTenantSubscriptions`.
4. Command Center → System / Pipeline: real queue and health data (these routes match, so should render live
   data, not error cards).
5. Any `/users`-type screen (Users, Teams, Roles, Sessions, Audit, Stats) shows "Not available yet", not fake
   rows.
6. Check all of the above at 375px width (feedback_mobile_first.md).
7. Search the built bundle for "Demo", "demo data", "(demo)" — none should appear on these screens.

## Rollback
Revert the merge PR on `master` (frontend only, no backend/schema change), or before merge:
`git reset --hard safe-point-2026-09-27-pre-pr-b`.
