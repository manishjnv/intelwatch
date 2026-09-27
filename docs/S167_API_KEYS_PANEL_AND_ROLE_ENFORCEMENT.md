# S167 — API keys panel + server-side role enforcement for integrations and API keys

**Date:** 2026-09-28 · **Branch:** `s167/api-keys-panel` · **Modules:** frontend, integration-service, user-management-service (api-keys route only) · **Roadmap:** Step 15 Phase 1 follow-up

## 1. API keys panel (frontend)
Tenants need a public API key for the TAXII 2.1 feed (`/api/v1/public/taxii/discovery`, header `X-API-Key`) and the public REST API; there was no UI to create one.
- New **Users & Access → API keys** pill (tenant admin + super admin): list (name, 12-char prefix only, scopes, created, last used, expires), **Create API key** (name, scopes `ioc:read` default / `feed:read` / `webhook:manage` with one-line explanations, expiry 30/90/365 days or never) — the raw key is shown **once** with Copy and cleared when the dialog closes; **Revoke** via confirm dialog. Wrapped in `FeatureGate feature="api_access"`.
- TAXII feed card now has a **Create an API key** button that switches to the API keys pill.
- Verified compatible end to end: keys created by `POST /api/v1/users/api-keys` (user-management-service) are stored in the same table, hashed with the same `@etip/shared-auth` bcrypt pair and looked up by the same 12-char prefix that the api-gateway `X-API-Key` plugin uses.
- Files: `hooks/use-api-keys.ts`, `components/command-center/ApiKeysPanel.tsx`, `UsersAccessTab.tsx`, `integrations/TaxiiFeedCard.tsx`, tests `api-keys-panel.test.tsx`, `users-access-tab.test.tsx`.

## 2. Server-side role enforcement
The UI already hid integration setup and API keys from analysts; the backend now enforces it too.
- integration-service: new `src/plugins/authz.ts` `requirePermission()` (fails closed on missing/unknown role) applied to every authenticated route in `integrations.ts`, `webhooks.ts`, `export.ts`, `advanced.ts`, `p2-routes.ts`: reads → `integration:read`, creates → `integration:create`, changes / tests / pushes / exports / retries / rotations → `integration:update`, deletes → `integration:delete`. Ticket routes (`POST/GET /tickets`, `POST /tickets/:id/sync`) use `alert:create/read/update` because raising a ticket into the admin-configured ticketing integration is analyst work. TAXII discovery stays unauthenticated by design.
- user-management-service `routes/api-keys.ts`: create/revoke → `settings:update`, list → `settings:read` (role from the nginx-set `x-user-role`); missing tenant header → 401; role/tenant checks run before the plan check.
- Effect: analysts get 403 on integration configuration and API key management; tenant admins and super admins unchanged.

## Tests / gates
integration-service 455, user-management-service 371, frontend 1,969 — all pass; package and `pnpm -r run typecheck` / `pnpm -r run lint` exit 0.

## Verify after deploy
1. Tenant admin: Users & Access → API keys → Create API key (ioc:read) → copy key → `curl -H "X-API-Key: <key>" https://intelwatch.in/api/v1/public/taxii/discovery` → 200.
2. Revoke it → same curl → 401.
3. Analyst account (none exists yet in prod) — covered by tests: analyst → 403 on `/api/v1/integrations` and `/api/v1/users/api-keys`.

## Follow-ups
- Correlation page "Create ticket" (`use-phase4-data.ts useCreateTicket`) sends no `integrationId`, which `POST /integrations/tickets` requires — pre-existing 400; needs a ticketing-integration picker.
- `POST /routing-rules/:id/dry-run` classified as read (pure evaluation, no send).

## Rollback
`git revert` the two S167 commits (no schema/env changes).

## Deployed

**Date:** 2026-09-28 · Master `1790380` (role enforcement) + `f426026` (API keys panel) · CI/CD run 36349837126 green.

- VPS HEAD `f426026`, 32/32 containers healthy.
- No error logs in `etip_integration` / `etip_user_management`.
- Frontend bundle `index-C1OKlfIM.js`.
- Verified live: TAXII discovery and `/api/v1/integrations` both return 401 without credentials.
- Tests: integration-service 455, user-management-service 371, frontend 1,969.
- RCA: `docs/DEPLOYMENT_RCA.md` Issue 48 (server-side role enforcement gap — found during this build, not an incident).
