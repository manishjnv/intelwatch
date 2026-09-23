# S147 — App wiring fixes and follow-ups (after the owner's click-through)

**Date:** 2026-09-23. **Source:** the owner's screenshots, cross-checked against live nginx and service logs.

The UI **silently falls back to demo data** when an API call fails. After the S147 security change, logged-in calls return 200, so authentication works. The "Demo data" banners, empty lists and fake plan and user data came from older wiring bugs.

## Fixed and deployed
| PR | Fix | Evidence |
|---|---|---|
| #26 | drp-service never called `loadJwtConfig`, so every DRP request returned 500 "JWT not configured" | 0 such errors since deploy |
| #26 | billing and customization had no `TI_DATABASE_URL`. Billing ran in memory only; Command Center tenant-stats returned 500 | Prisma `SELECT 1` ok in customization; 0 DB errors |
| #27 | Billing & Plans showed a demo "Teams ₹18,999 annual" plan. The new gateway `GET /api/v1/billing/subscription` returns the tenant's real plan. nginx routes `billing/(limits\|subscription)` to the gateway | Anonymous requests get the gateway's JSON 401 (the route resolves) |
| #27 | `useFeatureLimits` double-unwrapped `.data`, so FeatureGate always used demo limits | Unit-tested |
| #27 | IOC detail pivot/timeline called `/iocs/:id/...` (normalization, 404). Now `/ioc/:id/...` (ioc-intelligence), with shape adapters | Adapter tests |
| #28 | `api()` unwraps `{data}`, so list hooks reading `.data` on single-envelope services got `undefined` (for example "No vulnerabilities found"). `apiList()` normalises all three envelopes; 32 hooks switched | 116 frontend test files green |
| #28 | SSO: `/settings/sso` → `/users/sso` (PUT to `/users/sso/{saml\|oidc}`). Ticketing list: `/integrations?type=ticketing` | — |
| #29 | `POST /api/v1/search/reindex` is super-admin only; it took the tenant from the request body | nginx `-t` ok |

## Follow-up A: search (⌘K) returns nothing. Design, not yet built.
**Facts (2026-09-23):** the ES indices `etip_<tenant>_iocs` hold **0 docs**, and the S132 per-type indices don't exist. The database has 5,934 IOCs.
1. The only producer of `QUEUES.IOC_INDEX` is the ai-enrichment worker, which runs *after* enrichment. Enrichment is idle ("Enriched today 0"; AI is off by default), so nothing gets indexed.
2. Even when it runs, that job sends flat fields and no `payload`. The es-indexing worker's `index` action needs `payload: IocDocument`, so the job would fail.

**Proposed fix (one module per PR):**
- (a) **normalization:** after an IOC upsert, enqueue `IOC_INDEX {action:'index', iocId, tenantId, payload: IocDocument}` built from the stored row (value, type, severity, confidence, tags, first/last seen, TLP). Use the deterministic jobId `ioc-index-<id>`. It must respect DECISION-029: global OSINT IOCs reach tenants through overlays, so decide explicitly whether global IOCs are indexed per subscribed tenant or into one global index filtered by subscription. **This decision comes first.**
- (b) **ai-enrichment:** send `action:'update'` with `payload: {severity, confidence, enriched:true, ...}` instead of an incomplete `index`.
- (c) **es-indexing:** `update` on a missing doc should upsert, or log and skip.
- (d) **One-time backfill:** a super-admin job that pages IOCs per tenant through the normalization API and posts them to `/api/v1/search/reindex`. Run it once and verify the doc counts match.

## Follow-up B: stop showing fake data as real
Demo fallback is fine for brand-new, empty tenants. But when an API **fails**, pages should say so ("Couldn't load — Retry") rather than show invented users, plans and costs. Replace `withDemoFallback(..., demo)` on error paths with an error state, keeping demo data only when the API succeeds with zero rows *and* the tenant is new. Candidates: Command Center Overview, Users & Access, Alerts & Reports, DRP.

## Follow-up C: backend endpoints the UI calls that don't exist
| UI call | Situation |
|---|---|
| `GET /api/v1/users` (team member list) | user-management-service has no list route. The Users tab shows demo members |
| `GET /api/v1/enrichment/ioc/:id` | No enrichment-result-by-IOC route; the only match is `/enrichment/cost/ioc/:id` |
| `GET /api/v1/graph/entity/root` (graph overview) | No overview endpoint; `entity/:id` needs a real node id |
| `/api/v1/settings/mfa/enforcement` | Backend has `/users/mfa/policy`, not "enforcement" |
| `/users/teams`, `/users/roles`, `/users/audit`, `/users/stats` | Backend has `/team` (singular) and `/sessions`; no audit or stats |
| `/customization/ai/global` | Path OK; response shape `{config, recommendations, costEstimate}` doesn't match the UI's `{subtasks, confidenceModel, activePlan}`. Gated by `TI_GLOBAL_PROCESSING_ENABLED` and super admin |
| Ticketing create (`POST /integrations/ticketing`) | Needs `POST /integrations` with the right `type` |
| Command Center → Clients | admin-service in-memory registry (DECISION-013), not real tenants |

## Other notes
- The app connects to Postgres as `etip_user`, which is a **superuser with BYPASSRLS**. That works, but it defeats RLS as a safety net. Plan a least-privilege app role.
- A CI/CD deploy can fail with `websocket: bad handshake` (Cloudflare tunnel SSH). Re-running the failed job succeeds (seen on PR #27).
