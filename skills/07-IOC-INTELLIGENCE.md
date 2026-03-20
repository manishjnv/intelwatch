# SKILL: IOC Intelligence
**ID:** 07-ioc | **Version:** 3.0

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
Manages full indicator lifecycle. PostgreSQL with GIN indexes. Elasticsearch for full-text + faceted search. IOC types: ip/ipv6/domain/fqdn/url/email/md5/sha1/sha256/sha512/asn/cidr/cve/bitcoin. Deduplication via shared-normalization. Pivot search: given one IOC find related IOCs (shared ASN/WHOIS/C2), actors, malware, campaigns. Lifecycle: active/expired/revoked/false_positive. Auto-expire per type (IP=30d, domain=90d, hash=never). Elasticsearch indexing after every upsert. Neo4j node created for every IOC. Bulk ingest up to 10k items. Export CSV/JSON/STIX2. All IOC values displayed as clickable EntityChip (see skill 20-ui-ux). Archive after 60 days per skill 23.

## FILE STRUCTURE (max 400 lines per file)
```
/apps/07-ioc-service/src/
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

## KEY ENDPOINTS
```
GET    /api/v1/ioc              → paginated list (filter: type, severity, tlp, tags, dateRange)
POST   /api/v1/ioc              → create single IOC
POST   /api/v1/ioc/bulk         → bulk create (up to 10,000)
GET    /api/v1/ioc/:id          → detail view with enrichment
PUT    /api/v1/ioc/:id          → update
DELETE /api/v1/ioc/:id          → revoke
POST   /api/v1/ioc/search       → Elasticsearch full-text + faceted
GET    /api/v1/ioc/:id/pivot    → related entities (N-hop)
GET    /api/v1/ioc/:id/history  → lifecycle timeline
POST   /api/v1/ioc/export       → bulk export CSV/JSON/STIX2
GET    /api/v1/ioc/stats        → page stats bar data (cached 1hr)
```

## MANDATORY FLOW (every IOC creation)
```typescript
// 1. Normalize
const canonical = await normalizationService.normalizeIOC(raw, feedMeta)
// 2. Deduplicate upsert
const stored = await iocRepo.upsert(canonical)
// 3. ES index
await esService.index('ioc', stored)
// 4. Neo4j node
await graphService.upsertNode('IOC', stored)
// 5. Queue enrichment
await enrichmentQueue.add('enrich', { entityId: stored.id, entityType: 'ioc', tenantId })
// 6. Publish event
await eventBus.publish('normalization', { type: 'ioc.created', tenantId, entityId: stored.id, data: canonical })
// 7. Check alerts
await alertEngine.check(stored)
```

## ARCHIVAL (skill 23)
IOCs older than 60 days with source='feed' → auto-archived to MinIO
Tombstone kept in PostgreSQL for search transparency
