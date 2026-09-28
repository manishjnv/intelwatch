# S172 — Sign-up and new-tenant dashboard fixes (after the owner's live test)

**Date:** 2026-09-28 · **Session:** 172 · Follows `docs/S172_SIGNUP_EMAIL_VERIFICATION.md`

The owner's live sign-up test (email → verify → log in) passed, and surfaced three problems. Each is fixed in its own PR, one module per PR, deployed in this order: C → A → B.

## PR C — frontend: sign-up dead end + honest trend pill

**Problem.** A user whose first sign-up never got its email and who signs up again sees "Email already registered — please sign in instead" or, when the org name is reused, "Tenant slug already taken". Neither says how to get a new link. The dashboard's "IOC Trend" pill also said "Stable" (or a percentage) with fewer than two data points.

| File | Change |
|---|---|
| `apps/frontend/src/pages/RegisterPage.tsx` | On 409 `EMAIL_ALREADY_REGISTERED` or `CONFLICT`: `CONFLICT` now reads "An organization with this name already exists."; under the plan cards, "Already signed up but didn't get the email?" + **Resend verification email** (`data-testid="register-resend-verification"`), reusing `useResendVerification` and the login page's link style. Success / 429 wait / generic error states. CAPTCHA handling unchanged |
| `apps/frontend/src/components/widgets/ThreatBriefingWidget.tsx` | Fewer than 2 `iocTrend` points → "—" (muted), not "Stable"; ≥ 2 points keep the ±5 % logic |
| `apps/frontend/src/__tests__/register-resend-verification.test.tsx`, `ioc-trend-missing-data.test.tsx` (new) | 8 tests |

`ExecSummaryCards` was checked: with < 2 points it only shows a neutral icon, no number, so it was left alone.

## PR A — user-service: tenant in the login response

**Problem.** The dashboard header showed "Your organization • Free Plan" for every customer — and **paid tenants were labelled "Free Plan"** — because `login()` returned tokens and the user but not the tenant, although the login query already loads it.

| File | Change |
|---|---|
| `apps/user-service/src/service.ts` | `LoginResult` now requires `tenant: { id, name, slug, plan }`. `login()` and `completeLoginAfterMfa()` return it via `_toSafeTenant()` — an explicit 4-field allowlist, never the full tenant row. No repository change (both queries already `include` the tenant). The gateway (`/auth/login`, MFA verify) and frontend (`setAuth`) already pass `tenant` through |
| `apps/user-service/__tests__/service.test.ts` | 2 tests: exact tenant shape, no extra columns, for both paths |

Users already logged in keep the old stored state until they log in again.

## PR B — analytics-service: no fabricated trend data in production

**Problem.** analytics-service seeded random 30-day demo curves into its trend store at every startup, and `GET /api/v1/analytics/trends` served them as real. That is the source of "IOC Trend ↓14 %" on a brand-new tenant with 0 IOCs.

| File | Change |
|---|---|
| `apps/analytics-service/src/index.ts` | Removed the 11 `seedDemo()` calls and the log line |
| `apps/analytics-service/src/services/trend-calculator.ts` | Deleted the now-unused `seedDemo()` generator |
| `apps/analytics-service/tests/*` | Fresh calculator / freshly built app serve no trend series; route tests use a deterministic `record()` fixture |

After deploy, trend points build up only from real recorded values; until two exist the pill shows "—". Trend history is still in-memory (analytics is on the Step 3 persistence list).

## PR D — frontend: three more fabricated dashboard widgets

**Problem.** Found in the owner's second live check: on a 0-IOC tenant the dashboard still showed invented data with no "Demo" label — Threat Activity Timeline ("Hash-387", "Actor-552"… from `generateStubEvents()`), Geo Threat Map (hardcoded `DEMO_GEO_DATA`: China 342, Russia 289…), ATT&CK Tactics (counts = `max(topIocs × 8, 40) × fixed weights`, labelled "Beta").

| File | Change |
|---|---|
| `apps/frontend/src/components/viz/ThreatTimeline.tsx` | `generateStubEvents` deleted; no events → "No threat activity yet" |
| `apps/frontend/src/pages/DashboardPage.tsx` | Timeline fed from real IOCs via `useIOCs({ limit: 15, sortBy: 'createdAt' })` (same hook and fields as the Recent IOCs card) |
| `apps/frontend/src/components/widgets/GeoThreatWidget.tsx` | Fake map, country data and scaling deleted (256 → 28 lines); "Geographic attribution not available yet" until a real per-country source exists |
| `apps/frontend/src/components/widgets/AttackTechniqueWidget.tsx` | Weight heuristic deleted; "ATT&CK mapping not available yet"; no "Beta" badge implying live data |
| tests | 6 existing test files updated to assert the empty states; new `dashboard-timeline-wiring.test.tsx` |

Owner decision recorded the same evening: real tenants get **honest empty states**, never demo data (to be logged as DECISION-048). The wider sweep is tracked in `docs/S172_FABRICATED_DATA_AUDIT.md`.

## Verify

- Tests: frontend 1,996 passed / 2 skipped · user-service 186 · analytics-service 93 — typecheck + lint clean on each (frontend lint: 0 errors, pre-existing warnings only).
- After deploy (owner, fresh incognito tab): dashboard header shows the real org name and plan after a fresh login; "IOC Trend" shows "—" for a new tenant; on `/register`, re-using a registered email or org name shows the resend option and the email arrives.

## Rollback

Revert the individual PR merge commit; the three changes are independent. Restore point: tag `safe-point-2026-09-28-s172-ui-fixes`.
