# S165 — Threat Graph shows real data via GET /graph/overview

**Date:** 2026-09-28 · **Branch:** `s165/graph-overview` · **Module:** threat-graph + frontend · **RCA:** Issue 51 (`docs/DEPLOYMENT_RCA.md`)

## Problem

The Threat Graph page never showed real data. `useGraphNodes` called `GET /graph/entity/root`; `"root"` is not a node id, so
the `/entity/:id` route always 404'd, the hook's `.catch` swallowed the error, and `withDemoFallback` rendered 15 hard-coded
demo nodes instead.

Separately, the frontend graph types never matched the backend. Backend nodes are
`{id, nodeType: 'IOC' | 'ThreatActor' | ..., riskScore, confidence, properties}` and edges
`{id, type: 'USES' | ..., fromNodeId, toNodeId, confidence (0-1), properties}`, while the page read `entityType`, `label`,
`sourceId`, `targetId`, `relationshipType`, and treated confidence as 0-100. So real data returned by `useNodeNeighbors`
(the graph "expand" action and the IOC detail panel's relationship graph) rendered with no labels, grey nodes, unconnected
edges, and confidence shown as "0.85%". `GET /graph/stats` returns `nodesByType/edgesByType/mostConnected/isolatedNodes/avgConnections`,
but the page read `byType/avgRiskScore` — fields that never existed on that response.

## Fix — backend (`apps/threat-graph`)

- New route `GET /api/v1/graph/overview?limit=N` (limit 1–500, default 50) — `OverviewQuerySchema` (Zod) in
  `src/schemas/search.ts`, registered in `src/routes/graph-extended.ts` behind `authenticate` + `rbac('graph:read')`.
- `getOverviewSubgraph(tenantId, limit)` in `src/repository-extended.ts` runs one parameterised Cypher query: top-N tenant
  nodes by degree (both edge directions tenant-filtered), then edges only between those N nodes. Returns the same
  `{nodes, edges}` shape as `/entity/:id`. An empty tenant returns `200 {nodes: [], edges: []}`, never a 404.
- `toNodeResponse` moved from `repository.ts` to `repository-extended.ts` (now exported) to keep `repository.ts` under the
  400-line file limit.
- nginx already proxies `/api/v1/graph` to the service — no infra change needed.

## Fix — frontend (`apps/frontend`)

- New `src/hooks/graph-adapter.ts` (`toGraphSubgraph`): maps `nodeType` → `entityType`, derives `label` from
  `properties.name ?? properties.value ?? properties.cveId ?? id`, maps `fromNodeId/toNodeId` → `sourceId/targetId`, and
  lower-cases `type` → `relationshipType`.
- `useGraphNodes(limit = 50)` now calls `/graph/overview?limit=N` — no `.catch`, no demo fallback.
- `useGraphStats` — no `.catch`/demo fallback, uses the real `GraphStats` type (`nodesByType/edgesByType/mostConnected/isolatedNodes/avgConnections`).
- `useNodeNeighbors` — maps its response through the adapter, keeps its existing 404→empty `.catch` (404 here legitimately
  means "this entity isn't in the graph yet").
- `ThreatGraphPage`: demo banner removed; added loading / error-with-Retry / empty overlays (the `<svg>` stays mounted so
  D3 doesn't need to reattach); empty state text distinguishes "no entities in the graph yet" from "no entities match the
  current filters". Stat tile "Avg Risk" renamed to "Avg Links" (backed by `avgConnections`, since no `avgRiskScore` field
  exists). Edge width, tooltip, and `NodeDetailPanel` confidence display converted from 0–1 to a percentage.
- `GraphWidgets`: added colours/labels for the `Infrastructure` and `Victim` node types.
- Deleted `DEMO_GRAPH_NODES` / `DEMO_GRAPH_EDGES` / `DEMO_GRAPH_STATS`.

## Files

`apps/threat-graph/src/routes/graph-extended.ts`, `apps/threat-graph/src/repository-extended.ts`,
`apps/threat-graph/src/repository.ts` (`toNodeResponse` moved out), `apps/threat-graph/src/schemas/search.ts`,
`apps/threat-graph/tests/overview.test.ts` (new), `apps/frontend/src/hooks/graph-adapter.ts` (new),
`apps/frontend/src/hooks/use-phase4-data.ts` (`useGraphNodes`/`useGraphStats`/`useNodeNeighbors`),
`apps/frontend/src/pages/ThreatGraphPage.tsx`, `apps/frontend/src/components/viz/GraphWidgets.tsx`,
`apps/frontend/src/hooks/phase4-demo-data.ts` (types; demo graph data deleted),
`apps/frontend/src/__tests__/graph-overview.test.tsx` (new), plus mock updates in `phase4-pages.test.tsx`,
`graph-actions.test.tsx`, `mobile-responsive.test.tsx`.

## Tests

threat-graph: 308 passed (new `tests/overview.test.ts`, 14 cases — mapping, empty tenant, single node, tenant-scoped
params + Cypher text, session closed on error, schema accept/reject matrix, route delegation). Frontend: 1,988 passed +
2 skipped (was 1,975 + 2; new `src/__tests__/graph-overview.test.tsx`, mocks use the real backend shape per
`feedback_real_backend_shapes.md`). `tsc` 0 / eslint 0 errors in both packages.

## Commit

`823884b` on branch `s165/graph-overview` (PR to master, not yet merged/deployed).

## How to verify after deploy

1. Open `/graph` (Threat Graph) in a fresh incognito tab — real nodes/edges, or the "No graph entities yet" empty state.
   Never the old Demo banner.
2. DevTools Network shows `GET /api/v1/graph/overview?limit=50` → 200. No request to `/graph/entity/root`.
3. Click a node → Expand → neighbours merge in with real labels (not blank/grey).
4. Open an IOC detail panel for an IOC that exists in the graph → Relations graph shows labelled, connected nodes.

## Rollback

`git revert 823884b` — frontend + threat-graph only, no schema or data change.
Restore point tag: `safe-point-2026-09-28-s165-graph-overview`.

## Known limits

`getOverviewSubgraph` computes degree over all tenant nodes (same cost as the existing `/graph/stats` query) — fine at the
current scale (~12k nodes); add a cached degree property if the graph grows by orders of magnitude.
`use-phase4-data.ts` (549 lines) and `ThreatGraphPage.tsx` (514 lines) remain over the 400-line file limit — pre-existing,
tracked on the Step 6 file-split list, not touched by this change.
