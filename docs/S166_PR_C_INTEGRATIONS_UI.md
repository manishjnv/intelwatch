# S166 PR C — Real, easy-connect Integrations tab

**Date:** 2026-09-28 · **Branch:** `s166/integrations-ui` · **Module:** frontend only · **Roadmap:** Step 15 Phase 1 (`docs/roadmap/STEP_15_SIEM_INTEGRATIONS.md` §4/§6, `STEP_15_ARCHITECTURE_UI.md` §9b screen 6)

## Why
Command Center → Users & Access → **Integrations** showed hardcoded cards claiming Splunk and Cortex XSOAR were "connected"
(QRadar/XSOAR connectors don't even exist in the backend), and its hooks called non-existent paths. Tenants had no real way to connect a SIEM.

## What the tenant admin now gets
| Section | Behaviour |
|---|---|
| **Your TAXII feed** | Real discovery URL `{origin}/api/v1/public/taxii/discovery` with Copy; auth line (`X-API-Key`, scope `ioc:read`); plain-text list of SIEMs/TIPs that can pull it. No API-key link yet (see gap below). |
| **Connected** | Real connectors from `GET /api/v1/integrations`: name, type, enable/disable toggle (PUT), last used, health badge from `/integrations/health/dashboard` (no badge if unavailable — never a fake "healthy"), Test / Edit / Delete (confirm dialog). Loading, empty ("No connections yet" + Add connection) and error states via QueryStateView. |
| **Add connection** wizard | Step 1 pick type (Splunk HEC, Microsoft Sentinel, Elastic, Webhook; ServiceNow/Jira under Ticketing) → Step 2 only the 2–4 fields that type needs, each with where-to-find-it help text, trigger checkboxes (default alert.created + ioc.created) → Step 3 **Test connection** (mandatory; server message shown verbatim) → Save. Private/internal URLs are rejected inline on the URL field (server rule from PR A). Full-screen sheet under 768 px, focus trap, Escape to cancel. |
| Plan limit | "X of Y used" from `data/plans.ts`; Add disabled at the limit with an upgrade link (UI only — server-side enforcement is a known open gap). |

**How Test works:** the backend has no dry-run endpoint (`POST /:id/test` needs a saved row), so Test creates (or updates) the
connector first, then tests it. Cancelling a new connector before a successful test deletes the draft (Cancel button and Escape).
Editing: Test applies the edit immediately.

## Files
`hooks/use-integrations.ts` (new — correct paths, api()/apiList(), throw + meta.resource), `components/command-center/integrations/`
`{TaxiiFeedCard,ConnectionList,AddConnectionWizard}.tsx` + `connector-types.ts` (new), `UsersAccessTab.tsx` (IntegrationsPanel rebuilt,
`DEMO_INTEGRATION_CARDS` removed), tests `__tests__/integrations-panel.test.tsx` (14, real backend shapes) + `users-access-tab.test.tsx`.
The old broken hooks in `use-phase5-data.ts` remain only because the legacy `pages/IntegrationPage.tsx` (not routed — `/integrations`
redirects to Command Center) still imports them.

## Review
- Opus review found the Escape key used a stale cancel handler (registered once), so Escape after a failed test left a phantom
  untested connector; fixed with a ref + regression test (verified red without the fix, green with it).

## Gap needing a follow-up (backend exists, no UI)
Tenants cannot create a public API key anywhere in the UI, so the TAXII card can't link to one. Backend is ready:
`POST/GET/DELETE /api/v1/users/api-keys` (user-management-service, gated by the `api_access` plan feature). Follow-up: an
"API keys" panel in Users & Access.

## Verify after deploy (fresh tab, tenant admin)
1. Integrations shows the TAXII card and "No connections yet" (or real rows) — no Splunk/XSOAR "connected" cards.
2. Add connection → Webhook → a public test endpoint (e.g. a webhook.site URL) → Test connection → success → Save → row appears.
3. Redeploy or restart `etip_integration` → the row is still there (PR B persistence).
4. Add connection → Webhook → `http://127.0.0.1:6379/` → inline "Destination must be a publicly reachable address".
5. Toggle enable, Delete via confirm; check at 375 px.

## Rollback
`git revert` the PR C commit (frontend only).
