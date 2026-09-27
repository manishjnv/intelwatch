# S161a PR B + Post-Deploy Hotfixes — Full Session Detail

**Date:** 2026-09-27 · **Session label:** S161a PR B + post-deploy hotfixes · **Module:** frontend only
**PROJECT_STATE Session counter:** 161 → 162
**Restore point:** `git tag safe-point-2026-09-27-pre-pr-b`
**Follows:** `docs/S161a_HONEST_UI_CORE.md` (PR A — pattern + security screens)
**Detail of record for PR B itself:** `docs/S161a_PR_B_HONEST_UI_BILLING_USERS.md` (this doc adds the timeline, the three post-deploy hotfixes, and the closing verification)

## Summary

Step 5 "Honest UI" PR B removed the remaining silent demo fallbacks from billing, admin-ops, and
user-management hooks and screens, applying the `QueryStateView` pattern built in PR A. Three post-deploy
hotfixes followed the same day, each triggered by a real crash the owner hit in the browser after a
fallback that used to hide it was removed. All four changes shipped as separate PRs, each merged, deployed,
and verified individually — no batching of unrelated fixes. Final state: master at `0b126ff`, VPS at
`f012bdc`, 32/32 `etip_*` containers healthy, 1,926 frontend tests (2 skipped), `tsc`/`eslint` 0 errors.

## Timeline

1. **Plan** — Scope: convert `use-phase6-data.ts` (billing + admin hooks), `use-phase5-data.ts` (user
   hooks), and `use-plan-builder.ts` from silent-fallback to throw + `meta.resource`, then wire the
   matching screens to `<QueryStateView>`. Declared frontend-only, one module, per `docs/SESSION_HANDOFF.md`
   from S161a PR A. Tag `safe-point-2026-09-27-pre-pr-b` cut before touching code.
2. **Parallel build** — Two Sonnet subagents implemented in the same working tree with file ownership split
   (billing/admin hooks + screens vs. users hooks + screens) to avoid merge conflicts, both following TDD.
3. **Opus diff review** — caught and sent back for revision before any push:
   - Tenant `/admin/tenants` call would 403 for a non-super-admin — gated `AdminTenantSubscriptions` on
     `isSuperAdmin` client-side so a tenant admin never fires the request.
   - A single-object hook (e.g. usage, billing stats) didn't throw on a `null` response, letting a null
     silently render as an empty state indistinguishable from "no data yet".
   - `BillingPlansTab`'s Subscription panel still defaulted to a fake "Free Plan · active · monthly" when no
     subscription record existed — changed to fall through subscription → login-session plan → `—`.
4. **Revision + re-review** — one round, all three points fixed, tests re-run (126 files, 1,908 → 1,920
   passed after the fixes landed).
5. **PR #45 → merge `cd4a227`** — CI/CD run `36297890539` green (test/typecheck/lint, build & push, deploy),
   completed 05:52 UTC. Production verify: VPS HEAD `cd4a227`, 32/32 containers healthy, `/` and `/health`
   200, new honest-UI strings present in the bundle, PR B demo strings (fake tenants/coupons/users) absent.
6. **Owner browser check** — found two crashes the removed fallbacks had been hiding (see Hotfix 1 below).
7. **Hotfix 1 (PR #46 → `1111965`)** — fixed same day, CI run `36302952387` green.
8. **Owner continued checking** — found a third crash in Emergency Access (Command Center → System →
   break-glass audit tab).
9. **Hotfix 2 (PR #47 → `5489428`)** — merged on CI alone (1-line fix + a red/green test reproducing the
   exact prod error), no separate `etip-reviewer` pass — justified by the fix size and the existing test.
10. **Hotfix 3 (PR #48 → `f012bdc`)** — the break-glass fix in hotfix 2 exposed a second, deeper issue (the
    audit rows were raw Prisma `AuditLog` records, not shaped for the panel) plus an unrelated
    maintenance-window crash found by the same page-shape audit; both fixed together since they were found
    in the same audit pass.
11. **Session close** — all four PRs deployed and verified; docs updated after each hotfix, closing update
    now.

## Symptom / root cause / fix / test — each hotfix

### Hotfix 1 — Command Center → System tab crash + Plan Builder false empty state
- **Symptom:** Command Center → System tab threw `Cannot read properties of undefined (reading 'total')`.
  Plan Builder showed "No plans defined yet" even though plans exist.
- **Root cause:** `GET /admin/system/health` has no `summary` field in its real response — `SystemTab.tsx`
  read `data.summary.total` unconditionally. Separately, `usePlanBuilder` read `r.data` after calling
  `api()`, but `api()` already unwraps `{data, total}` — so `r.data` was always `undefined`, which the
  (now-removed) demo fallback used to mask.
- **Fix:** `apps/frontend/src/components/command-center/SystemTab.tsx` — derive healthy/degraded/down+total
  counts from the real `services` array when `summary` is absent; uptime shows `—` when unknown.
  `apps/frontend/src/hooks/use-plan-builder.ts` — use the array `api()` returns directly; throw on a
  non-array response instead of silently treating it as empty.
- **Test:** new `SystemTab` test case using the exact admin-service response shape (no `summary`) —
  reproduces the prod crash before the fix, passes after. `use-plan-builder` test corrected to assert
  against what `api()` actually returns, plus a new non-array → `isError` case.

### Hotfix 2 — Emergency Access crash on successful audit fetch
- **Symptom:** Command Center → System → Emergency Access threw `Cannot read properties of undefined
  (reading 'length')` on a normal, successful load — a bug that predates this session (present since S18)
  but was invisible until the demo fallback covering `useBreakGlassAudit` was removed in PR B.
- **Root cause:** `useBreakGlassAudit` typed its response as `api<{data, total}>(...)`, but `api()` already
  unwraps that envelope and returns the array directly — so the hook was reading `.length` off `undefined`.
- **Fix:** `apps/frontend/src/hooks/use-break-glass.ts` — switched `useBreakGlassAudit` to `apiList()`,
  matching the pattern already used elsewhere for list endpoints.
- **Test:** new `use-break-glass-audit.test.ts` reproducing the exact prod crash shape, green after the fix.
  Merged on CI alone (1-line fix + this test) — no separate `etip-reviewer` pass, judged proportionate to
  the change size with a red/green test already proving the fix.

### Hotfix 3 — Emergency Access raw-row mapping + maintenance-window crash
- **Symptom:** After hotfix 2, Emergency Access loaded without crashing but rendered raw database fields
  instead of readable audit entries (no "Emergency Login" / "Session Replaced" badges, no formatted actor).
  Separately, the Command Center maintenance-window panel crashed on `affectedServices`.
- **Root cause:** `useBreakGlassAudit` was passing raw Prisma `AuditLog` rows straight to the panel, which
  expects a shaped `BreakGlassAuditEntry`. `useMaintenanceWindows` assumed a shape admin-service doesn't
  send — admin-service returns `scope`/`tenantIds`, not `affectedServices`.
- **Fix:** added `toBreakGlassAuditEntry()` mapping in `apps/frontend/src/hooks/use-break-glass.ts` to
  convert raw `AuditLog` rows to the panel shape (`action` → badge label, actor, timestamp). Defaulted
  `affectedServices` in `use-phase6-data.ts`'s `useMaintenanceWindows` when only `scope`/`tenantIds` are
  present.
- **Test:** updated break-glass audit test to assert on mapped fields (badge text, actor display), new
  maintenance-window test case for the `scope`/`tenantIds`-only response shape.
- **Also this pass:** a 3-agent page shape audit (Sonnet) checked every remaining Command Center screen for
  the same defect class (hook reads a field the backend doesn't send) — found no further **crash** paths.
  It did find several screens still rendering demo/wrong data because of the same class of mismatch — these
  don't crash, so they're deferred to S161b/S163 (list below).

## Commits / PRs / deploy runs

| Commit(s) | What | PR → merge | CI/CD run |
|---|---|---|---|
| `c369aa9` | PR B feat (28 files): hooks converted to throw + `meta.resource`; 9 screens wired to `QueryStateView`; fake tenant table + fake coupons removed; DSAR user-picker load-error hint; tenant plan name resolution order (subscription → login session → `—`) | #45 → `cd4a227` | `36297890539` |
| `e3a8415` | docs: post-deploy update, PR B | direct (docs) | — |
| `859a6d4` | fix: System tab crash (`reading 'total'`) + Plan Builder false empty state | #46 → `1111965` | `36302952387` |
| `9cb8d7a` | docs: post-deploy hotfix 1 + S161b api-unwrap sweep list | direct (docs) | — |
| `ad1a7d9` | fix: Emergency Access crash on successful audit response | #47 → `5489428` | `36305645836` |
| `e82ca15` | docs: post-deploy hotfix 2 | direct (docs) | — |
| `004f23b` + `83aedf7` | fix: Emergency Access raw-row mapping; maintenance-window `affectedServices` crash | #48 → `f012bdc` | `36308018916` |
| `0b126ff` | docs: post-deploy hotfix 3 | direct (docs) | — |

Final production state before this closing session: VPS HEAD `f012bdc`, 32/32 `etip_*` containers healthy,
site + `/health` → 200, all four fixes confirmed present in the live bundle, owner confirmed Emergency
Access renders real audit rows with "Emergency Login" / "Session Replaced" badges.

## Files changed (PR B feature commit, `git diff --stat 370ce75..0b126ff -- apps/frontend`)

28 files changed, 1,667 insertions(+), 1,228 deletions(-). By area:

**New tests:** `plan-builder-no-demo.test.ts`, `use-break-glass-audit.test.ts`, `use-phase5-no-demo.test.ts`,
`use-phase6-no-demo.test.ts`, `users-honest-ui.test.tsx`.
**Deleted:** `plan-builder-prices.test.ts` (guarded the removed `DEMO_PLANS` constant only).
**Modified tests:** `admin-queue-alerts.test.tsx`, `command-center-billing-alerts.test.tsx`,
`command-center-system-routes.test.tsx`, `compliance-reports-panel.test.tsx`, `phase5-pages.test.tsx`.
**Hooks:** `use-break-glass.ts`, `use-phase5-data.ts`, `use-phase6-data.ts`, `use-plan-builder.ts`,
`phase5-demo-data.ts`, `phase6-demo-data.ts` (demo constants trimmed, `withDemoFallback` kept for the
S161b-scoped hooks in these same files).
**Components:** `QuotaWarningBanner.tsx`, `command-center/BillingPlansTab.tsx`,
`command-center/ComplianceReportsPanel.tsx`, `command-center/PipelinePanel.tsx`,
`command-center/PlanBuilderPanel.tsx`, `command-center/SystemTab.tsx`, `command-center/UsersAccessTab.tsx`,
`viz/UserManagementModals.tsx`.
**Pages:** `AdminOpsPage.tsx`, `BillingPage.tsx`, `UserManagementPage.tsx`.

Only `apps/frontend` changed code this session — no backend service, no `packages/*`.

## Decisions

**DECISION-036** (recorded in `docs/DECISIONS_LOG.md`) — Billing ship-honest: PR B merged and deployed even
though tenant `/billing` shows error cards for Plans/Usage and `—` stat tiles until S163 fixes the backend
path/shape mismatches, rather than holding the merge or adding a partial adapter. Same stance as the Users
screens (404 → "Not available yet" until S162).

**Owner note, not a DECISIONS_LOG entry** — owner emails already present in git history (~1,092
author/committer entries plus 5 older docs commits) are not being scrubbed: a history rewrite would break
existing VPS/CI checkouts, and the emails were already public before today's "no emails in new docs" rule.
The rule going forward covers new docs only.

## RCA

**Issue 45** (already recorded in `docs/DEPLOYMENT_RCA.md`, lines ~681 and the session table rows for PR B
and all three hotfixes). Root cause class: removing `?? <demo default>` fallbacks on API errors exposed
frontend types and unwrap logic that never matched what the real backend sends — because tests mocked the
frontend's own assumed shape rather than the real response, and because `api()` already unwraps `{data}` so
a `.then(r => r.data)` after it is always `undefined`. Four distinct crashes were found this way, all fixed
same-day. Prevention rules from Issue 45: one test per converted screen must use the real backend response
shape; never `.then(r => r.data)` (or `r.data`) after `api()` — it is already unwrapped; verify the backend
handler for every field a component dereferences without `?.`.

## Process notes

- Two parallel Sonnet subagents (billing+admin owner / users owner) worked in the same folder with a file
  ownership split to avoid collisions — consistent with the one-folder rule (DECISION-034).
- Opus diff review caught 3 issues before the first push (403 toast gap, null-response gap, fake default
  plan) — none of these were caught by the implementers' own tests, since the tests exercised the happy
  path each hook was written against.
- Post-deploy, the owner's own browser click-through caught the System tab crash — CI and local tests had
  both passed because neither exercised the real `/admin/system/health` response shape.
- Hotfix 2 (PR #47) merged on CI alone (1-line fix + a red/green test proving the fix) without a separate
  `etip-reviewer` pass — judged proportionate given the fix size and the existing regression test.
- The hotfix 3 page-shape audit (3 parallel Sonnet agents, one per screen group) was run specifically to
  check for more crashes of the same class before closing the session — it found none, which is why the
  session is closing now rather than continuing to hotfix 4.

## Verification evidence

```
CI/CD run 36297890539 (PR #45): test/typecheck/lint ✅, build&push ✅, deploy ✅, completed 05:52 UTC
CI/CD run 36302952387 (PR #46): green
CI/CD run 36305645836 (PR #47): green
CI/CD run 36308018916 (PR #48): green
VPS HEAD after PR #48: f012bdc
Containers: 32/32 etip_* healthy (verified directly, not from CI's own report)
https://intelwatch.in/       → 200
https://intelwatch.in/health → 200
Built bundle: PR B demo strings (fake tenants/coupons/users) absent; honest-UI strings present
Owner confirmed live: Emergency Access renders real audit rows, "Emergency Login" / "Session Replaced" badges visible
Frontend tests: 126 files, 1,926 passing, 2 skipped (was 1,858 after PR A)
tsc --noEmit: 0 errors · eslint: 0 errors
```

## Page shape audit results (2026-09-27, 3 agents)

One latent crash found and fixed in PR #48: maintenance windows read `affectedServices`, which admin-service
never sends (Hotfix 3). No other crash paths. The rest is deferred to S161b/S163:

Screens rendering demo/wrong data because a hook checks a field the backend never sends (not a crash, so
not urgent, but each one hides real data from the owner today):

- Command Center Overview stats — hook checks `totalItems`/`itemsConsumed`; customization sends
  `totalItemsProcessed`/`totalConsumed` (`use-command-center.ts:219-224`) → always shows demo numbers.
- Report templates — `type` vs. the real `reportType` field; `sections` are objects, not strings (also
  fix `AlertsReportsTab.tsx:452` at the same time, or it crashes once the shape is corrected).
- Alert rule templates — `conditionType` is actually nested at `rule.condition.type`.
- System → Backups has no backing API at all — 100% fake today.
- Threat Graph calls `/graph/entity/root`, but no node has id `"root"` — always falls to demo; needs a real
  "top nodes" query (S165, `/graph/overview`).
- Correlation + Campaigns read an in-memory worker store that's empty on a fresh process — looks like demo
  data whenever the store hasn't been populated yet.
- Threat Actors + Malware: the list route sends an unwrapped `{data,total}` envelope (total is lost) and
  `useActors`/`useMalware` swallow the resulting error into "none found".
- Admin Ops health tiles stay `—` (same `summary`-shape gap as SystemTab, not yet applied there).
- Analytics `processing-rate` metric is never set → Pipeline Throughput widget always reads 0.
- Queue-stats `bySubtask` is always `{}`.
- Break-glass Details column in the audit table still shows raw JSON (cosmetic, not a crash).
- `QuotaWarningBanner.tsx` is not imported anywhere in the app — dead code; decide wire-vs-delete in S161b.
- `BillingPage.tsx`'s `DEMO_PLAN_PRICES` table (used only for the Upgrade/Downgrade button label) should
  move to real plan data in S163 alongside the other billing fixes.
- `ServiceStatus` frontend type doesn't include `'critical'`, a real value admin-service sends.
- admin-service's `TenantStore` is in-memory (DECISION-013) — "No tenants found" on Subscription
  (super-admin view) is the true answer today, not a bug; fixed properly by Step 3 persistence.
- Super-admin API token is no longer in the local `.env` — use the browser Console fallback if one is
  needed for manual checks.

## Lessons learned / new rules (from RCA #45)

1. One test per converted screen must exercise the **real** backend response shape, not the shape the
   frontend type declares — mocking the frontend's own assumption hides exactly this bug class.
2. Never write `.then(r => r.data)` or read `r.data` after calling `api()` — `api()` already returns the
   unwrapped payload. Use `apiList()` for list endpoints that need `{data, total}`.
3. Before removing a demo/fallback default from a hook, grep the real backend handler for every field the
   component dereferences without `?.` — a mismatch here is exactly what four bugs this session all were.
4. After each such deploy, an owner browser check is still required — CI and unit tests, even with real
   shapes, cannot substitute for a live click-through, since they were what let these ship in the first
   place across many earlier sessions.

## Open items → next sessions

- **S161b** — remaining honest-UI hook files: alerting, reporting, phase4 (DRP/graph/correlation/hunting),
  analytics, global-monitoring, command-center (incl. the Clients demo tenant list), onboarding,
  integration, customization. Also the `api().then(r => r.data)` / `r.data`-after-`api()` bug-class sweep
  (RCA #45): `use-access-reviews.ts:104,165`, `use-compliance-reports.ts:186,249`,
  `use-global-catalog.ts:74,88`, `use-global-iocs.ts:119,132,173,185,197`,
  `use-global-monitoring.ts:109,125,140`, `use-plan-limits.ts:62`, `use-tenant-overrides.ts:66`, plus (no
  `.then` unwrap, consumer `?.` hides it → always 0 rows) `use-enrichment-data.ts:191` (enrichment pending
  queue) and `use-phase4-data.ts:422` (hunting templates), and the `use-phase5-data.ts` customization hooks
  at lines 299–499. Also wire-or-delete `QuotaWarningBanner.tsx`, widen `ServiceStatus` to include
  `'critical'`, and apply the page-shape-audit fixes above where in scope.
- **The owner-scheduled security fix before Step 3** (plan-limits enforcement — no further detail here per
  the public-repo rule).
- **S162** — user-management-service real `/users` list/audit/stats routes.
- **S163** — fix the billing/admin path+shape mismatches PR B surfaced (`docs/S161a_PR_B_HONEST_UI_BILLING_USERS.md`):
  `/billing/plans` price field naming, `/billing/usage` shape, `/billing/subscription` singular vs. the
  real plural route, missing `/billing/stats` and `/admin/stats`; plus `QuotaWarningBanner.tsx` and
  `DEMO_PLAN_PRICES`.
- **S164–S166** — enrichment endpoint, `/graph/overview`, real Clients tenant list.
- Then Step 3 persistence sessions → Step 4 DB role + RLS (security review before push) → Step 10 agent
  foundation → Steps 11–13. SEO 2c/2d and Search Console/Bing verification continue in parallel.

## Rollback

Each PR can be reverted independently on `master` (frontend-only, no backend/schema changes):
`git revert -m 1 cd4a227` (PR #45), `git revert -m 1 1111965` (PR #46), `git revert -m 1 5489428` (PR #47),
`git revert -m 1 f012bdc` (PR #48). To fully roll back to before this session:
`git tag safe-point-2026-09-27-pre-pr-b` is the restore point cut at session start.

## Agent utilization
- Opus: plan, seam checks, diff review (3 pre-push fixes), 4 post-deploy fixes, prod verification, memory — ~600k tokens
- Sonnet: 13 runs — 2 parallel PR B implementers, review-fix tests, 4 doc updates, 2 etip-reviewer passes, 1 api-unwrap crash audit, 3 page shape audits — ~2.0M tokens
- Haiku: 4 runs — session-start digest, hook→screen map, backend shape check, post-deploy VPS/bundle verify — ~321k tokens
- codex:rescue: n/a — frontend-only display/data-shape changes; no auth/security/classifier logic changed
Routing telemetry:
- haiku · session-start docs digest · reworked: N
- haiku · hook→screen consumer map · reworked: N
- sonnet · PR B billing/admin implementation · reworked: Y (Opus review: tenant 403 toast, null responses, fake Free plan; prod: System tab crash — tests mocked frontend types)
- sonnet · PR B users implementation · reworked: Y (Opus added DSAR load-error hint)
- haiku · backend shape verification · reworked: N
- sonnet · review-fix tests · reworked: N
- sonnet · etip-reviewer ×2 · reworked: N
- haiku · post-deploy VPS/bundle verify · reworked: Y (grep quoting false negatives; Opus re-ran)
- sonnet · page shape audits ×3 + unwrap crash audit · reworked: N (found maintenance-window crash)
