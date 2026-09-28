# S171 — Threat Graph fixes (quick fixes → real graph data → redesign)

**Date:** 2026-09-28 · **Session:** 171 · **Modules:** threat-graph, frontend (Threat Graph page) · **RCA:** Issue 52

Owner feedback after S165 (`/graph` live): the graph "does not look appealing" — scattered grey dots labelled with UUIDs, stats bar all "—". Investigation on the VPS found three separate causes; this doc tracks the PRs that fix them in order.

## Findings (2026-09-28, production)
- `GET /api/v1/graph/stats` returned 500 on every call: Cypher variable named `all` (reserved function in Neo4j 5).
- Neo4j holds ~2,500 nodes and **0 relationships**. Node labels are lowercase IOC types (`cve` 1,054, `domain` 618, `url` 344, `hash_sha1` 230, `email` 121, `hash_sha256` 111, `hash_md5` 29, `ip` 22). Node properties are only `id, tenantId, nodeType, firstSeen, lastSeen, enrichmentStatus, enrichedAt` — no `value`, no `riskScore`.
- Root cause of the data gaps: the only graph writer is `apps/ai-enrichment/src/workers/enrich-worker.ts` (`enqueueDownstream`), which sends `nodeType: iocType` and enrichment-provider fields only; nothing ever enqueues `create_relationship`; normalization never syncs to the graph. The threat-graph worker (`apps/threat-graph/src/queue.ts`) does not validate `nodeType` against the schema's node types.

## PR A — quick fixes (branch `s171/graph-quickfix`)
- `apps/threat-graph/src/repository-extended.ts` `getGraphStats`: variable `all` → `allNodes`. Test in `tests/repository.test.ts` asserts no stats Cypher uses `all` as a variable.
- `apps/frontend/src/hooks/graph-adapter.ts`: non-schema labels map to `ioc` (`cve` → `vulnerability`); value-less nodes are labelled `<type>:<first 8 of id>` instead of the full UUID. Test in `src/__tests__/graph-overview.test.tsx` uses the production node shape.
- Tests: threat-graph 309, frontend 1,989 + 2 skipped; tsc/eslint 0 errors.
- Verify after deploy: `/graph` stats bar shows numbers (Nodes ≈ 2.5k, Edges 0, Avg Links 0); nodes coloured blue (IOC) / purple (CVE); type filters show non-zero counts; threat-graph logs have no `Unhandled error` for `/graph/stats`.
- Rollback: `git revert <PR A commit>` — no data change.
