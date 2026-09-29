# S174 — Plan feature flags enforced at the nginx edge (server-side)

**Date:** 2026-09-29 · **Session:** 174 · Branch `s174/plan-feature-verify` · PR #66 (`d2ca0ac`, merge `e240372`)

## Summary

Plan feature flags (`enabled:false` in a plan definition) were enforced only in the api-gateway's global `preHandler` (`apps/api-gateway/src/plugins/quota-enforcement.ts`, route map `apps/api-gateway/src/config/feature-routes.ts`). nginx (`docker/nginx/conf.d/default.conf`) proxies 14 `/api/v1/*` service paths straight to the backend services with only `service-auth.inc` (identity verification, from S147) — no feature check. A tenant on a plan that disabled a feature (e.g. Free → `digital_risk_protection`) could still call that feature's API directly; the frontend `FeatureGate` component is UX-only and never enforced anything server-side. Found during the S161a review (2026-09-26), fixed and deployed in this session.

## Why this matters

Server-side authorization has to hold regardless of which client (or lack of one) makes the request. A disabled feature that's only hidden in the UI is not actually gated — anyone who can read the API contract (every real attacker) can call it directly. This is the same class of gap `service-auth.inc` closed in S147c/RCA #48 for authentication; this session closes the equivalent gap for plan-level authorization.

## What changed

### 1. nginx (`docker/nginx/conf.d/default.conf`)

14 service `location` blocks now set an `$etip_feature` variable before including `service-auth.inc`:

| Path prefix | Feature key |
|---|---|
| `/api/v1/feeds` | `feed_subscriptions` |
| `/api/v1/iocs`, `/api/v1/ioc`, `/api/v1/search` | `ioc_management` |
| `/api/v1/enrichment` | `ai_enrichment` |
| `/api/v1/actors` | `threat_actors` |
| `/api/v1/vulnerabilities` | `vulnerability_intel` |
| `/api/v1/malware` | `malware_intel` |
| `/api/v1/graph` | `graph_exploration` |
| `/api/v1/correlations` | `correlation_engine` |
| `/api/v1/hunts` | `threat_hunting` |
| `/api/v1/drp` | `digital_risk_protection` |
| `/api/v1/reports` | `reports` |
| `/api/v1/alerts` | `alerts` |

The internal `location = /_etip_auth` (the `auth_request` target) now also forwards `proxy_set_header X-Etip-Feature $etip_feature;` and sets `uninitialized_variable_warn off;` (needed because of the trap below). A new named location `@etip_plan_denied` returns a JSON 403:

```json
{"error":{"code":"FEATURE_NOT_AVAILABLE","message":"...","feature":"digital_risk_protection","upgradeUrl":"/command-center?tab=billing"}}
```

### 2. nginx (`docker/nginx/conf.d/service-auth.inc`)

`error_page 403 = @etip_plan_denied;` — routes the api-gateway's 403 into the JSON body above (nginx `error_page` rewrites the *response*, not just the status; without this the 403 would carry the gateway's generic error body).

### 3. api-gateway (`apps/api-gateway/src/routes/auth-verify.ts`)

When the `X-Etip-Feature` header is present and the caller's role isn't `super_admin`:
1. `FeatureKeySchema.safeParse(header)` — an unrecognized key fails closed with 500 `UNKNOWN_FEATURE_KEY` (never lets an unknown key silently pass).
2. `getPlanLimits(tenantId)` — same plan-limits source `quota-enforcement.ts` already used.
3. If the plan defines the feature and `enabled === false` → 403 `FEATURE_NOT_AVAILABLE`.
4. Super-admin bypass and "feature missing from the plan definition → allow" both match the existing `quota-enforcement.ts` behavior, so the two enforcement paths (gateway preHandler, nginx auth_request) agree.

### Intentionally unmapped paths

`/integrations` (gateway maps it to `api_access`, which is off on Free/Starter/Pro — enforcing it here would break the Integrations tab, which every plan is meant to see), `/users` (a seat count, not an on/off feature), `/articles`, `/customization`, `/onboarding`, `/billing`, `/analytics`. These are listed as intentionally unmapped in the test below rather than silently missing.

## The auth_request variable trap (read this before touching nginx feature routing again)

nginx's `auth_request` runs the subrequest in a context that **shares the parent request's variables** and **re-runs server-level `rewrite`/`set` directives** for the subrequest's own location. Concretely: `/_etip_auth` lives at the `server` level, so if the server block (or an earlier `location /` block that the subrequest's URI resolves through) has a `set $etip_feature "";` default, that directive **re-fires during the subrequest** and clobbers whatever the calling location already set — the gateway then sees no `X-Etip-Feature` header at all and the check silently passes everything through (fail-open, not fail-closed).

This was proven directly: with a server-level `set $etip_feature "";` added on nginx:1.27-alpine, a gated route that should return 403 came back 200. There is **no server-level default** for `$etip_feature` in the shipped config — each of the 14 locations sets it directly, and `uninitialized_variable_warn off;` on `/_etip_auth` suppresses the (harmless) "using uninitialized variable" warning for the paths that legitimately send no feature header.

**Rule going forward:** never add a server-level `set $etip_feature ...;` default. `apps/api-gateway/tests/nginx-feature-map.test.ts` asserts the config has none — it fails the build if one appears.

## Files touched

- `docker/nginx/conf.d/default.conf` — 14 `set $etip_feature` directives, `X-Etip-Feature` header on `/_etip_auth`, `@etip_plan_denied` named location.
- `docker/nginx/conf.d/service-auth.inc` — `error_page 403 = @etip_plan_denied;`.
- `apps/api-gateway/src/routes/auth-verify.ts` — feature-key parse + `getPlanLimits` check + 403.
- `apps/api-gateway/tests/auth-verify.test.ts` — +11 plan cases (22 total).
- `apps/api-gateway/tests/nginx-feature-map.test.ts` — new, 31 tests (exact location→feature table, valid keys, no server-level default, header + `error_page` wiring, JSON body shape).

## Tests

api-gateway 366/366 (was 355 + 11 new). Typecheck clean. Lint 0 errors. Frontend unchanged (2,116 + 2 skipped). Real monorepo total 9,342 passed + 2 skipped (was 9,300 + 2).

## How to verify

**Config syntax:** `nginx -t` inside the live `etip_nginx` container — done on this deploy, no new warnings.

**Runtime semantics (done in a throwaway `nginx:1.27-alpine` container, 6/6 passed):**
1. Gated route (feature disabled on the test plan) → 403 JSON `FEATURE_NOT_AVAILABLE`.
2. Mapped route with the feature enabled → 200, request reaches the backend.
3. Unmapped route (e.g. `/integrations`) → no `X-Etip-Feature` header sent, behaves exactly as before this change.
4. A client-sent `X-Etip-Feature` header cannot inject or override the server-computed value (nginx's own `set` always wins over an inbound header of the same proxy name once `proxy_set_header` runs).

**Live VPS (after deploy):** CI/CD green, VPS HEAD `e240372`, 32/32 containers healthy, live nginx config confirmed to contain all 14 feature directives, no nginx warnings/errors in logs, public `/` and `/health` 200, unauthenticated `/api/v1/drp/assets` 401 (auth still required first, as before).

**Owner browser check (PASSED 2026-09-29 — Free-plan `tenant_admin` in incognito got `403` + `FEATURE_NOT_AVAILABLE` / `digital_risk_protection`):** log in as a Free-plan tenant, open DevTools console, run:
```js
const a = JSON.parse(localStorage.getItem('etip_auth'));
console.log('role:', a.user?.role, '| plan:', a.tenant?.plan);
const r = await fetch('/api/v1/drp/assets', { headers: { Authorization: 'Bearer ' + a.accessToken } });
console.log(r.status, await r.text());
```
(The SPA sends a Bearer token from `localStorage.etip_auth`, not a cookie — a bare `fetch` without it returns 401.) Expect `403` and a JSON body with `code: "FEATURE_NOT_AVAILABLE"`. Then click through a few other pages (dashboard, IOCs, search) to confirm nothing else broke — those features are enabled on every seeded plan today, so they should behave exactly as before.

## Reviews

`etip-reviewer` agent: PASS. Codex adversarial review: no bypass found; one Low-severity UI note (frontend doesn't yet show a friendly "upgrade" message for this specific 403 shape — cosmetic, not a security gap).

## Rollback

- Full revert: `git revert -m 1 e240372` on master, then deploy.
- Or locally before any further commits: `git reset --hard safe-point-2026-09-29-s174-plan-feature`.
- Removing just the 14 nginx `set $etip_feature` lines is also safe on its own — `auth-verify.ts` then sees no header and behaves exactly as it did before this session (gateway-level `quota-enforcement.ts` still enforces plan features on gateway-routed paths, unchanged).

## Deferred follow-ups (new this session)

1. **Usage counters not applied on nginx-proxied routes.** Daily/monthly quota counters (distinct from the on/off feature flags this session fixes) still only run through the gateway's `preHandler` — an `auth_request` subrequest can't return 429 or roll back a counted request on failure, so nginx-proxied routes don't decrement/check usage counters. Own task.
2. **Command Center Alerts & Reports tab has no plan check.** `apps/frontend/src/components/command-center/AlertsReportsTab.tsx` fetches `/alerts` and `/reports` without checking whether those features are enabled for the tenant's plan. No impact today — `alerts` and `reports` are enabled on every seeded plan — but would silently pass through if an admin ever disabled either.
3. **`feature-routes.ts` has stale entries.** `apps/api-gateway/src/config/feature-routes.ts` still lists `/hunting`, `/correlation`, `/threat-actors`, and maps `/integrations` to `api_access` — these don't match the actual nginx-served paths (`/hunts`, `/correlations`, `/actors`). The nginx map added this session (`default.conf`) is now the live source of truth for nginx-proxied routes; `feature-routes.ts` still governs any route reached only through the gateway directly (not proxied by nginx). Not fixed this session — needs its own pass to reconcile the two maps.

## Remaining owner queue after this session

Audit PR 3 (fake vendor verdicts / demo rows on detail and list pages — `PageStatsBar` needs owner OK) → audit PR 4 (dead demo code removal) → wiring follow-ups from the S173 sweep → remaining `isDemo` hooks → graph visual redesign (needs owner reference designs) → AI enrichment runner (DECISION-045) → owner-scheduled security fix (needs owner go-ahead; 2 private tenant-scope gaps stay out of public docs) → Step 3 (blocked on owner decisions D1–D7).
