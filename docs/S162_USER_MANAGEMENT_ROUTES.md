# S162 — User Management real routes (Users screens stop 404ing)

**Date:** 2026-09-27 · **Branch:** `s162/user-management-routes` · **Module:** user-management-service + frontend

## Summary
DECISION-036 (S161a PR B) shipped the User Management screens "honest" — error cards instead of fake demo
data — because the backend had no directory/stats/audit routes for them, only a 404. This session adds those
routes and wires the frontend hooks/modals to the real shapes, so the screens render real data instead of
error cards.

## Backend (`apps/user-management-service`)
New `src/routes/directory.ts`, registered last in `app.ts` under the `/api/v1/users` prefix (checked for path
collisions with the existing router — none):

- **`GET /api/v1/users`** — paginated list from Prisma `User`: `id, name, email, role, team: null,
  status (derived: locked/invited/active from active + lastLoginAt), lastLogin, mfaEnabled, createdAt`.
  Filters: `role` (enum `super_admin | tenant_admin | analyst`), `status`, `search`. `page`/`limit` (≤ 500).
- **`GET /api/v1/users/stats`** — `{ totalUsers, activeSessions, teams: 0, roles: 0, mfaPercent }`.
- **`GET /api/v1/users/audit`** — Prisma `AuditLog`, filterable by `action`, newest first:
  `id, timestamp, userName, action, resource, ip, details`.

Tenant scoping: tenant comes only from `x-tenant-id` (nginx overwrites it from the verified JWT via
`service-auth.inc`) — missing header → 401, never defaults to `'default'`.

Role gate via `hasPermission`: `user:read` (list, stats) and `audit:read` (audit) → `tenant_admin` +
`super_admin`; `analyst` → 403.

Explicit Prisma `select` on every query — no secret columns (password hash, MFA secret, etc.) ever leave the
service.

Validation: `UserDirectoryQuerySchema` + `DirectoryAuditQuerySchema` (Zod) in
`src/schemas/user-management.ts`, with a local `safeParse` → `AppError 400` helper — GET-query `ZodError`s in
this service currently fall through to the generic error handler and surface as 500 (pre-existing bug, also
present on `teams.ts`; not fixed here, see Follow-ups).

**Tests:** `apps/user-management-service/tests/directory-routes.test.ts` — 21 new tests: response shape,
tenant scoping (no cross-tenant leakage), 401 on missing tenant header, 403 for `analyst`, 400 on bad `limit`
and unknown `role`, pagination, status derivation (locked/invited/active), route-order regression (new routes
don't shadow existing `/:id` routes). Service suite: 360 tests, all green.

## Frontend (`apps/frontend`)
- **`useSessions`** — now calls the real Prisma-backed `GET /auth/sessions`, which returns only the *current
  user's* sessions (not tenant-wide) — the hook and `UsersAccessTab` label this "Your active sessions". Single
  revoke wired to `DELETE /auth/sessions/:id`. Bulk "Revoke all" button hidden — no gateway route exists for
  it.
- **`useRoles`** — static, read-only list of the 3 real roles (`super_admin`, `tenant_admin`, `analyst`), no
  network call — custom/dynamic roles were never enforced anywhere in the backend.
- **Hidden until a real backend exists:** Teams tab + "Create Team" (no `Team` Prisma model — `team` is
  always `null` from the new list route), Invite user (both `UserManagementPage` and the Command Center Users
  tab — the tab's invite modal was previously a no-op that didn't call anything), Create Role, pending-invite
  Resend/Revoke buttons (no-ops before, now removed rather than left dead).
- **Removed dead hooks + their modals:** `useTeams`, `useInviteUser`, `useCreateTeam`, `useCreateRole`,
  `useRevokeAllSessions`. `UserManagementModals.tsx` shrank 327 → 137 lines.
- **Fixed:** `ROLE_COLORS` maps that referenced roles which never existed in the backend enum.
- Existing tests (`phase5-pages.test.tsx`, `use-phase5-no-demo.test.ts`, `users-access-tab.test.tsx`,
  `users-honest-ui.test.tsx`) updated to mock the real backend response shapes.

## Security review
`codex:rescue` companion MCP was stale this session (per the pre-flight liveness check) — used the Sonnet
adversarial-takeover fallback instead. **Verdict: ACCEPT.** No cross-tenant read path found: every route to
this service goes through nginx `auth_request` + header overwrite (fails closed on a missing/invalid token —
confirmed by the 401 test), and the service itself never trusts a client-supplied tenant id.

**Follow-ups (not blockers):**
1. Add field redaction inside the shared `AuditLogger.log()` so an audit `changes` payload can never carry a
   secret value — none do today, but nothing structurally prevents it later.
2. GET-query `ZodError` → 500 in `user-management-service`'s error handler (pre-existing, also affects
   `teams.ts`) — should be a 400.
3. `AuditLog.user` relation is unscoped at the schema level (writers are always same-tenant today, but the
   relation itself doesn't enforce it).

## Spec deviations
- Sessions list is current-user-only, not tenant-wide — a tenant-wide admin session list needs a new
  api-gateway route, and the gateway is frozen (Tier 1, `PROJECT_STATE.md`).
- Teams and Roles are not new backend routes — there is no `Team` Prisma model and `Role` is a fixed enum, not
  a table. Per `STEP_05_HONEST_UI.md` §12, this is intentional: don't scaffold a resource that doesn't exist
  in the data model just to satisfy a UI tab.

## How to verify after deploy (owner, FRESH browser tab, as `tenant_admin`)
- `/users` — list shows real users, stats tiles show real numbers.
- Audit tab — real audit rows.
- Sessions tab — shows your own sessions, revoke one works.
- Command Center → Users & Access → Team — shows real members, no Invite button.
- As `analyst` — error card (403), not a crash.
- Check all of the above at 375px width (`feedback_mobile_first.md`).

## Rollback
`git revert` the S162 merge commit. No schema migration in this change (no new Prisma models — the directory
routes read the existing `User` and `AuditLog` tables), so no rollback data risk.

## Files touched
```
M  apps/frontend/src/__tests__/phase5-pages.test.tsx
M  apps/frontend/src/__tests__/use-phase5-no-demo.test.ts
M  apps/frontend/src/__tests__/users-access-tab.test.tsx
M  apps/frontend/src/__tests__/users-honest-ui.test.tsx
M  apps/frontend/src/components/command-center/UsersAccessTab.tsx
M  apps/frontend/src/components/viz/UserManagementModals.tsx
M  apps/frontend/src/hooks/use-phase5-data.ts
M  apps/frontend/src/pages/UserManagementPage.tsx
M  apps/user-management-service/src/app.ts
M  apps/user-management-service/src/schemas/user-management.ts
?? apps/user-management-service/src/routes/directory.ts
?? apps/user-management-service/tests/directory-routes.test.ts
```

## Follow-up (2026-09-28): Roles & Permissions tab shows the real roles

Command Center → Users & Access → **Roles & Permissions** showed a hardcoded matrix with two roles that
don't exist (Lead, Manager), invented permission columns, and a "Custom roles … on the Enterprise plan"
upsell (custom roles are not supported on any plan).

- `apps/frontend/src/components/command-center/UsersAccessTab.tsx` — matrix now lists only the 3 Prisma
  roles (analyst, tenant_admin, super_admin) with capabilities grouped from
  `packages/shared-auth/src/permissions.ts` `ROLE_PERMISSIONS` (analyst: feeds view-only, no user/settings
  admin, no audit; tenant_admin: everything in its tenant, audit view-only; super_admin: everything incl.
  all tenants). Static copy — keep in sync with shared-auth. Upsell banner removed; unused `useRoles()`
  call dropped.
- `apps/frontend/src/__tests__/users-access-tab.test.tsx` — 2 banner tests replaced by: exactly 3 roles,
  no Lead/Manager, no upsell; analyst row matches shared-auth.
- Verify: Command Center → Users & Access → Roles & Permissions shows 3 rows; analyst row has "View only"
  under Feeds and ✗ under Users/Integrations/Settings, Audit Log, All Tenants.
- Rollback: `git revert` the commit.
- Still demo on the same tab (not fixed yet): **Integrations** sub-tab cards (hardcoded Splunk/XSOAR "connected").
