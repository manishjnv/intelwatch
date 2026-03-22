# Threat Graph Service (Module 12)

**Port:** 3012 | **Phase:** 4 | **Status:** 🔨 Feature-complete | **Tests:** 294

Neo4j knowledge graph with living risk propagation. 7 node types, 9 relationship types,
32 API endpoints, 20 improvements. STIX 2.1 export, cluster detection, impact simulation,
batch import, decay cron, node merge/split, relationship trending.

## Features

| Feature | File | Description |
|---------|------|-------------|
| Node CRUD | `repository.ts` | Create/upsert/get/delete graph nodes (7 types) |
| Relationship CRUD | `repository-extended.ts` | Full CRUD with analyst-confirmed labels (#14) |
| N-Hop Neighbors | `repository.ts` | Variable-depth neighbor traversal (1-5 hops) |
| Shortest Path | `repository.ts` | Path-finding with max depth control |
| Actor/Campaign Cluster | `repository.ts` | Full subgraph via APOC subgraphAll |
| **Risk Propagation** | `propagation.ts` | BFS 3-hop, 0.7^distance decay, per-type weights (#1, #9) |
| **Confidence-Weighted Edges** | `propagation.ts` | relationship.confidence × propagation weight (#2) |
| **Temporal Decay** | `propagation.ts` | e^(-0.01 × days) per relationship age (#3) |
| **Path Explanation** | `service.ts` | Human-readable connection narrative (#4) |
| **Graph Statistics** | `repository-extended.ts` | Counts, density, most-connected, isolated (#5) |
| **Bidirectional Rels** | `services/bidirectional.ts` | Query from either direction with labels (#6) |
| **Cluster Detection** | `services/cluster-detection.ts` | Community detection via shared infra (#7) |
| **Impact Radius** | `services/impact-radius.ts` | Dry-run blast radius simulation (#8) |
| **Graph Diff/Timeline** | `services/graph-diff.ts` | Neighborhood changes over N days (#10) |
| **Expand Node** | `services/expand-node.ts` | Paginated 1-hop lazy load (#11) |
| **STIX 2.1 Export** | `services/stix-export.ts` | Subgraph → STIX bundle (7 SDO types) (#12) |
| **Graph Search** | `services/graph-search.ts` | Property/type/risk range search (#13) |
| **Propagation Audit** | `services/audit-trail.ts` | Before/after scores, decay path (#15) |
| **Node Merge/Split** | `services/node-merge.ts` | Merge duplicates, split with rel reassign (#16) |
| **Batch Import** | `services/batch-import.ts` | Bulk 500 nodes + 1000 rels (#17) |
| **Decay Cron** | `services/decay-cron.ts` | 6h periodic score re-evaluation (#18) |
| **Layout Presets** | `services/layout-presets.ts` | Save/load graph viz configs (#19) |
| **Rel Trending** | `services/relationship-trending.ts` | Confidence change tracking (#20) |
| GRAPH_SYNC Worker | `queue.ts` | BullMQ consumer for cross-service graph updates |

## API Endpoints (32)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check |
| GET | `/ready` | None | Readiness (incl. Neo4j check) |
| POST | `/api/v1/graph/nodes` | graph:write | Create/upsert node |
| GET | `/api/v1/graph/nodes/:id` | graph:read | Get node by ID |
| DELETE | `/api/v1/graph/nodes/:id` | graph:delete | Delete node + relationships |
| POST | `/api/v1/graph/relationships` | graph:write | Create relationship |
| GET | `/api/v1/graph/entity/:id` | graph:read | N-hop neighbors |
| GET | `/api/v1/graph/path` | graph:read | Shortest path + explanation |
| GET | `/api/v1/graph/cluster/:id` | graph:read | Full entity cluster |
| POST | `/api/v1/graph/propagate` | graph:admin | Trigger risk propagation |
| GET | `/api/v1/graph/stats` | graph:read | Graph statistics |
| GET | `/api/v1/graph/nodes/:id/relationships` | graph:read | Bidirectional rels (#6) |
| GET | `/api/v1/graph/clusters` | graph:read | Cluster detection (#7) |
| GET | `/api/v1/graph/nodes/:id/impact` | graph:read | Impact radius (#8) |
| GET | `/api/v1/graph/nodes/:id/timeline` | graph:read | Graph diff (#10) |
| GET | `/api/v1/graph/nodes/:id/expand` | graph:read | Expand node (#11) |
| POST | `/api/v1/graph/export/stix` | graph:read | STIX 2.1 export (#12) |
| GET | `/api/v1/graph/search` | graph:read | Graph search (#13) |
| GET | `/api/v1/graph/relationships/:f/:t/:to` | graph:read | Get relationship (#14) |
| PUT | `/api/v1/graph/relationships/:f/:t/:to` | graph:write | Update relationship (#14) |
| DELETE | `/api/v1/graph/relationships/:f/:t/:to` | graph:delete | Delete relationship (#14) |
| GET | `/api/v1/graph/propagation/audit` | graph:admin | Audit trail (#15) |
| POST | `/api/v1/graph/nodes/merge` | graph:write | Merge nodes (#16) |
| POST | `/api/v1/graph/nodes/split` | graph:write | Split node (#16) |
| POST | `/api/v1/graph/batch` | graph:write | Batch import (#17) |
| POST | `/api/v1/graph/decay/trigger` | graph:admin | Manual decay (#18) |
| GET | `/api/v1/graph/decay/status` | graph:admin | Decay cron status (#18) |
| POST | `/api/v1/graph/layouts` | graph:write | Create preset (#19) |
| GET | `/api/v1/graph/layouts` | graph:read | List presets (#19) |
| GET | `/api/v1/graph/layouts/:id` | graph:read | Get preset (#19) |
| DELETE | `/api/v1/graph/layouts/:id` | graph:delete | Delete preset (#19) |
| GET | `/api/v1/graph/relationships/:f/:t/:to/trending` | graph:read | Trending (#20) |

## Configuration

| Var | Default | Purpose |
|-----|---------|---------|
| `TI_THREAT_GRAPH_PORT` | 3012 | Service port |
| `TI_NEO4J_URL` | — | Neo4j bolt URL |
| `TI_GRAPH_PROPAGATION_MAX_DEPTH` | 3 | Max BFS hops |
| `TI_GRAPH_PROPAGATION_DECAY` | 0.7 | Decay factor per hop |
| `TI_GRAPH_WORKER_CONCURRENCY` | 5 | BullMQ worker concurrency |
| `TI_GRAPH_DECAY_CRON_INTERVAL` | 21600000 | Decay cron interval (6h) |
| `TI_GRAPH_DECAY_THRESHOLD` | 1.0 | Min score drop to trigger update |
| `TI_GRAPH_MAX_LAYOUT_PRESETS` | 50 | Max presets per tenant |

## Risk Propagation Formula

```
Score = triggerScore × 0.7^distance × rel.confidence × e^(-0.01 × days) × relTypeWeight
Only propagates UPWARD (DECISION-020). Decay cron separately lowers stale scores.
```

## Relationship Type Weights (#9)

```
CONTROLS: 0.95 | USES: 0.90 | CONDUCTS: 0.85 | EXPLOITS: 0.85
INDICATES: 0.80 | TARGETS: 0.75 | HOSTED_ON: 0.70
RESOLVES_TO: 0.65 | OBSERVED_IN: 0.60
```

## Session History

- **Session 25** (2026-03-22): Core + P0 #1-5. 18 source files, 90 tests. Commit 2e37845.
- **Session 26** (2026-03-23): 20 improvements (#1-20). 40 files, 294 tests. Commit bb0a5c1.
