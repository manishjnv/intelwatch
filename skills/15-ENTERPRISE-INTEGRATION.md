# SKILL: Enterprise Integration
**ID:** 15-enterprise-integration | **Version:** 3.0

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
Connectors: ServiceNow ITSM/CMDB/SOAR, Splunk HEC, Microsoft Sentinel (STIX 2.1), IBM QRadar, Elastic SIEM, Jira/Jira SM, Freshservice, CrowdStrike, Defender, SentinelOne, Slack, Teams, Email, PagerDuty, generic HMAC webhook. Config per tenant per integration: credentials (encrypted AES-256), enabled flag, trigger list, field mapping. Integration event router: for each platform event, check which integrations are enabled and have matching trigger, enqueue async send. Retry logic (3 attempts, exponential backoff). Integration logs (success/failure per send). Test connection button. Field mapping UI lets admin map platform fields to target fields. CMDB enrichment: for HIGH+ IOCs query CMDB for asset match → enrich IOC with asset owner/class.

## FILE STRUCTURE (max 400 lines per file)
```
/apps/15-enterprise-integration-service/src/
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
