# S171 — Threat Graph: real graph data (permanent fix)

**Date:** 2026-09-28 · **Session:** 171 · **Modules:** threat-graph (PR 3), ioc-intelligence (PR 2, `docs/S171_IOC_SERVICE_AUTH.md`) · **RCA:** Issue 52

## Problem (production, 2026-09-28)
- Neo4j: ~2,500 nodes, **0 relationships**; labels were lowercase IOC types (`cve` 1,054, `domain` 618, `url` 344, `hash_sha1` 230, `email` 121, `hash_sha256` 111, `hash_md5` 29, `ip` 22); nodes had no value and no risk. Postgres holds 12,171 IOCs (870 with threat actors, 442 with malware families, 1,294 with MITRE techniques) — the graph showed almost none of it.
- `GET /api/v1/graph/stats` returned 500 on every call.
- Cause: the only graph writer (ai-enrichment) sent the raw IOC type as the node label plus enrichment fields only; nothing created relationships; nothing reconciled the graph with Postgres.

PR #50 (frontend label workaround) was closed in favour of this fix.

## Design
**Source of truth = Postgres via the ioc-intelligence API** (no cross-module DB access). threat-graph pulls IOC records with a 60-second service JWT, maps them to a STIX 2.1-aligned model, and keeps Neo4j consistent through events **and** periodic reconciliation.

| Source field | Graph |
|---|---|
| IOC (non-CVE) | `(:IOC {iocType, value, severity, tlp, lifecycle, confidence, baseRiskScore, …})` |
| IOC of type `cve` | `(:Vulnerability {cveId, …})` |
| `threatActors[]` | `(:ThreatActor {name})`, IOC `-[:INDICATES]->` actor; actor `-[:EXPLOITS]->` vulnerability |
| `malwareFamilies[]` | `(:Malware {name})`, IOC `-[:INDICATES]->` malware; malware `-[:EXPLOITS]->` vulnerability |
| `mitreAttack[]` (valid `T####[.###]`) | `(:AttackPattern {mitreId})`, IOC `-[:INDICATES]->` technique |
| co-listed on one IOC | actor `-[:USES]->` malware / technique; malware `-[:USES]->` technique |

- Entity ids are deterministic UUIDv5 of (tenant, type, normalized name) — the same actor seen in many IOCs is one node per tenant.
- IOCs marked false positive or revoked are removed from the graph.
- **Risk:** sync owns `baseRiskScore` = max(severity score × (0.6 + 0.4 × confidence), enrichment external risk); `riskScore` is only ever raised to at least that base (propagation and decay keep owning it). Actor/malware/technique risk = max over linked indicators of (indicator risk × edge confidence × INDICATES weight 0.8). Sync events do not trigger breadth-first propagation (hub actors link hundreds of IOCs); explicit propagation jobs and the API still do.

## What changed (apps/threat-graph)
- **PR 3a** — `cypher-safety.ts`: every interpolated label / relationship type is checked against the schema allowlist. `schemas/graph.ts`: `AttackPattern` node type; IOC types match Postgres; relationship rules extended per STIX (INDICATES → Malware/AttackPattern, USES from Malware / to AttackPattern, EXPLOITS from Malware). `migrations/`: versioned, idempotent graph migrations with markers — `001` relabels legacy lowercase IOC-type nodes to `IOC`/`Vulnerability` (allowlisted IOC types only), `002` adds `(id, tenantId)` uniqueness constraints (index fallback) and tenant indexes. Stats query no longer uses the reserved name `all`.
- **PR 3b** — `clients/ioc-client.ts` (service JWT, 15 s timeout, no redirects, response validation, tenant-match check); `services/ioc-graph-mapper.ts` (pure mapping above); `services/graph-sync.ts` (one write transaction per page, UNWIND batches, prunes only its own `origin='ioc-sync'` edges, never downgrades analyst-confirmed edges); `services/graph-reconciler.ts` (incremental every 15 min with a 5-minute overlap watermark, full sweep daily; per-tenant leases renewed per page; deletion sweep only when ≥ 90 % of the source was applied); `services/ioc-sync-service.ts` + queue `sync_ioc` action (the legacy `upsert_node` with a raw IOC type is rerouted to it); admin routes `GET /api/v1/graph/sync/status`, `POST /api/v1/graph/sync/run` (`graph:admin`, caller's tenant only).
- Config (`docker-compose.etip.yml` → `etip_threat_graph`): `TI_IOC_SERVICE_URL`, `TI_GRAPH_RECONCILE_ENABLED`, `TI_GRAPH_RECONCILE_INTERVAL_MS`, `TI_GRAPH_FULL_SYNC_INTERVAL_MS`, `TI_GRAPH_RECONCILE_PAGE_SIZE`.

## Review
Opus line-by-line diff review (added: sweep coverage guard, orphan-entity cleanup, targeted entity rollup, UUID check on queue-supplied ids, no BFS on sync events) + Codex adversarial review → revisions applied (coverage counts applied records only, paging on raw page size, tenant-scoped prune endpoints, per-tenant renewable leases, service-URL validation + no redirects).

## Deploy order
PR 2 (ioc-intelligence) **before** this PR — until then the reconciler's calls fail and it simply retries next interval (no graph changes). First boot: migrations run, then the first reconcile starts after 60 s as a full sweep (the backfill).

## Verify after deploy
1. `docker logs etip_threat_graph` → `Graph migration applied` (001, 002) once; `Graph reconcile tenant run complete` with non-zero `nodesUpserted` / `edgesMerged`; no `Unhandled error`.
2. Neo4j: labels `IOC`, `Vulnerability`, `ThreatActor`, `Malware`, `AttackPattern`; no lowercase labels; relationship count > 0.
3. `/graph` page: stats bar shows numbers; top-connected view shows actor/malware hubs with labelled IOC spokes.

## Rollback
`git revert` the PR. Graph data written by the sync stays (it is correct data); set `TI_GRAPH_RECONCILE_ENABLED=false` to stop reconciliation without a code revert.
