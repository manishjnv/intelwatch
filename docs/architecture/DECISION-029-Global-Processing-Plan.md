# DECISION-029: Global Feed Processing + Tenant Overlay Architecture

## Context

**Problem:** Per-tenant feed processing scales linearly: N tenants = Nx cost. At 100 tenants = $20/day vs $0.30/day with global processing.

**Industry standard:** Recorded Future, Anomali, CrowdStrike use global processing + tenant overlay.

**Cost reduction:** ~98.5% at 100 tenants.

## Non-Negotiable Quality Principles

1. **Accuracy is priority** — global processing must produce identical or better results than per-tenant
2. **System recommends, super admin decides** — star-marked recommendation per AI phase, super admin overrides freely
3. **Real-time cost prediction** — UI shows projected monthly cost as admin toggles models
4. **Free plan by default** — auto-register free, auto-subscribe to OSINT feeds, see real IOCs within seconds
5. **Super admin controls plan limits** — editable per tier, changes apply immediately

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  GLOBAL LAYER (super-admin controlled, process once)      │
│                                                            │
│  Feed Catalog ──→ Fetch ONCE ──→ Parse ONCE                │
│  ──→ Normalize ONCE (cross-feed corroboration scoring)     │
│  ──→ AI Enrich ONCE (consensus severity, quality scoring)  │
│  ──→ GlobalIoc pool (shared, trending, community FP)       │
│                                                            │
│  Super Admin AI Config: model per subtask per category     │
│  Global-to-Tenant Alert Propagation: critical IOC push     │
├──────────────────────────────────────────────────────────┤
│  TENANT LAYER (per-customer)                               │
│                                                            │
│  Feed Subscriptions → see global IOCs + quality metrics    │
│  IOC Overlays → custom severity, tags, lifecycle, notes    │
│  Private Feeds → tenant-isolated processing                │
│  Alerts/Correlations → per-tenant rules on effective IOCs  │
│  Trending IOCs → cross-feed velocity dashboard widget      │
└──────────────────────────────────────────────────────────┘
```

---

## Phase Breakdown (5 sessions)

### Phase A1 — Schema + Global Feed Catalog (Session 88)

**Module:** prisma + ingestion | **Do not modify:** customization, frontend, ai-enrichment

#### New Prisma Models

**1. GlobalFeedCatalog** — platform-managed OSINT feeds
```
global_feed_catalog: id, name (unique), description, feedType, url, schedule,
  headers, authConfig, parseConfig, status, enabled, minPlanTier,
  lastFetchAt, consecutiveFailures, totalItemsIngested, feedReliability,
  # Quality metrics for catalog browsing (improvement #7)
  articlesPerDay Int @default(0),
  iocsPerDay Int @default(0),
  avgSeverity Json @default("{}"),   # { critical: 5, high: 20, medium: 50 }
  industries String[] @default([]),   # for industry-based recommendations (#9)
  subscriberCount Int @default(0)
```

**2. TenantFeedSubscription**
```
tenant_feed_subscriptions: id, tenantId, globalFeedId, enabled, alertConfig,
  subscribedAt
  @@unique([tenantId, globalFeedId])
```

**3. GlobalArticle** — no tenantId
```
global_articles: id, globalFeedId, title, content, url, publishedAt,
  pipelineStatus, isCtiRelevant, triageResult, extractionResult, totalCostUsd
```

**4. GlobalIoc** — shared IOC pool with accuracy enhancements
```
global_iocs: id, globalFeedId, iocType, value, normalizedValue,
  dedupeHash (unique, SHA256 type:value — NO tenantId),
  severity, tlp, confidence, lifecycle, tags, enrichmentData, enrichedAt,
  firstSeen, lastSeen,
  # Cross-feed corroboration (#1)
  sightingSources String[] @default([]),       # feed IDs that reported this IOC
  crossFeedCorroboration Int @default(0),      # 0-100 score based on source count + reliability
  # Consensus severity (#2)
  severityVotes Json @default("{}"),           # { critical: 2, high: 3, medium: 1 }
  # Community FP signal (#4)
  communityFpRate Float @default(0),           # 0.0-1.0, % of tenants marking FP
  communityFpCount Int @default(0),
  # Enrichment quality (#11)
  enrichmentQuality Int @default(0),           # 0-100, based on provider coverage + consensus
  # Trending velocity (#8)
  velocityScore Float @default(0),             # cross-feed sighting velocity (24h window)
  velocityUpdatedAt DateTime?
```

**5. TenantIocOverlay**
```
tenant_ioc_overlays: id, tenantId, globalIocId, customSeverity, customConfidence,
  customLifecycle, customTags, customNotes, overriddenBy, overriddenAt
  @@unique([tenantId, globalIocId])
```

**6. GlobalAiConfig** — super admin AI model per subtask
```
global_ai_config: id, category, subtask, model, fallbackModel, updatedBy, updatedAt
  @@unique([category, subtask])
```

**7. PlanTierConfig** — editable plan limits (migrated from hardcoded)
```
plan_tier_config: id, planId (unique), maxPrivateFeeds, maxGlobalSubscriptions,
  minFetchInterval, retentionDays, aiEnabled, dailyTokenBudget, updatedBy, updatedAt
```

#### Modified Models
- `FeedSource`: add `visibility` enum (`global` | `private`, default `private`)
- `Tenant`: add relations to subscriptions + overlays

#### API Endpoints (ingestion service)
```
GET    /api/v1/catalog                     — list global feeds + quality metrics (#7)
POST   /api/v1/catalog                     — add global feed (super_admin)
PUT    /api/v1/catalog/:id                 — update global feed (super_admin)
DELETE /api/v1/catalog/:id                 — remove global feed (super_admin)
POST   /api/v1/catalog/:id/subscribe       — tenant subscribes (plan limit check)
DELETE /api/v1/catalog/:id/unsubscribe     — tenant unsubscribes
GET    /api/v1/catalog/subscriptions       — tenant's active subscriptions
```

#### New Queue Constants (shared-utils)
```
FEED_FETCH_GLOBAL_RSS, FEED_FETCH_GLOBAL_NVD, FEED_FETCH_GLOBAL_STIX,
FEED_FETCH_GLOBAL_REST, NORMALIZE_GLOBAL, ENRICH_GLOBAL
```

#### New Events
```
GLOBAL_IOC_UPDATED, GLOBAL_IOC_CRITICAL (for alert propagation #10)
```

**Files:** ~10 | **Tests:** ~25 | **Feature flag:** `TI_GLOBAL_PROCESSING_ENABLED=false`

---

### Phase A2 — Super Admin AI Config + Plan Limits (Session 89)

**Module:** customization | **Do not modify:** ingestion, frontend, ai-enrichment

#### Global AI Config with Recommendations

**3 categories, 15 subtasks, each with system recommendation (★):**

| Category | Subtask | ★ Recommended | Accuracy |
|----------|---------|---------------|----------|
| news_feed | classification | ★ sonnet (93%) | haiku 85%, sonnet 93%, opus 96% |
| news_feed | ioc_extraction | ★ sonnet (93%) | haiku 80%, sonnet 93%, opus 96% |
| news_feed | deduplication | ★ haiku (92%) | haiku 92%, sonnet 94%, opus 95% |
| news_feed | summarization | ★ sonnet | — |
| news_feed | keyword_extraction | ★ haiku | — |
| news_feed | date_enrichment | ★ haiku | — |
| ioc_enrichment | ioc_triage | ★ sonnet (93%) | haiku 85%, sonnet 93%, opus 96% |
| ioc_enrichment | cve_identification | ★ haiku (90%) | — |
| ioc_enrichment | threat_actor | ★ sonnet (93%) | — |
| ioc_enrichment | ttp_mapping | ★ sonnet (93%) | — |
| ioc_enrichment | graph_relations | ★ haiku (88%) | — |
| ioc_enrichment | ioc_expiry | ★ haiku (90%) | — |
| reporting | executive_summary | ★ sonnet | — |
| reporting | trend_analysis | ★ haiku | — |
| reporting | risk_narrative | ★ sonnet | — |

#### Recommendation Engine
Static `RECOMMENDED_MODELS` map in code. API returns recommendations alongside current config. Each entry: `{ model, accuracy, reason, isCurrentlyRecommended }`.

#### Cost Prediction Engine
```
GET /api/v1/customization/ai/global/cost-estimate?changes=news_feed.classification:opus
```
Returns projected monthly cost based on:
- Last 30 days article/IOC volume from global tables
- Token pricing per model tier
- Average tokens per subtask from cost-tracker history

#### Plan Limit Management
```
GET  /api/v1/customization/plans              — list all tiers + limits
PUT  /api/v1/customization/plans/:planId      — update limits (super_admin)
```

| Field | Free | Starter | Teams | Enterprise |
|-------|------|---------|-------|------------|
| maxPrivateFeeds | 3 | 10 | 25 | unlimited |
| maxGlobalSubscriptions | 5 | 20 | 50 | unlimited |
| minFetchInterval | 4h | 2h | 30m | 15m |
| retentionDays | 7 | 30 | 90 | unlimited |
| aiEnabled | false | true | true | true |
| dailyTokenBudget | 0 | 10K | 100K | unlimited |

#### API Endpoints
```
GET  /api/v1/customization/ai/global                      — config + recommendations + cost
PUT  /api/v1/customization/ai/global/:category/:subtask   — set model (returns updated cost)
POST /api/v1/customization/ai/global/apply-plan            — bulk-set by tier
GET  /api/v1/customization/ai/global/cost-estimate         — preview cost for changes
GET  /api/v1/customization/plans                           — list plan tiers
PUT  /api/v1/customization/plans/:planId                   — update plan limits
```

**Files:** ~8 | **Tests:** ~25

---

### Phase B — Global Processing Pipeline + Corroboration (Session 90)

**Module:** ingestion + normalization | **Do not modify:** customization, frontend, ai-enrichment

#### Key Changes

**1. Scheduler** — add `syncGlobalFeeds()` loop (gated by feature flag)

**2. Global Feed Fetch Worker** (NEW: `global-feed-fetch.ts`)
- Listens on `etip-feed-fetch-global-{type}`, no tenantId
- Reads AI models from global AI config (super admin selected)
- Persists to GlobalArticle, enqueues to `etip-normalize-global`
- Updates catalog quality metrics: articlesPerDay, iocsPerDay (#7)

**3. Global Normalize Worker** (NEW: `global-normalize-worker.ts`)
- `buildGlobalDedupeHash(type, value)` — NO tenantId in hash
- Upserts into global_iocs table
- **Cross-feed corroboration (#1):** on upsert, append feedId to `sightingSources[]`, recompute `crossFeedCorroboration` score = weighted sum of unique source reliabilities
- **Consensus severity (#2):** increment `severityVotes[detectedSeverity]`, compute weighted median as global severity
- **Trending velocity (#8):** update `velocityScore` based on sighting frequency in 24h window
- Enqueues to `etip-enrich-global`

**4. Dedup Hash Split** (`normalization/service.ts`)
```typescript
export function buildGlobalDedupeHash(type: string, value: string): string {
  return createHash('sha256').update(`${type}:${value}`).digest('hex');
}
// Existing per-tenant function unchanged
```

**5. Feed Reliability Auto-Adjustment (#5)**
- Track override rate: when overlay downgrades feed's IOC severity frequently, reduce feed reliability
- Cron: evaluate every 6h, adjust ±5 points, floor 10, ceiling 100

**Files:** ~15 | **Tests:** ~50

---

### Phase C — Global Enrichment + Overlay + Alerts (Session 91)

**Module:** ai-enrichment + ioc-intelligence | **Do not modify:** ingestion, normalization, frontend

#### Key Changes

**1. Global Enrich Worker** (NEW: `global-enrich-worker.ts`)
- Listens on `etip-enrich-global`, no tenantId
- Reads model config from global AI config store
- VT/AbuseIPDB/AI called ONCE per unique IOC
- **Enrichment quality scoring (#11):** after enrichment, compute `enrichmentQuality` = f(provider_count, provider_agreement, MITRE_completeness, geo_coverage). Store on GlobalIoc.
- **Provider consensus display (#12):** store per-provider results in enrichmentData JSON for UI breakdown
- Updates global_iocs.enrichmentData + enrichedAt

**2. Stale Enrichment Re-Processing (#3)**
- Cron: daily, find GlobalIocs where `enrichedAt < 30d AND lifecycle IN (active, new)`
- Re-queue to `etip-enrich-global` with priority=5 (low)
- Cost: minimal since global (once), all tenants benefit

**3. Community FP Signal (#4)**
- When tenant creates overlay with `customLifecycle = 'false_positive'`:
  - Increment `communityFpCount` on GlobalIoc
  - Recompute `communityFpRate` = fpCount / subscriberCount
  - If rate > 0.30: auto-tag "Community FP Signal", reduce confidence by 20%
- Never reveal which tenants flagged

**4. Global-to-Tenant Alert Propagation (#10)**
- After enrichment, if severity=critical OR new zero-day CVE:
  - Emit `GLOBAL_IOC_CRITICAL` event with globalIocId
  - Alerting service receives event, queries all subscribed tenants
  - Evaluates each tenant's alert rules against the IOC
  - Pushes notifications to matching tenants
- Tenant gets: "Critical IOC from CISA feed matches your alert rule"

**5. Effective IOC View** (`ioc-intelligence/repository.ts`)
```typescript
async getEffectiveIocs(tenantId, filters): Promise<EffectiveIoc[]> {
  // 1. Get subscribed global feed IDs
  // 2. Query global_iocs WHERE globalFeedId IN subscribed + filters
  // 3. LEFT JOIN tenant_ioc_overlays
  // 4. UNION with private iocs WHERE tenantId
  // 5. Merge: overlay.customSeverity ?? global.severity, etc.
  // 6. Include: crossFeedCorroboration, enrichmentQuality, communityFpRate
}
```

**6. Overlay CRUD + Trending Endpoint**
```
PUT    /api/v1/iocs/:globalIocId/overlay    — create/update overlay
DELETE /api/v1/iocs/:globalIocId/overlay    — remove overlay
GET    /api/v1/iocs/effective               — merged view
GET    /api/v1/iocs/effective/stats         — stats across effective view
GET    /api/v1/iocs/trending                — top IOCs by cross-feed velocity (#8)
```

**Files:** ~12 | **Tests:** ~40

---

### Phase D — Frontend + Migration + Onboarding (Session 92)

**Module:** frontend + onboarding | **Do not modify:** backend services

#### Frontend Changes

**1. Feed Catalog Page**
- New "Catalog" tab: browse global feeds with Subscribe/Unsubscribe
- **Quality metrics per feed (#7):** articles/day, IOCs/day, severity distribution, subscriber count
- "Global" badge (blue) vs "Private" badge (green)
- **Industry recommendations (#9):** "Recommended for your industry" section
- Subscriptions don't count toward private feed quota

**2. IOC List Page — Effective View**
- Table fetches from `/iocs/effective`
- Source badge: "Global" or "Private"
- **Cross-feed corroboration indicator (#1):** show source count + corroboration score as a bar
- **Consensus severity display (#2):** tooltip shows severity vote breakdown
- **Community FP warning (#4):** amber badge if communityFpRate > 0.15
- **Enrichment quality indicator (#11):** quality score badge (green/amber/red)
- Click global IOC → overlay editor drawer (custom severity, tags, notes, lifecycle)
- **Provider consensus section (#12):** VT/AbuseIPDB/AI results side-by-side in detail panel

**3. Trending IOCs Widget (#8)**
- Dashboard widget: "Trending Threats (24h)"
- Top 10 IOCs by cross-feed velocity
- Shows: IOC value, type, source count, velocity spark, severity

**4. Admin AI Config Panel**
- 3 tabs: News Feed | IOC Enrichment | Reporting
- Each subtask: model dropdown + ★ recommendation + accuracy % + reason tooltip
- Live cost prediction bar updates on each change
- "Apply Plan" bulk-set button
- Plan Limits editor: table of all tiers, editable fields

**5. Zero-Wait Dashboard (#6)**
- New tenant sees real global IOCs within seconds of registration
- Welcome message: "Monitoring X active IOCs from 3 global feeds"
- No demo fallback needed for subscribed feeds

#### Onboarding Rewrite
- Registration → `plan: 'free'` → auto-subscribe to free-tier global feeds
- Global pipeline already running → tenant immediately sees IOCs
- DemoSeeder creates subscriptions (not feed copies)
- FeedQuotaStore counts only private feeds

#### Data Migration Script (`scripts/migrate-to-global.ts`)
1. Find OSINT feeds duplicated across tenants (same URL)
2. Insert into global_feed_catalog
3. Create tenant_feed_subscriptions for each tenant
4. Deduplicate IOCs into global_iocs (hash without tenantId)
5. Create tenant_ioc_overlays where tenants had custom values
6. Mark migrated FeedSource as `visibility = 'migrated'`
7. Do NOT delete original data — dual-read 2 weeks

**Files:** ~10 | **Tests:** ~30

---

## Feature Flags

```env
TI_GLOBAL_PROCESSING_ENABLED=false    # Master switch
TI_GLOBAL_FEED_SCHEDULING=false       # Phase B
TI_GLOBAL_NORMALIZATION=false         # Phase B
TI_GLOBAL_ENRICHMENT=false            # Phase C
TI_IOC_OVERLAY_API=false              # Phase C
```

## Rollback Strategy

- Pre-migration: `git tag safe-point-pre-global-processing`
- Phase A: Drop new tables (no existing data affected)
- Phase B: Set feature flag false — workers stop
- Phase C: Overlay API is additive — remove routes
- Phase D: Keep original tables 30 days post-migration

## Verification

After each phase:
1. `pnpm -r test` — all existing tests pass
2. `pnpm --filter frontend exec tsc --noEmit` — 0 errors
3. Phase B: Global feed fetched once, corroboration score computed
4. Phase C: Enrichment once per IOC, overlay merge correct, trending endpoint returns data
5. Phase D: Tenant sees global IOCs immediately, overlay edits persist, trending widget works

## Improvement Traceability

| # | Improvement | Phase | Field/Endpoint |
|---|-----------|-------|----------------|
| 1 | Cross-feed corroboration | B | GlobalIoc.sightingSources, crossFeedCorroboration |
| 2 | Consensus severity | B | GlobalIoc.severityVotes, weighted median |
| 3 | Stale enrichment re-processing | C | Daily cron, re-queue >30d IOCs |
| 4 | Community FP signal | C | GlobalIoc.communityFpRate, overlay trigger |
| 5 | Feed reliability auto-adjustment | B | 6h cron, overlay override rate feedback |
| 6 | Zero-wait dashboard | D | Auto-subscribe on registration |
| 7 | Feed catalog quality metrics | A1+B | articlesPerDay, iocsPerDay, avgSeverity |
| 8 | Trending IOCs widget | C+D | GlobalIoc.velocityScore, GET /iocs/trending |
| 9 | Industry-based recommendations | A1+D | GlobalFeedCatalog.industries[], onboarding |
| 10 | Global-to-tenant alert propagation | C | GLOBAL_IOC_CRITICAL event fan-out |
| 11 | Enrichment quality scoring | C | GlobalIoc.enrichmentQuality |
| 12 | Provider consensus display | D | enrichmentData JSON breakdown in UI |
