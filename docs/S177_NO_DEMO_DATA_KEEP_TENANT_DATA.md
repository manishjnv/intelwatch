# S177 — No demo data, offboarding keeps tenant data

**Date:** 2026-09-30 · **Session:** 177 · Branch `s177/no-demo-data-deactivate-offboarding` · safe-point tag `safe-point-2026-09-30-s177-nodemo`

PR #71. Commits: `647805d` (onboarding demo/sample seeding removed), `b56fb54` (offboarding deactivate-only), `6134e95` (frontend isDemo sweep). No schema change.

## What and why

Two owner decisions, 2026-09-30:

1. "Remove demo data" — real tenants never get fabricated data. Reaffirms DECISION-048.
2. "For offboarding just deactivate tenant and keep the data" — no scheduled purge.

## What changed

**Onboarding (`647805d`):** `DemoSeeder` and its catalog deleted. `RealSeeder` no longer seeds sample IOCs/actors/malware (the sample-data step removed). `POST /onboarding/welcome/seed-demo` (path kept for compatibility) now only adds real starter feed subscriptions, and returns 503 `SEEDER_UNAVAILABLE` when the seeder is off — no demo fallback. Routes `GET /welcome/demo-status`, `DELETE /welcome/demo-data`, `GET /welcome/demo-available` removed. Frontend button "Seed Demo Data" renamed to "Add starter feeds" with helper text "Subscribes you to recommended public threat feeds. No sample data is added." (hook `useAddStarterFeeds`).

**Frontend demo sweep (`6134e95`):** all remaining `isDemo` fallbacks removed. Intel/search: IOC/actor/malware/vulnerability lists, IOC detail (no invented relationship nodes — honest "No relationships discovered yet"), enrichment panel (honest "Not enriched yet." + "Enrich now"), confidence breakdown (shown only when the backend sends its real inputs), campaigns, linked IOCs, global IOCs/catalog; `hooks/demo-data.ts` deleted. Command Center/admin: access reviews, compliance reports, break-glass, tenant overrides, SSO, global AI config, plan limits — honest loading/error/empty states, `DEMO_*` constants deleted. Remaining `*-demo-data.ts` hook files now only hold TypeScript types.

**Offboarding (`b56fb54`):** deactivate only — block tenant + users, end sessions, revoke API keys, disable SSO, revoke SCIM tokens. No purge date, no archive job. Reactivation is the existing cancel flow (UI label "Reactivate"). Deleted the never-scheduled `offboarding-purge-worker.ts`, `external-purge.ts`, and `offboarding-archive-worker.ts` (user-management-service) — recoverable from git (last purge version in commit `17a7737`) if a legal erasure request ever needs a manual one-off. `@etip/shared-types` offboarding response/pipeline purge fields are now nullable and always null. Command Center Offboarding panel now shows "Deactivated · data retained", offboarded date + by whom, and "Reactivate" — no purge wording.

## Production checks (2026-09-30)

- Zero rows tagged `DEMO` or `ONBOARDING` in `iocs`, `threat_actor_profiles`, `malware_profiles`, `vulnerability_profiles` across all 11 tenants — no data cleanup needed for the seeding change.
- All 11 tenants active, none with a purge date — no data migration needed for the offboarding change.

## Tests

| Module | Before | After |
|---|---|---|
| onboarding | 276 | 219 |
| user-management-service | 375 | 366 |
| user-service | 185 | 185 (unchanged) |
| frontend | 2,082 | 1,998 |

Test cases for deleted demo constants/routes were removed, not left failing. Full local gate green (lockfile, memory guard, typecheck, lint, tests). CI total: **9,415 passed, 2 skipped, 0 failed, 33 packages** (was 9,566 after PR #70 — the drop is tests of deleted demo/purge code, not a regression).

## Review

`codex:rescue` verdict on the offboarding change: **REVISE** — an empty-string purge date was reachable in the response shape. Fixed by making the `@etip/shared-types` offboarding purge fields nullable instead of empty-string defaults.

## New backlog findings (added to `docs/PENDING_WORK.md` §3)

- No backend route for `/settings|admin/access-reviews/stats` — the stats cards now show an honest error card.
- No backend route for the super-admin tenant SSO view `/admin/tenants/:tenantId/sso` — shows an honest error card.
- onboarding-service's `errorHandlerPlugin` is registered without `fastify-plugin`, so its `{error:{…}}` response format never applies outside its own route encapsulation — other routes return Fastify's default error shape.
- Cosmetic: rename the type-only `apps/frontend/src/hooks/*-demo-data.ts` files to `*-types.ts`.

## How to verify

- VPS: `POST /onboarding/welcome/seed-demo` adds feed subscriptions only, no sample IOCs/actors/malware/CVEs appear for a new tenant.
- Command Center → tenant → Offboarding panel shows "Deactivated · data retained" after offboarding a tenant, not a purge countdown.
- `git grep isDemo apps/frontend/src` outside test files → no matches.

## Rollback

`git reset --hard safe-point-2026-09-30-s177-nodemo` (before merge), or revert PR #71's merge commit after. The deleted purge worker files are recoverable individually from commit `17a7737` if a one-off purge is ever needed.

## Deploy result

PR #71 merged as `75e5570` ("Merge pull request #71 from manishjnv/s177/no-demo-data-deactivate-offboarding"). CI/CD run 36763489579: Test ✓, Build & Push ✓, Deploy to VPS ✓. VPS HEAD `75e5570`, 32/32 `etip_*` containers healthy.

**Live checks (2026-10-01):**
- `GET /api/v1/onboarding/welcome/demo-available` and `/demo-status` → 404 (routes removed).
- Served frontend bundle contains "Deactivated · data retained" (1), "Reactivate" (5), "Not enriched yet." (2); contains no "Seed Demo Data" and no "days until purge".
- `NOAUTH` = 0 and 0 restarts on `etip_onboarding`, `etip_user_management`, `etip_alerting`, `etip_caching`.

**Finding — unrouted OnboardingPage:** `apps/frontend/src/pages/OnboardingPage.tsx` is not routed — `/onboarding` redirects to `/command-center#settings` (`App.tsx:110`) — so the old "Seed Demo Data" button was never reachable in the live app. This is consistent with the zero DEMO/ONBOARDING production rows found above. Added to `docs/PENDING_WORK.md` §3: delete the unrouted page (and its tests), or route it.

**Owner decisions now live:** DECISION-048 (no demo data — onboarding seeding + frontend `isDemo` fallbacks removed) and DECISION-052 (offboarding deactivates + keeps data, no purge).

**Next engineering queue** (`docs/PENDING_WORK.md`): S159b caching archive rebuild from MinIO, backlog persistence modules (reporting, customization, user-management in-memory stores, correlation-engine), wiring fixes incl. the two missing backend routes (access-review stats, super-admin tenant SSO view), AI enrichment runner, graph redesign (needs owner references), owner-scheduled security fix, SEO G1 in parallel.
