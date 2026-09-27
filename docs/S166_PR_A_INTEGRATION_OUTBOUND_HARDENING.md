# S166 PR A — Integration service outbound hardening + encrypted credentials

**Date:** 2026-09-28 · **Branch:** `s166/integration-ssrf-guard` · **Module:** `apps/integration-service` only · **Roadmap:** Step 15 Phase 1 (`docs/roadmap/STEP_15_SIEM_INTEGRATIONS.md`)

## Why
Step 15 Phase 1 makes SIEM/webhook/ticketing connectors real and easy to set up. Before exposing that to tenants,
every outbound call the integration service makes to a tenant-configured destination goes through one hardened
client, and connector credentials are encrypted at rest.

## What changed
| Area | Change | Files |
|---|---|---|
| Outbound client | New `safeFetch()` (Node stdlib only, no new dependency). Destination policy: http/https only, no URL credentials, publicly routable addresses only (IPv4 + IPv6 special-use ranges incl. mapped/compat/NAT64/6to4 forms), validated at connect time inside the socket's DNS lookup so the address connected to is the address checked. No redirect following, idle timeout + total deadline (default 10 s), 1 MB response cap. | `src/utils/safe-fetch.ts` |
| Call sites | All 11 outbound calls (Splunk HEC, Sentinel, Elastic, ServiceNow, Jira, webhooks, webhook retries) use `safeFetch`. | `src/services/siem-adapter.ts`, `ticketing-service.ts`, `webhook-service.ts`, `webhook-retry.ts` |
| Save-time validation | Create/update reject non-http(s) URLs, `localhost`/`.local`/`.internal` names and non-public IP literals ("Destination must be a publicly reachable address"); reject values carrying the reserved ciphertext prefix. | `src/schemas/integration.ts` |
| Dev escape hatch | `TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS` (default false) for local dev/tests; the service refuses to boot in production if it is true. | `src/config.ts` |
| Credentials at rest | Secret fields (tokens, shared keys, API keys, `credentials{}`) encrypted with the existing AES-256-GCM `CredentialEncryption` (`enc:v1:` marker, idempotent) on create/update; decrypted only internally; API responses stay masked. | `src/services/credential-encryption.ts`, `integration-store.ts`, `utils/secret-mask.ts`, `index.ts` |
| Diagnostics | Test-connection message and stored delivery logs keep at most 300 chars of the remote response body. | `siem-adapter.ts`, `webhook-service.ts` |
| Error handler | `errorHandlerPlugin` now applied to the root instance (it was registered inside its own Fastify encapsulation scope, so validation/AppError responses fell back to generic 500s). Clients now get proper 400/404 codes and `{error:{code,message}}`. | `src/app.ts` |

## Tests
430 integration-service tests pass (new `tests/safe-fetch.test.ts` 81 cases: address matrix, URL normalisation, rebinding via mocked DNS, Node 20 `all:true` lookup shape, real local server with hatch on/off, redirects, idle + trickle deadline, body cap; plus store encryption round-trips and route 400s). `pnpm -r run typecheck` and `pnpm -r run lint` exit 0 (RCA #46 rule).

## Review
- Opus diff review: found and fixed a Node 20 `autoSelectFamily` lookup-shape bug that would have failed every real connection, and a 6to4 range gap.
- Adversarial review (codex companion stale → Sonnet takeover): **ACCEPT**; its hardening items (IPv4-compatible IPv6 form, total deadline, response-body cap in test results, reserved-prefix rejection) applied in this PR.

## Behaviour change for tenants
- Connectors pointing at private/internal addresses are rejected on save and refused at send time.
- Integration configs are still in memory in this PR (lost on redeploy) — persistence is PR B (approved).

## Verify after deploy
1. Command Center → Users & Access → Integrations → add a webhook to a public test endpoint (e.g. a webhook.site URL) → **Test connection** → success.
2. Add a webhook to `http://127.0.0.1:6379/` → save is rejected with "Destination must be a publicly reachable address".
3. `docker logs etip_integration` shows no startup error.

## Rollback
`git revert` the PR A commit; no schema or env changes required (the new env var defaults to false).

## Follow-ups
- PR B: `Integration` table (persistence) — owner approved 2026-09-28.
- PR C: easy-connect UI (TAXII card + real connectors), remove non-existent QRadar/XSOAR cards, fix hook paths.
- `src/schemas/integration.ts` is 600+ lines (pre-existing) — split in Step 6 cleanup.
