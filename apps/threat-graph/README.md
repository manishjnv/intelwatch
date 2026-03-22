# Threat Graph Service (Module 12)

**Port:** 3012 | **Phase:** 4 | **Status:** 🔨 WIP | **Tests:** 90

Neo4j knowledge graph with living risk propagation. 7 node types, 9 relationship types,
N-hop queries, shortest path with explanation, cluster analysis, and graph statistics.

## Features

| Feature | File | Description |
|---------|------|-------------|
| Node CRUD | `repository.ts` | Create/upsert/get/delete graph nodes (7 types) |
| Relationship CRUD | `repository.ts` | Create relationships with type validation (9 types) |
| N-Hop Neighbors | `repository.ts` | Variable-depth neighbor traversal (1-5 hops) |
| Shortest Path | `repository.ts` | Path-finding with max depth control |
| Actor/Campaign Cluster | `repository.ts` | Full subgraph via APOC subgraphAll |
| **Risk Propagation** | `propagation.ts` | BFS 3-hop, 0.7^distance decay (P0 #1) |
| **Confidence-Weighted Edges** | `propagation.ts` | relationship.confidence × propagation weight (P0 #2) |
| **Temporal Decay** | `propagation.ts` | e^(-0.01 × days) per relationship age (P0 #3) |
| **Path Explanation** | `service.ts` | Human-readable connection narrative (P0 #4) |
| **Graph Statistics** | `repository.ts` | Counts, density, most-connected, isolated (P0 #5) |
| GRAPH_SYNC Worker | `queue.ts` | BullMQ consumer for cross-service graph updates |
| Relationship Validation | `service.ts` | Enforces valid source→target type pairs |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check |
| GET | `/ready` | None | Readiness (incl. Neo4j check) |
| POST | `/api/v1/graph/nodes` | analyst+ | Create/upsert node |
| GET | `/api/v1/graph/nodes/:id` | viewer+ | Get node by ID |
| DELETE | `/api/v1/graph/nodes/:id` | admin | Delete node + relationships |
| POST | `/api/v1/graph/relationships` | analyst+ | Create relationship |
| GET | `/api/v1/graph/entity/:id` | viewer+ | N-hop neighbors |
| GET | `/api/v1/graph/path` | viewer+ | Shortest path + explanation |
| GET | `/api/v1/graph/cluster/:id` | viewer+ | Full entity cluster |
| POST | `/api/v1/graph/propagate` | admin | Trigger risk propagation |
| GET | `/api/v1/graph/stats` | viewer+ | Graph statistics |

## Configuration

| Var | Default | Purpose |
|-----|---------|---------|
| `TI_THREAT_GRAPH_PORT` | 3012 | Service port |
| `TI_NEO4J_URL` | — | Neo4j bolt URL (bolt://user:pass@host:port) |
| `TI_GRAPH_PROPAGATION_MAX_DEPTH` | 3 | Max BFS hops for risk propagation |
| `TI_GRAPH_PROPAGATION_DECAY` | 0.7 | Decay factor per hop (0.7^distance) |
| `TI_GRAPH_WORKER_CONCURRENCY` | 5 | BullMQ worker concurrency |

## Graph Data Model

**Nodes:** IOC, ThreatActor, Malware, Campaign, Infrastructure, Vulnerability, Victim
**Relationships:** USES, CONDUCTS, TARGETS, CONTROLS, RESOLVES_TO, HOSTED_ON, EXPLOITS, INDICATES, OBSERVED_IN

## Risk Propagation Algorithm

```
Trigger: node risk score changes
BFS traversal, maxDepth = 3 hops
Weight = 0.7^distance × relationship.confidence × e^(-0.01 × daysSinceLastSeen)
Score = max(current, trigger × weight) — only propagates UPWARD
Threshold: skip if propagated score < 1.0
```

## Session 25 (2026-03-22)

- Core service scaffolded: 18 source files, 7 test files, 90 tests
- P0 improvements #1-5 implemented
- Infra: Dockerfile, tsconfig.build.json, docker-compose updated
- Next: P1 #6-10 + P2 #11-15 improvements (Session 26)
