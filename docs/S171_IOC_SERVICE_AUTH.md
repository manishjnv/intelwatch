# S171 PR 2 — ioc-intelligence: read-only service-to-service access

**Date:** 2026-09-28 · **Session:** 171 · **Module:** ioc-intelligence (+ one nginx block, one compose env var) · **Part of:** Threat Graph permanent fix (`docs/S171_GRAPH_FIXES.md`)

## Why
The threat graph must be built from the real IOC records (value, type, severity, confidence, threat actors, malware families, MITRE techniques, feed) and kept in sync across tenants. Project rule: no cross-module DB queries — call the owning service's API with a short-lived service JWT (`@etip/shared-auth`). Until now ioc-intelligence only accepted **user** access tokens, and the tenant came only from the user token, so no internal service could read IOCs.

## What changed
- `src/plugins/auth.ts`
  - `authenticateService` — requires `x-service-token` (60 s service JWT). Checks signature/expiry, **audience = `ioc-intelligence`**, **issuer ∈ `TI_IOC_SERVICE_CALLERS`** (default `threat-graph`), and a UUID `x-tenant-id`. Duplicate headers are rejected. Attaches `req.serviceCaller`; never sets `req.user`, so every `rbac()`/`getUser()` route stays unreachable with a service token.
  - `authenticateServiceNoTenant` — same checks without the tenant header, for the one cross-tenant route.
  - `authenticateUserOrService` — service path if `x-service-token` is present (no fallback to user auth on failure); otherwise the existing user auth, unchanged.
  - `getTenantId(req)` — user tenant, else service-caller tenant.
- `src/routes/iocs.ts` (mounted at `/api/v1/ioc`)
  - `GET /` and `GET /:id` accept user **or** service callers. All write, export, search, bulk, stats and other routes are unchanged (user-only).
  - New `GET /internal/tenants` (service-only): `[{ tenantId, iocCount, lastUpdatedAt }]` for reconciliation.
- `src/schemas/ioc.ts` + `src/repository.ts`: list accepts `updatedSince` (ISO datetime → `updatedAt >= …`) and `sort=updatedAt`; list ordering now has an `id` tie-breaker (bulk inserts share timestamps — offset pages could otherwise skip or repeat rows).
- `src/repository-aggregates.ts` (new): per-feed stats + per-tenant counts moved out of `repository.ts` (400-line limit; behaviour unchanged).
- `docker/nginx/conf.d/default.conf`: `location ^~ /api/v1/ioc/internal/ { return 404; }` — internal route never reachable from the internet (internal callers use the Docker network directly).
- `docker-compose.etip.yml`: `TI_IOC_SERVICE_CALLERS` (default `threat-graph`) on `etip_ioc_intelligence`.

## Tests
172 passed (new `tests/service-auth.test.ts` — 21 cases with real signed tokens: tenant scoping, wrong audience/issuer, expired/garbage tokens, bad tenant header, service token rejected on every write/export route, no fallback to user auth, internal route rejects users; new `tests/repository-list-order.test.ts` — tie-breaker, `updatedSince`, tenant summary). tsc/eslint 0 errors.

## Security review
Opus line-by-line diff review + Codex adversarial review (2026-09-28): **accept** — no cross-tenant path for user tokens, service tokens read-only, JWT algorithm/claim handling sound, nginx block correctly precedenced.

## Verify after deploy
- `curl -s -o /dev/null -w "%{http_code}" https://intelwatch.in/api/v1/ioc/internal/tenants` → 404.
- User flows unchanged: IOC list/detail pages load.

## Rollback
`git revert <commit>` — no data change. Nothing calls the new paths until the threat-graph PR ships.
