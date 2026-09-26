# S161a — Honest UI, PR A: shared error pattern + security screens (Step 5)

**Date:** 2026-09-26 · **Branch:** `s161a/honest-ui-core` · **Module:** frontend only · **Spec:** `docs/roadmap/STEP_05_HONEST_UI.md` §5, §8
**Restore point:** `git tag safe-point-2026-09-26-s161a`

## Why
When an API failed, several screens silently showed invented data (fake sessions, fake MFA enforcement state,
random feature-usage numbers). A 500, a 404 and a real empty list all looked the same. This PR makes failures
visible ("Couldn't load … — Retry") on the security-sensitive screens and adds the shared pattern the rest of
Step 5 will reuse.

## What changed (all under `apps/frontend/src/`)
| File | Change |
|---|---|
| `components/ui/QueryStateView.tsx` (new) | Loading skeleton → error card (`role="alert"`, resource name, reason, **Retry** = `refetch()`) → empty state → data. Works at 375 px (`min-w-0`, `flex-wrap`, 36 px button). No sample-data option yet (S161b adds it for showcase pages only). |
| `hooks/useApiError.ts` | `classifyError` exported (reused by the error card); 404 → "Not available yet". |
| `main.tsx` | `QueryCache.onError` → existing debounced toast (`notifyApiError`), so hooks can let errors throw. Name comes from `query.meta.resource`. |
| `hooks/use-mfa.ts` | Enforcement paths fixed to `/auth/settings/mfa/enforcement` and `/auth/admin/mfa/enforcement` (gateway mounts `mfaRoutes` under `/api/v1/auth`, `api-gateway/src/app.ts:133`). **The old paths 404'd, so the enforcement toggle never worked in production.** `DEMO_ENFORCEMENT` fallback removed. |
| `hooks/use-sessions.ts` | `DEMO_SESSIONS` fallback removed. |
| `hooks/use-feature-limits.ts` | `DEMO_LIMITS` (random usage) and `isDemo` removed. Returns the full query result + `features`. `useFeatureEnabled` = `entry?.enabled ?? true` (owner decision, option A). |
| `components/FeatureGate.tsx` | Renders nothing while limits load (the Upgrade CTA used to flash on every page load). |
| `components/security/SecurityPanel.tsx`, `ActiveSessionsList.tsx` | Error card on failure; the MFA toggle never renders when the query errored. |
| `components/command-center/TenantUsagePanel.tsx` | Demo badge removed; error card + "No plan limits are set for this tenant." empty state. |
| `hooks/security-demo-data.ts` | Deleted (no remaining users). |
| `hooks/use-plan-builder.ts` | W17: demo annual prices 95,988 / 179,988 / 479,988 and plan id `teams` → `pro`, matching seeds and `data/plans.ts` × 12. |

## Owner decision recorded here — FeatureGate (option A)
FeatureGate wraps core routes (`/iocs`, `/search`, graph, hunting, DRP, correlation). A page is locked only when
`/billing/limits` says `enabled:false` for that feature. On an error or a missing entry the page loads. This matches
the sidebar (`DashboardLayout.tsx:169`, `?? true`). Seeded plans (`prisma/seeds/plan-definitions.ts`) list every
feature key explicitly, so the default only applies on a fetch error or an unseeded plan — no seeded plan gains access.
Rejected option B (fail closed) would put an Upgrade wall on the IOC page during any billing-limits outage.

## Tests
New: `query-state-view`, `use-sessions-no-demo`, `use-mfa-enforcement`, `use-feature-limits-no-demo`,
`plan-builder-prices`. Updated to the honest behaviour: `active-sessions`, `feature-gate-wiring` (mock state now
reset in `beforeEach`), `use-mfa`, `use-mfa-setup-no-demo`. Full frontend suite (Node 20.20, see note): 1,850 passed,
2 skipped, 6 failed — all 6 from one leaked mock flag in `feature-gate-wiring`; fixed, and the 9 touched test files
re-run green (62/62). CI runs the full suite.

**Local note:** Vitest cannot start on Node 20.11 (jsdom dep needs `require(esm)`, Node ≥ 20.19). CI uses latest 20.x.
Workaround without upgrading: `cd apps/frontend && npx -y node@20 ./node_modules/vitest/vitest.mjs run`.

## How to verify (production)
1. `curl -s -o /dev/null -w '%{http_code}' https://intelwatch.in/api/v1/auth/settings/mfa/enforcement` → `401` (route exists; was 404 on the old path).
2. As tenant admin: Settings → Security → MFA Enforcement toggle persists after reload.
3. `/iocs` and `/search` load for super-admin and a tenant user.
4. Built bundle has no `DEMO_ENFORCEMENT` / `DEMO_LIMITS` / fake session strings.

## Found, not fixed (follow-ups)
- `MfaEnforcement` type (`types/auth-security`) declares `gracePeriodDays/usersWithMfa/totalUsers`; the server returns `{enforced, enforcedBy?, enforcedAt?}`. Optional fields, guarded — no crash.
- PR B (next): billing/admin hooks in `use-phase6-data.ts`, user hooks in `use-phase5-data.ts` and their 8 screens.

## Rollback
Revert the PR (frontend only, no backend/schema change), or `git reset --hard safe-point-2026-09-26-s161a` before merge.
