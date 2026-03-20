# SKILL: Intelligence Ingestion
**ID:** 04-ingestion | **Version:** 3.0

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
Collect intelligence from OSINT, commercial, dark web feeds. All data MUST be queued to normalization-service after collection. Never store raw data directly. Feed formats: STIX2, MISP, CSV, JSON, XML, TAXII, REST APIs. Use BullMQ for all async ingestion. Feed scheduler uses cron expressions stored per-tenant in DB. Support both real-time streaming and batch collection. Rate-limit per feed. Dead-letter queue for failed ingestion. Admin can view per-feed stats (last run, items ingested, error count). Feed health shown in admin dashboard. Archival: all feed IOCs auto-archived after 60 days per skill 23-caching-archival.

## FILE STRUCTURE (max 400 lines per file)
```
/apps/04-ingestion-service/src/
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

---

## STRATEGIC REVIEW — P1 ADDITIONS (Update 4: 5-Stage Feed Pipeline + Connectors + Article Schema + Endpoints)
**Added:** 2026-03-16 | **Source:** Strategic Architecture Review v1.0

### 5-STAGE CTI PROCESSING PIPELINE

The most significant architectural improvement. Saves ~80% in AI costs by filtering non-CTI articles at Stage 1 with cheap Haiku classification before expensive Sonnet extraction.

```
Stage 1: Triage NLP (Haiku)      → Classify: is this CTI-relevant? (~80% filtered out)
Stage 2: Deep CTI Extraction (Sonnet) → Extract IOCs, TTPs, actors (only ~20% of articles)
Stage 2.5: External Enrichment     → VT, AbuseIPDB, Shodan lookups (zero LLM cost)
Stage 3: Deduplication             → 3-layer: Bloom filter → pgvector similarity → LLM arbitration
Stage 4: Persistence               → Store with IOC lifecycle state machine
```

#### Stage 1 — Triage NLP (Cheap Classification)

```typescript
// Stage 1: Haiku-powered triage — ~$0.001 per article
interface TriageResult {
  is_cti_relevant: boolean         // Core gate: skip if false
  confidence: number               // 0-1
  detected_language: string        // ISO 639-1 code
  article_type: 'threat_report' | 'vulnerability_advisory' | 'news' | 'blog' | 'irrelevant'
  estimated_ioc_count: number
  priority: 'critical' | 'high' | 'normal' | 'low'
}

async function triageArticle(article: RawArticle): Promise<TriageResult> {
  const result = await anthropic.messages.create({
    model: MODELS.fast,  // claude-haiku-4-5-20251001
    max_tokens: 256,
    system: 'You are a CTI triage analyst. Classify if this article contains actionable threat intelligence (IOCs, TTPs, threat actors, vulnerabilities). Return JSON only.',
    messages: [{ role: 'user', content: `Title: ${article.title}\nSource: ${article.source}\nExcerpt (500 chars): ${article.content.slice(0, 500)}` }],
  })
  return JSON.parse(result.content[0].text)
}
```

#### Stage 2 — Deep CTI Extraction (Sonnet — Only for CTI-Relevant Articles)

```typescript
// Stage 2: Full extraction with Sonnet — only ~20% of articles reach here
interface CTIExtractionResult {
  iocs: Array<{ type: string; value: string; context: string }>
  threat_actors: string[]
  malware_families: string[]
  mitre_techniques: string[]       // T-codes
  campaigns: string[]
  vulnerabilities: string[]        // CVE IDs
  target_industries: string[]
  target_regions: string[]
  summary: string                  // 2-3 sentence intelligence summary
  tlp: 'WHITE' | 'GREEN' | 'AMBER' | 'RED'
}
```

#### Stage 2.5 — External Enrichment (Zero LLM Cost)

Parallel API calls to external providers for extracted IOCs:
- **VirusTotal** — file hashes, domains, IPs
- **AbuseIPDB** — IP reputation
- **Shodan** — IP metadata, open ports
- **IPInfo** — geolocation, ASN
- **URLScan** — URL analysis
- **MalwareBazaar** — malware sample data
- **NVD API** — CVE details (CVSS, EPSS)

#### Stage 3 — 3-Layer Deduplication

```typescript
// Layer 1: Bloom filter (sub-millisecond exact-match check)
// Layer 2: pgvector cosine similarity (semantic dedup for near-duplicates)
// Layer 3: LLM arbitration (Haiku — only for ambiguous cases where Layer 2 score is 0.85-0.95)

interface DedupResult {
  is_duplicate: boolean
  existing_id: string | null
  similarity_score: number
  dedup_layer: 'bloom' | 'pgvector' | 'llm' | 'none'
  action: 'skip' | 'merge' | 'create_new'
}
```

#### Stage 4 — Persistence with IOC Lifecycle

IOC lifecycle state machine on creation:
```
NEW → ACTIVE → AGING → EXPIRED → ARCHIVED
                                  → FALSE_POSITIVE
```
New IOCs enter as `NEW`, transition to `ACTIVE` after enrichment confirms validity.
Aging rules: IP=30d, Domain=90d, Hash=never, CVE=never.

### FEED CONNECTOR TYPES (10 Types)

| # | Connector Type | Protocol | Auth | Schedule | Example Sources |
|---|---|---|---|---|---|
| 1 | `stix` | STIX 2.1 bundle (JSON) | API key / none | Cron | Custom STIX feeds |
| 2 | `taxii` | TAXII 2.1 client | Basic / API key | Cron | MITRE ATT&CK, CISA |
| 3 | `misp` | MISP REST API | API key + header | Cron | Community MISP instances |
| 4 | `rss` | RSS/Atom feed | None | Cron (15min) | Threat blogs, advisories |
| 5 | `rest_api` | Generic REST | API key / OAuth | Cron | AlienVault OTX, VT, AbuseIPDB |
| 6 | `nvd` | NVD API 2.0 | API key (optional) | Cron (1hr) | NVD vulnerability data |
| 7 | `csv_upload` | File upload | JWT (user) | Manual | Analyst CSV/TSV imports |
| 8 | `json_upload` | File upload | JWT (user) | Manual | Bulk JSON imports |
| 9 | `webhook` | Inbound HTTP POST | HMAC signature | Real-time | SIEM alerts, custom integrations |
| 10 | `email_imap` | IMAP polling | Username/password | Cron (5min) | Threat intel email feeds |

### ARTICLE SCHEMA (with Per-Stage Cost Tracking)

```typescript
import { z } from 'zod'

export const ArticleSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  source_feed_id: z.string().uuid(),

  // Raw content
  title: z.string().max(1000),
  content: z.string(),
  url: z.string().url().optional(),
  published_at: z.coerce.date().optional(),
  author: z.string().optional(),
  language: z.string().length(2).default('en'),  // ISO 639-1

  // Pipeline state
  pipeline_status: z.enum(['ingested', 'triaged', 'extracted', 'enriched', 'deduplicated', 'persisted', 'failed']),
  triage_result: z.any().nullable(),             // TriageResult JSON
  extraction_result: z.any().nullable(),         // CTIExtractionResult JSON
  is_cti_relevant: z.boolean().default(false),

  // Cost tracking per stage
  cost_tracking: z.object({
    stage1_triage_tokens: z.number().default(0),
    stage1_triage_cost_usd: z.number().default(0),
    stage2_extraction_tokens: z.number().default(0),
    stage2_extraction_cost_usd: z.number().default(0),
    stage3_dedup_tokens: z.number().default(0),       // Only if LLM arbitration used
    stage3_dedup_cost_usd: z.number().default(0),
    external_api_calls: z.number().default(0),
    total_cost_usd: z.number().default(0),
  }).default({}),

  // Metadata
  iocs_extracted: z.number().default(0),
  processing_time_ms: z.number().default(0),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
})

export type Article = z.infer<typeof ArticleSchema>
```

### INGESTION API ENDPOINTS

| Method | Endpoint | Description | Auth | Rate |
|---|---|---|---|---|
| GET | `/api/v1/feeds` | List all feeds for tenant | JWT | 100/min |
| POST | `/api/v1/feeds` | Create new feed source | JWT + admin | 50/min |
| GET | `/api/v1/feeds/:id` | Get feed details + health | JWT | 100/min |
| PUT | `/api/v1/feeds/:id` | Update feed config | JWT + admin | 50/min |
| DELETE | `/api/v1/feeds/:id` | Disable feed (soft delete) | JWT + admin | 50/min |
| POST | `/api/v1/feeds/:id/trigger` | Manually trigger feed fetch | JWT + analyst | 10/min |
| GET | `/api/v1/feeds/:id/items` | List ingested items (paginated) | JWT | 100/min |
| GET | `/api/v1/feeds/:id/health` | Feed health status + error log | JWT | 100/min |
| POST | `/api/v1/feeds/upload/csv` | Upload CSV/TSV file of IOCs | JWT + analyst | 10/min |
| POST | `/api/v1/feeds/upload/json` | Upload JSON bundle of IOCs | JWT + analyst | 10/min |
| POST | `/api/v1/feeds/webhook/:token` | Inbound webhook receiver | HMAC | 1000/min |
| GET | `/api/v1/feeds/stats` | Aggregate feed statistics | JWT | 100/min |
| GET | `/api/v1/articles` | List processed articles | JWT | 100/min |
| GET | `/api/v1/articles/:id` | Article detail with pipeline status | JWT | 100/min |
| GET | `/api/v1/articles/:id/cost` | Per-stage cost breakdown for article | JWT + admin | 100/min |

### FEED HEALTH MONITORING

Every feed tracks these health metrics (visible in admin dashboard):
- **last_fetch_at** — Timestamp of last successful fetch
- **last_error_at** — Timestamp of last error
- **last_error_message** — Error detail
- **consecutive_failures** — Counter (auto-disable at 5)
- **items_ingested_24h** — Rolling 24-hour count
- **items_relevant_24h** — CTI-relevant items (post-triage)
- **avg_processing_time_ms** — Average pipeline latency
- **total_cost_24h_usd** — AI cost for this feed in last 24h

Feeds auto-disable after 5 consecutive failures. Admin notified via `feed.health.degraded` event.
