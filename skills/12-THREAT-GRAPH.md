# SKILL: Threat Graph Intelligence
**ID:** 12-threat-graph | **Version:** 3.0

## MANDATORY (read before implementing)
1. **00-claude-instructions** — coding rules, token efficiency, definition of done
2. **00-architecture-roadmap** — tech stack, data flow, phase you're in
3. **00-master** — project structure, error classes, API response shapes
4. **02-testing** — write tests FIRST, then implement
5. **01-docs** — update documentation AFTER implementing

## MANDATORY PIPELINE INTEGRATION
Every entity stored in this module MUST:
1. Be normalized via `shared-normalization` package FIRST
2. Be queued for AI enrichment via `shared-enrichment` package
3. Be indexed in Elasticsearch after storage
4. Have a Neo4j node created/updated (via graph-service)
5. Publish the appropriate event to the event bus
6. All values displayed as clickable EntityChip (20-ui-ux)
7. Have tooltips and inline help on all UI elements

## MODULE DESCRIPTION
Neo4j 5 for graph storage. Nodes: IOC, ThreatActor, Malware, Campaign, Infrastructure, Vulnerability, Victim. Relationships: USES, CONDUCTS, CONTROLS, TARGETS, EXPLOITS, RESOLVES_TO, HOSTED_ON. Every entity created in other modules must create/update corresponding Neo4j node. Graph API: entity with N-hop neighbors, shortest path between two entities, full actor cluster, expand node. Frontend: React Flow + D3. Node colors by type. Edge labels. Click for detail panel. Drag/zoom/pan. Cluster highlight. N-hop depth slider. Export as PNG/SVG. Graph is the premium feature differentiator — make it best-in-class. Path finding shows HOW two actors/IOCs are connected.

## FILE STRUCTURE (max 400 lines per file)
```
/apps/12-threat-graph-service/src/
  index.ts              # Fastify app setup, plugins, routes registration
  routes.ts             # Route definitions only (import controllers)
  controller.ts         # HTTP layer — parse request, call service, format response
  service.ts            # Business logic (split into multiple files if >400 lines)
  schema.ts             # Zod schemas for this module's entities
  repository.ts         # Database queries (Prisma)
  queue.ts              # BullMQ worker/producer for this module
  README.md             # Module overview (updated after each build)
```

## UI REQUIREMENTS (from 20-ui-ux)
- All entity values (IPs, domains, actor names, CVEs, hashes) = EntityChip (clickable, highlighted)
- InvestigationPanel opens on entity click (relationship sidebar)
- Page-specific compact stats bar at top of module view
- All form fields have InlineHelp messages
- All features have TooltipHelp icons
- Collapsible sections on detail views
- 3D card effect (IntelCard) on interactive cards
- Mobile responsive (375px card view, desktop table view)
- Skeleton screens on all loading states
- Empty state with actionable CTA

## TESTING REQUIREMENTS (from 02-testing)
- Write test outlines BEFORE implementing
- Unit tests: all service methods (happy + error paths)
- Integration tests: all CRUD endpoints, auth enforcement, tenant isolation
- Minimum 80% coverage
- Run `npm run test:coverage` before marking done

## GRAPH QUERIES (Neo4j Cypher)
```cypher
// Actor cluster with 2-hop depth
MATCH (a:ThreatActor {id: $actorId, tenantId: $tenantId})
CALL apoc.path.subgraphAll(a, {maxLevel: 2})
YIELD nodes, relationships
RETURN nodes, relationships

// Path between two entities
MATCH path = shortestPath((a {id: $fromId})-[*..5]-(b {id: $toId}))
WHERE all(n in nodes(path) WHERE n.tenantId = $tenantId)
RETURN path

// Find shared infrastructure (IOCs sharing same ASN)
MATCH (i1:IOC {tenantId: $tenantId})-[:HOSTED_ON]->(infra:Infrastructure)
MATCH (i2:IOC {tenantId: $tenantId})-[:HOSTED_ON]->(infra)
WHERE i1 <> i2
RETURN i1, i2, infra
```

## REACT FLOW GRAPH CONFIG
```typescript
// Node types with color coding
const NODE_COLORS = {
  IOC: { ip: '#3b82f6', domain: '#8b5cf6', hash: '#64748b', cve: '#f97316' },
  ThreatActor: '#ef4444',
  Malware: '#ec4899',
  Campaign: '#f59e0b',
  Infrastructure: '#06b6d4',
  Vulnerability: '#f97316',
}

// Edge labels from relationship type
// N-hop depth slider (1-5 hops) — deeper = more context but heavier
// Path highlight: click two nodes → show shortest connection path
```
