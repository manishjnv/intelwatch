# Session 171 — Summary (2026-09-28)

**Owner direction this session:** "no quick fixes — permanent, robust, enterprise-grade; follow recommendations/best practice."

Master `04ea04d` = origin/master. VPS HEAD `04ea04d`, 32/32 `etip_` containers healthy. Real test total (Step 0, `pnpm -r --no-bail test`): **9,145 passed + 2 skipped (9,147)**, was 9,030 + 2.

## Goals

1. Fix the Threat Graph permanently (previous fixes were frontend-only workarounds).
2. Clean up dead scaffold folders (Step 6 PR 1).
3. Remove decommissioned `ti.intelwatch.in` config.
4. Resolve outstanding owner decisions blocking Step 15 Phase 2 and AI enrichment.

## PRs

### #51 — Step 6 PR 1: remove empty scaffold folders + scripts
Commit `27c5ae2` → merge `4874864`. Removed 10 empty `apps/*` scaffold folders (real code lives under the `*-service` names), `scripts/scaffold.js`, `scripts/init-modules.js`, the root `"scaffold"` script, and 28 `.gitkeep` files. Added a **Folder** column to `docs/PROJECT_STATE.md`'s module table. No code change, no deploy impact — CI green, tests unaffected. Detail: `docs/S171_STEP6_CLEANUP.md`.

### #52 — ioc-intelligence: read-only service-to-service access
Commit `f0fd669` → merge `a451d4c`. Built as a prerequisite for the graph fix (#53) — the project rule against cross-module DB queries means threat-graph must read IOCs through ioc-intelligence's own API, not Postgres directly.
- `plugins/auth.ts`: `authenticateService` (60s service JWT — audience `ioc-intelligence`, issuer allowlisted via `TI_IOC_SERVICE_CALLERS`, default `threat-graph`; UUID `x-tenant-id`; duplicate headers rejected; never sets `req.user`), `authenticateServiceNoTenant`, `authenticateUserOrService` (service path if `x-service-token` present, no fallback to user auth), `getTenantId()`.
- `routes/iocs.ts`: `GET /` and `GET /:id` now accept user **or** service callers; every write/export/search/bulk route stays user-only. New service-only `GET /internal/tenants` → `[{tenantId, iocCount, lastUpdatedAt}]`.
- `schemas/ioc.ts` + `repository.ts`: list accepts `updatedSince` + `sort=updatedAt`, with an `id` tie-breaker (bulk inserts share timestamps — prevents skipped/repeated rows on paged reconciliation).
- `repository-aggregates.ts` (new): per-feed stats + per-tenant counts split out of `repository.ts` for the 400-line limit.
- nginx: `location ^~ /api/v1/ioc/internal/ { return 404; }` — internal route reachable only over the Docker network.
- `docker-compose.etip.yml`: `TI_IOC_SERVICE_CALLERS` env var on `etip_ioc_intelligence`.

**Tests:** 172 passed (new `tests/service-auth.test.ts` — 21 cases with real signed tokens covering tenant scoping, wrong audience/issuer, expired/garbage tokens, bad tenant header, service token rejected on every write/export route, no fallback to user auth, internal route rejects users; new `tests/repository-list-order.test.ts`). tsc/eslint 0 errors.

**Review:** Opus line-by-line diff review + Codex adversarial review — **accept** (no cross-tenant path for user tokens, service tokens read-only, JWT claim handling sound, nginx block correctly precedenced).

**Verified live:** internal call from threat-graph → 200 (2 tenants, 6,090 + 6,081 IOCs); public internal path → 404. Detail: `docs/S171_IOC_SERVICE_AUTH.md`.

### #53 — Threat Graph: permanent real-data fix (RCA #52)
Commits `1ad0a6b` + `125677f` → merge `feacbae`. **GitHub dropped the push event on this merge** — deployed via manual `workflow_dispatch` run 36394473063 (success), noted so the next session doesn't assume push-triggered deploy always fires.

**Problem (production before this fix):** Neo4j held ~2,500 nodes and **0 relationships**; node labels were the raw lowercase IOC type (`cve`, `domain`, `url`, `hash_*`, `email`, `ip`) with no value and no risk; `GET /graph/stats` returned 500 on every call. Root cause: the only graph writer (ai-enrichment) sent the IOC type as the node label plus enrichment fields only, never created relationships, and nothing reconciled the graph against Postgres — which held 12,171 IOCs (870 with threat actors, 442 with malware families, 1,294 with MITRE techniques) that the graph never showed.

**Design (DECISION-044):** threat-graph is a derived store, reconciled from the ioc-intelligence API (source of truth), not a direct DB reader and not a payload-trust consumer.
- `clients/ioc-client.ts` — service JWT client (15s timeout, no redirects, response validation, tenant-match check).
- `services/ioc-graph-mapper.ts` — pure mapping to a STIX 2.1-aligned model: non-CVE IOCs → `(:IOC)`, CVE-type IOCs → `(:Vulnerability)`, `threatActors[]`/`malwareFamilies[]`/valid `mitreAttack[]` → `(:ThreatActor)`/`(:Malware)`/`(:AttackPattern)` nodes with `INDICATES`/`USES`/`EXPLOITS` edges per the co-listing rules in `docs/S171_GRAPH_FIXES.md`. Entity ids are deterministic UUIDv5 of (tenant, type, normalized name) — the same actor across many IOCs is one node per tenant.
- `services/graph-sync.ts` — one write transaction per page, UNWIND batches; sync owns `baseRiskScore` and only ever raises `riskScore` (propagation/decay keep owning further changes); prunes only its own `origin='ioc-sync'` edges, never analyst-confirmed ones.
- `services/graph-reconciler.ts` — 15-minute incremental reconciliation (5-minute overlap watermark) + daily full sweep; per-tenant leases renewed per page; deletion sweep only fires once ≥90% of the source was successfully applied (guards against a partial-fetch wiping good data).
- `services/ioc-sync-service.ts` + queue action `sync_ioc` (the legacy `upsert_node` path with a raw IOC type is now rerouted through the mapper instead of writing garbage labels directly).
- `cypher-safety.ts` — every interpolated Cypher label/relationship type checked against the schema allowlist.
- `schemas/graph.ts` — `AttackPattern` node type added; relationship rules extended per STIX.
- `migrations/` — versioned, idempotent migrations with markers: `001` relabels legacy lowercase IOC-type nodes to `IOC`/`Vulnerability` (allowlisted types only); `002` adds `(id, tenantId)` uniqueness constraints (index fallback) + tenant indexes.
- Stats query fix: the reserved Cypher name `all` (a Neo4j 5 built-in function) is no longer used as a variable — this is what made `/graph/stats` 500 on every call.
- Admin routes: `GET /api/v1/graph/sync/status`, `POST /api/v1/graph/sync/run` (`graph:admin`, caller's own tenant only).
- Config (`docker-compose.etip.yml` → `etip_threat_graph`): `TI_IOC_SERVICE_URL`, `TI_GRAPH_RECONCILE_ENABLED`, `TI_GRAPH_RECONCILE_INTERVAL_MS`, `TI_GRAPH_FULL_SYNC_INTERVAL_MS`, `TI_GRAPH_RECONCILE_PAGE_SIZE`.

**Review:** Opus line-by-line diff review (added sweep-coverage guard, orphan-entity cleanup, targeted entity rollup, UUID check on queue-supplied ids, no BFS propagation on sync events — hub actors link hundreds of IOCs) + Codex adversarial review → **revisions applied** (coverage counts applied records only, paging on raw page size, tenant-scoped prune endpoints, per-tenant renewable leases, service-URL validation + no redirects) → **accept**.

**Deploy order:** PR #52 (ioc-intelligence) before this PR — until then the reconciler's calls simply fail and retry next interval, no bad graph data.

**Verified live (production, after deploy):**
- `docker logs etip_threat_graph` → `Graph migration applied` (001, 002) once each; `Graph reconcile tenant run complete` with non-zero `nodesUpserted`/`edgesMerged`; no `Unhandled error`.
- First reconcile, both tenants: ok=2 failed=0, ~50 seconds each.
- Neo4j counts: **IOC 7,599 + Vulnerability 4,572 = 12,171** — exactly matches Postgres's 12,171 IOCs. ThreatActor 76, Malware 20, AttackPattern 409.
- Relationships: **26,804 total** (INDICATES 21,498, USES 5,088, EXPLOITS 218) — was 0.
- 0 error-level log lines.

**Tests:** threat-graph 399 (was 308). Detail: `docs/S171_GRAPH_FIXES.md`.

### #54 — remove decommissioned `ti.intelwatch.in` configuration
Merge `04ea04d`. Owner request: "ti.intelwatch.in is decommissioned, remove config related to it everywhere — only ti.intelwatch.in." ETIP moved from `ti.intelwatch.in` to `intelwatch.in` some time ago; leftover references pointed tooling at a dead host.

Changed: `infrastructure/nginx/ti.intelwatch.in` deleted (legacy host-nginx block — the VPS has no host nginx); `infrastructure/scripts/vps-setup.sh` dropped the host-nginx step, next-steps now verify `https://intelwatch.in/health` via the tunnel; `Makefile` `PROD_URL` → `https://intelwatch.in`; 3 scripts' URLs updated; `CLAUDE.md` dropped the "migrated from ti.intelwatch.in" note.

Verified already clean, no change needed: Cloudflare DNS (0 records for the old host), Cloudflare Tunnel ingress, VPS `/opt/intelwatch/.env`, `/etc/cloudflared/config.yml`, host nginx/certbot (none exist), UptimeRobot monitors, `docs/` (0 mentions).

**Out-of-repo change, found during this sweep:** the Cloudflare Turnstile widget "ETIP Widget" still had `["ti.intelwatch.in"]` as its only allowed hostname. This — not the CI build-arg fix from S168 — was the actual root cause of the sign-up CAPTCHA error 110200 that had been open since RCA #50. Hostname list updated to `["intelwatch.in"]` via the Cloudflare API. **Owner confirmed the register form now completes.** Recorded as RCA #53. Detail: `docs/S171_REMOVE_TI_DOMAIN.md`.

## Decisions (DECISIONS_LOG.md)

- **DECISION-044** — Threat graph is a derived store reconciled from the IOC source of truth (service-JWT hydration, STIX 2.1 model, event + periodic reconciliation, deterministic UUIDv5 ids). Rejected: producers sending full entity data in queue payloads; direct Postgres reads from threat-graph; frontend-only label mapping (the closed PR #50).
- **DECISION-045** — AI enrichment provider path for the pre-revenue period: owner-triggered runs via a host-side Claude Code runner on the VPS, results recorded in the existing `AiProcessingCost` ledger with a super-admin usage view; switch to a live Anthropic API key once there are paying customers (config switch, not a rewrite). Quality bar: Sonnet-class model, same output schema, per-IOC validated JSON, grounded prompts, AI may only suggest attribution (deterministic risk score stays the backbone), provenance per result, golden-set evaluation gate, low-confidence flagged for review.
- **DECISION-046** — Vulnerability scanner support starts with report-file import (Nessus/Qualys/OpenVAS/generic CSV), not live scanner API integration — works for on-prem and cloud scanners with no stored credentials. One plan feature key `vuln_scanner_import`; alert channels need real delivery + server-side plan enforcement first.
- **DECISION-047** — Step 15 Phase 2's 7 open architecture decisions accepted per the roadmap doc's own recommendation (§11): new `exposure-service`; org profile in customization; asset/vuln data extends drp-service; sightings + rule→technique mapping in integration-service; per-widget posture-cache TTL exception; `/exposure` top-level route.

## RCA (DEPLOYMENT_RCA.md)

**Issue 53 — Sign-up CAPTCHA always failed after the domain move.** Symptom: `/register` → "Unable to connect to website", console `[Cloudflare Turnstile] Error: 110200`. Root cause: the Turnstile widget's allowed hostnames still listed only `ti.intelwatch.in`. Fix: hostnames set to `intelwatch.in`; repo leftovers removed (PR #54). Prevention: sweep third-party configs (Turnstile, OAuth redirect URIs, monitors, email domains, DNS) on any domain change, not only DNS; a headless-browser check catches widget errors curl can't.

## Ops notes

GitHub occasionally drops the push event on a merge — check `gh run list` after merging; use `gh workflow run deploy.yml --ref master` if no run appears (this happened for PR #53 this session). Claude may merge PRs itself once CI is green and the previous deploy is verified (owner-authorised).

## Known issues / next session queue

1. **Next session task #1:** self-service sign-up does not complete: the verification email is not delivered and the verify/resend endpoints are not wired (api-gateway routes + `EMAIL_SEND` worker in admin-service via Resend — `intelwatch.in` is already verified in Resend). Fix with adversarial review, then a live sign-up test.
2. Graph visual redesign (ui-design-workflow skill) now that real data exists.
3. AI enrichment per DECISION-045 (runner + ledger + super-admin view + quality gates).
4. Owner-scheduled security fix (details in the owner's private notes) — before plan-tier gating.
5. Vulnerability scanner import + tiers + channels per DECISION-046; Step 15 Phase 2 per DECISION-047.
6. Real tenant Clients list; Step 3 persistence (owner decisions D1–D7); Step 4 DB roles + RLS (E1–E7); Step 6 remainder.
7. Carried forward from prior SESSION_HANDOFF (unchanged): route-permission coverage test, Correlation "Create ticket" integration picker, RCA #49 error-handler sweep on other services, S161b PR 2–4, S163 billing/admin path+shape mismatches, real user/tenant provisioning (team invite/SCIM/SSO JIT/Add-Client all in-memory or unreachable today).

## Rollback (per PR)

- **#51:** `git revert` — restores the folders/scripts, nothing depends on them.
- **#52:** `git revert` — no data change, nothing calls the new paths until threat-graph's PR is also reverted.
- **#53:** `git revert` the PR; graph data already written by the sync stays (it's correct data). To stop reconciliation without a code revert: `TI_GRAPH_RECONCILE_ENABLED=false`.
- **#54:** `git revert`; re-adding a Turnstile hostname is a separate dashboard/API change, not part of this revert.

## Detail docs

`docs/S171_STEP6_CLEANUP.md` · `docs/S171_IOC_SERVICE_AUTH.md` · `docs/S171_GRAPH_FIXES.md` · `docs/S171_REMOVE_TI_DOMAIN.md`
