# DECISION-029: Global Feed Processing + Tenant Overlay Architecture

## Context

**Problem:** ETIP currently processes every feed, article, and IOC per-tenant. Same OSINT feed (e.g., CISA KEV) fetched N times, parsed N times, normalized N times, AI-enriched N times for N tenants. At 100 tenants = 100x cost.

**Industry standard:** Recorded Future, Anomali, CrowdStrike all use a 2-layer model — global OSINT processing (once) + per-tenant overlay (custom scores, tags, lifecycle). ETIP needs this to be competitive.

**Cost impact at 100 tenants:**
- Before: ~$20/day (12K feed fetches, 10K IOCs normalized, 10K Haiku calls)
- After: ~$0.30/day (120 fetches, 100 IOCs, 100 Haiku calls) — **98.5% reduction**

## Non-Negotiable Quality Principles

1. **Accuracy is priority** — quality of IOC feeds, cyber news, deduplication, enrichment, entity relations, and reporting must NEVER be compromised by the global model. Global processing must produce identical or better results than per-tenant.
2. **System recommends, super admin decides** — for every AI phase, system shows the recommended model (based on accuracy benchmarks) with a star marker. Super admin is free to pick any model. Recommendation considers accuracy first, cost second.
3. **Real-time cost prediction** — when super admin changes any model selection, the UI instantly shows projected monthly cost based on current article/IOC volume. Shown per-subtask and as a total.
4. **Free plan by default** — all new users/tenants auto-register on Free plan, auto-subscribed to free-tier global feeds (CISA, THN, NVD). No manual setup needed.
5. **Super admin controls plan limits** — maxFeeds, minFetchInterval, retentionDays, maxPrivateFeeds are all editable per plan tier (Free/Starter/Teams/Enterprise). Changes apply to all tenants on that plan immediately.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  GLOBAL LAYER (super-admin controlled, process once) │
│                                                       │
│  Feed Catalog ──→ Fetch ONCE ──→ Parse ONCE           │
│  ──→ Normalize ONCE ──→ AI Enrich ONCE                │
│  ──→ GlobalIoc pool (shared across all tenants)       │
│                                                       │
│  Super Admin AI Config:                               │
│    • IOC Enrichment: model per subtask                │
│    • News Feed Analysis: triage/extraction model      │
│    • Reporting: summarization model                   │
├──────────────────────────────────────────────────────┤
│  TENANT LAYER (per-customer)                          │
│                                                       │
│  Feed Subscriptions → see global IOCs                 │
│  IOC Overlays → custom severity, tags, lifecycle      │
│  Private Feeds → tenant-isolated processing           │
│  Alerts/Correlations → per-tenant rules               │
│  Tenant AI Config → model prefs for private feeds     │
└──────────────────────────────────────────────────────┘
```

---

## Phase Breakdown (4 sessions)

### Phase A — Schema + Global Feed Catalog + Super Admin AI Config (Session 1)

**Scope:** 5 new Prisma models, catalog CRUD, subscription endpoints, global AI model config

#### New Prisma Models

**1. GlobalFeedCatalog** — platform-managed OSINT feeds
```
global_feed_catalog: id, name (unique), description, feedType, url, schedule,
  headers, authConfig, parseConfig, status, enabled, minPlanTier,
  lastFetchAt, consecutiveFailures, totalItemsIngested, feedReliability
```

**2. TenantFeedSubscription** — which tenants see which global feeds
```
tenant_feed_subscriptions: id, tenantId, globalFeedId, enabled, alertConfig
  @@unique([tenantId, globalFeedId])
```

**3. GlobalArticle** — articles from global feeds (no tenantId)
```
global_articles: id, globalFeedId, title, content, url, publishedAt,
  pipelineStatus, isCtiRelevant, triageResult, extractionResult, totalCostUsd
```

**4. GlobalIoc** — shared IOC pool (dedup hash = SHA256(type:value) — NO tenantId)
```
global_iocs: id, globalFeedId, iocType, value, normalizedValue, dedupeHash (unique),
  severity, tlp, confidence, lifecycle, tags, enrichmentData, enrichedAt, firstSeen, lastSeen
```

**5. TenantIocOverlay** — per-tenant customization on global IOCs
```
tenant_ioc_overlays: id, tenantId, globalIocId, customSeverity, customConfidence,
  customLifecycle, customTags, customNotes, overriddenBy, overriddenAt
  @@unique([tenantId, globalIocId])
```

#### Modified Models
- `FeedSource`: add `visibility` enum (`global` | `private`, default `private`)
- `Tenant`: add relations to `TenantFeedSubscription[]`, `TenantIocOverlay[]`

#### Super Admin Global AI Config

Add to customization service — new model `GlobalAiConfig`:
```
global_ai_config: id, category ('ioc_enrichment' | 'news_feed' | 'reporting'),
  subtask, model ('haiku' | 'sonnet' | 'opus'), fallbackModel, updatedBy, updatedAt
  @@unique([category, subtask])
```

**3 categories, each with independent model selection:**

| Category | Subtasks | Default Model |
|----------|----------|---------------|
| `news_feed` | classification, ioc_extraction, deduplication, summarization, keyword_extraction, date_enrichment | haiku/sonnet per stage |
| `ioc_enrichment` | ioc_triage, cve_identification, threat_actor, ttp_mapping, graph_relations, ioc_expiry | haiku |
| `reporting` | executive_summary, trend_analysis, risk_narrative | haiku |

**New API endpoints:**
```
# Feed Catalog
GET  /api/v1/catalog                          — list global feeds (with plan tier gating)
POST /api/v1/catalog                          — add global feed (super_admin only)
PUT  /api/v1/catalog/:id                      — update global feed (super_admin only)
DELETE /api/v1/catalog/:id                    — remove global feed (super_admin only)
POST /api/v1/catalog/:id/subscribe            — tenant subscribes (checks plan limit)
DELETE /api/v1/catalog/:id/unsubscribe        — tenant unsubscribes
GET  /api/v1/catalog/subscriptions            — tenant's active subscriptions

# Global AI Config (super_admin only)
GET  /api/v1/customization/ai/global          — config + recommendations + cost estimate
PUT  /api/v1/customization/ai/global/:category/:subtask — set model (returns updated cost)
POST /api/v1/customization/ai/global/apply-plan — bulk-set by plan tier
GET  /api/v1/customization/ai/global/cost-estimate?changes=... — preview cost for changes

# Plan Limit Management (super_admin only)
GET  /api/v1/customization/plans              — list all plan tiers with limits
PUT  /api/v1/customization/plans/:planId      — update limits for a plan tier
```

**Files to create/modify (~12 files, ~40 tests):**
- `prisma/schema.prisma` — 6 new models, 1 enum, 2 model modifications
- `apps/ingestion/src/repositories/global-feed-repo.ts` — NEW: catalog CRUD
- `apps/ingestion/src/repositories/subscription-repo.ts` — NEW: subscription CRUD
- `apps/ingestion/src/routes/catalog.ts` — NEW: 7 catalog API routes
- `apps/ingestion/src/schemas/catalog.ts` — NEW: Zod validation
- `apps/customization/src/services/global-ai-store.ts` — NEW: global AI config store
- `apps/customization/src/routes/global-ai.ts` — NEW: super admin AI config routes
- `apps/customization/src/schemas/global-ai.ts` — NEW: Zod schemas
- `apps/ingestion/tests/catalog.test.ts` — NEW: ~20 tests
- `apps/customization/tests/global-ai.test.ts` — NEW: ~20 tests
- `packages/shared-utils/src/queues.ts` — add 5 global queue constants
- `packages/shared-utils/src/events.ts` — add GLOBAL_IOC_UPDATED event

**Feature flag:** `TI_GLOBAL_PROCESSING_ENABLED=false` (off by default)

---

### Phase B — Global Processing Pipeline (Session 2)

**Scope:** Global feed scheduling, global fetch/normalize workers, global dedup

#### Key Changes

**1. Scheduler** (`apps/ingestion/src/workers/scheduler.ts`)
- Add `syncGlobalFeeds()` loop alongside existing `syncFeeds()`
- Global feeds: enqueue to `etip-feed-fetch-global-{type}` with NO tenantId
- Gated by `TI_GLOBAL_PROCESSING_ENABLED`

**2. Global Feed Fetch Worker** (`apps/ingestion/src/workers/global-feed-fetch.ts` — NEW)
- Listens on `etip-feed-fetch-global-{rss|nvd|stix|rest}`
- Job payload: `{ globalFeedId, triggeredBy }` — no tenantId
- Reads AI models from global AI config (not per-tenant)
- Persists to `GlobalArticle` table
- Enqueues IOCs to `etip-normalize-global`

**3. Global Normalize Worker** (`apps/normalization/src/workers/global-normalize-worker.ts` — NEW)
- Listens on `etip-normalize-global`
- Uses `buildGlobalDedupeHash(type, value)` — NO tenantId in hash
- Upserts into `global_iocs` table
- Enqueues to `etip-enrich-global`

**4. Dedup Hash Split** (`apps/normalization/src/service.ts`)
```typescript
// NEW: for global IOCs
export function buildGlobalDedupeHash(type: string, value: string): string {
  return createHash('sha256').update(`${type}:${value}`).digest('hex');
}
// EXISTING: unchanged for private feeds
export function buildDedupeHash(type: string, value: string, tenantId: string): string {
  return createHash('sha256').update(`${type}:${value}:${tenantId}`).digest('hex');
}
```

**Queue payloads:**
- `etip-feed-fetch-global-{type}`: `{ globalFeedId, triggeredBy }`
- `etip-normalize-global`: `{ articleId, globalFeedId, feedName, iocs[] }`
- `etip-enrich-global`: `{ globalIocId, iocType, normalizedValue, confidence, severity }`

**Files (~15 files, ~50 tests):**
- `apps/ingestion/src/workers/global-feed-fetch.ts` — NEW
- `apps/ingestion/src/workers/scheduler.ts` — add global sync loop
- `apps/normalization/src/workers/global-normalize-worker.ts` — NEW
- `apps/normalization/src/repositories/global-ioc-repo.ts` — NEW
- `apps/normalization/src/service.ts` — add `buildGlobalDedupeHash()`
- `packages/shared-utils/src/queues.ts` — add global queue constants

---

### Phase C — Global Enrichment + Tenant Overlay API (Session 3)

**Scope:** Global enrichment worker, effective IOC view, overlay CRUD

#### Key Changes

**1. Global Enrich Worker** (`apps/ai-enrichment/src/workers/global-enrich-worker.ts` — NEW)
- Listens on `etip-enrich-global`
- NO tenantId — enrichment is platform-level
- Reads model config from global AI config store (super admin selected models)
- VT/AbuseIPDB called ONCE per unique IOC globally
- Haiku triage called ONCE per unique IOC
- Updates `global_iocs.enrichmentData`
- Enqueues: graph-sync (global node), ioc-indexed (global index)

**2. Platform Cost Tracking** (`apps/ai-enrichment/src/cost-tracker.ts`)
- Add `trackGlobalEnrichment()` — costs attributed to platform, not tenant
- New endpoint: `GET /api/v1/enrichment/cost/global` — super admin only

**3. Effective IOC View** (`apps/ioc-intelligence/src/repository.ts`)
```typescript
// Returns merged view: global IOCs (via subscriptions) + private IOCs + overlays
async getEffectiveIocs(tenantId: string, filters): Promise<EffectiveIoc[]> {
  // 1. Get tenant's subscribed global feed IDs
  // 2. Query global_iocs WHERE globalFeedId IN subscribed_feeds
  // 3. LEFT JOIN tenant_ioc_overlays WHERE tenantId
  // 4. UNION with private iocs WHERE tenantId
  // 5. Apply overlay: customSeverity ?? globalSeverity, etc.
}
```

**4. Overlay CRUD:**
```
PUT    /api/v1/iocs/:globalIocId/overlay    — create/update overlay
DELETE /api/v1/iocs/:globalIocId/overlay    — remove overlay
GET    /api/v1/iocs/effective               — merged global+overlay+private view
GET    /api/v1/iocs/effective/stats         — stats across effective view
```

**Files (~12 files, ~40 tests):**
- `apps/ai-enrichment/src/workers/global-enrich-worker.ts` — NEW
- `apps/ai-enrichment/src/cost-tracker.ts` — add global tracking
- `apps/ioc-intelligence/src/repository.ts` — add effective IOC queries
- `apps/ioc-intelligence/src/routes/effective.ts` — NEW overlay/effective routes
- `apps/elasticsearch-indexing-service/src/es-client.ts` — add `etip_global_iocs` index

---

### Phase D — Frontend + Migration + Onboarding (Session 4)

**Scope:** UI for catalog/subscriptions/overlays, data migration, onboarding rewrite

#### Frontend Changes

**1. Feed Page** — add "Catalog" tab:
- Browse global feeds with Subscribe/Unsubscribe buttons
- "Global" badge (blue) vs "Private" badge (green) on each feed
- Subscriptions don't count toward feed quota
- Super admin: sees "AI Config" section to select models per category

**2. IOC List Page** — effective IOC view:
- Table fetches from `/iocs/effective`
- Source badge: "Global" or "Private"
- Click global IOC → overlay editor drawer (custom severity, tags, notes, lifecycle)

**3. Admin Panel** — super admin AI model config:
- 3 tabs: News Feed | IOC Enrichment | Reporting
- Each tab: table of subtasks with model dropdown (haiku/sonnet/opus)
- "Apply Plan" button (Starter/Professional/Enterprise)
- Cost estimate per configuration

#### Data Migration (SQL + Node.js script)
1. Identify OSINT feeds duplicated across tenants (same URL)
2. Insert into `global_feed_catalog` (one per unique URL)
3. Create `tenant_feed_subscriptions` for each tenant
4. Deduplicate IOCs into `global_iocs` (SHA256 without tenantId)
5. Create `tenant_ioc_overlays` where tenants had custom values
6. Mark migrated FeedSource rows as `visibility = 'migrated'`
7. **Do NOT delete original data** — dual-read for 2 weeks

#### Onboarding Rewrite
- **All new users default to Free plan** — `plan: 'free'` set during registration
- **Auto-subscribe to free-tier global feeds** — CISA RSS, THN, NVD subscribed automatically on tenant creation. No DemoSeeder needed — tenant sees real global IOCs immediately.
- `DemoSeeder.seedFeeds()` → creates subscriptions to global catalog (not feed copies)
- `FeedQuotaStore` → counts only private feeds, global subscriptions gated by `maxGlobalSubscriptions` per plan
- **Plan limits editable** — super admin can change limits via `PUT /customization/plans/:planId`, stored in DB (migrated from hardcoded constants)

**Files (~10 files, ~30 tests):**
- `apps/frontend/src/hooks/use-intel-data.ts` — add catalog/subscription/effective hooks
- `apps/frontend/src/pages/FeedListPage.tsx` — add Catalog tab
- `apps/frontend/src/pages/IocListPage.tsx` — effective view + overlay editor
- `apps/frontend/src/pages/AdminAiConfigPage.tsx` — NEW: super admin AI config
- `apps/onboarding/src/services/demo-seeder.ts` — subscribe instead of clone
- `apps/customization/src/services/feed-quota-store.ts` — exclude subscriptions
- `scripts/migrate-to-global.ts` — NEW: data migration script

---

## Super Admin AI Model Config — Detail

**3 independent config domains. Each subtask shows: system recommendation (★), accuracy tier, and live cost estimate.**

### 1. News Feed Analysis (ingestion pipeline)
| Subtask | Description | Recommended | Accuracy | Injection Point |
|---------|-------------|-------------|----------|-----------------|
| classification | CTI relevance triage | ★ sonnet (~93%) | haiku 85%, sonnet 93%, opus 96% | pipeline.ts → triage.setModel() |
| ioc_extraction | Structured IOC discovery | ★ sonnet (~93%) | haiku 80%, sonnet 93%, opus 96% | pipeline.ts → extraction.setModel() |
| deduplication | Article-level duplicate detection | ★ haiku (~92%) | haiku 92%, sonnet 94%, opus 95% | pipeline.ts → dedupModel |
| summarization | Executive summary generation | ★ sonnet | — | (future) |
| keyword_extraction | Key term identification | ★ haiku | — | (future) |
| date_enrichment | Date normalization | ★ haiku | — | (future) |

### 2. IOC Enrichment (ai-enrichment service)
| Subtask | Description | Recommended | Accuracy | Injection Point |
|---------|-------------|-------------|----------|-----------------|
| ioc_triage | Risk scoring, FP detection, MITRE | ★ sonnet (~93%) | haiku 85%, sonnet 93%, opus 96% | haiku-triage.ts constructor |
| cve_identification | CVE linking | ★ haiku (~90%) | — | (future) |
| threat_actor | Actor attribution | ★ sonnet (~93%) | — | (future) |
| ttp_mapping | MITRE ATT&CK techniques | ★ sonnet (~93%) | — | (future) |
| graph_relations | Entity relationship mapping | ★ haiku (~88%) | — | (future) |
| ioc_expiry | TTL calculation | ★ haiku (~90%) | — | (future) |

### 3. Reporting (reporting service)
| Subtask | Description | Recommended | Accuracy | Injection Point |
|---------|-------------|-------------|----------|-----------------|
| executive_summary | Report narrative generation | ★ sonnet | — | (future) |
| trend_analysis | Trend interpretation | ★ haiku | — | (future) |
| risk_narrative | Risk posture description | ★ sonnet | — | (future) |

### Recommendation Engine

Each subtask has a static `RECOMMENDED_MODELS` map stored in code:
```typescript
const RECOMMENDED_MODELS: Record<string, { model: string; accuracy: number; reason: string }> = {
  'news_feed.classification': { model: 'sonnet', accuracy: 93, reason: 'Best balance of CTI relevance detection accuracy vs cost' },
  'news_feed.ioc_extraction': { model: 'sonnet', accuracy: 93, reason: 'Structured extraction requires reasoning — haiku misses nested IOCs' },
  'news_feed.deduplication': { model: 'haiku', accuracy: 92, reason: 'Dedup is pattern matching — haiku is sufficient and 10x cheaper' },
  'ioc_enrichment.ioc_triage': { model: 'sonnet', accuracy: 93, reason: 'Risk scoring needs nuanced threat context — sonnet significantly better' },
  // ...
}
```

The API returns recommendations alongside current config:
```json
GET /api/v1/customization/ai/global
{
  "config": [
    { "category": "news_feed", "subtask": "classification", "model": "haiku", "fallbackModel": "haiku" }
  ],
  "recommendations": [
    { "category": "news_feed", "subtask": "classification", "recommended": "sonnet", "accuracy": 93, "reason": "...", "isCurrentlyRecommended": false }
  ],
  "costEstimate": {
    "currentMonthly": 4.20,
    "recommendedMonthly": 27.00,
    "perSubtask": [
      { "category": "news_feed", "subtask": "classification", "currentCost": 0.80, "recommendedCost": 5.40 }
    ],
    "basedOnVolume": { "articlesPerMonth": 15000, "iocsPerMonth": 3000 }
  }
}
```

### Cost Prediction Engine

When super admin changes any model, the UI calls:
```
GET /api/v1/customization/ai/global/cost-estimate?changes=news_feed.classification:opus,ioc_enrichment.ioc_triage:opus
```

Returns projected monthly cost based on:
- Last 30 days article volume (from global_articles count)
- Last 30 days IOC volume (from global_iocs count)
- Token pricing: haiku $0.25/$1.25 per 1M in/out, sonnet $3/$15, opus $15/$75
- Average tokens per subtask (measured from cost-tracker history)

The UI shows a live cost bar that updates as the admin toggles models.

### Plan Limit Management (Super Admin)

Super admin can edit plan tier limits dynamically:
```
GET  /api/v1/customization/plans              — list all plan tiers with current limits
PUT  /api/v1/customization/plans/:planId      — update limits for a plan tier
```

Editable fields per plan:
| Field | Free Default | Starter | Teams | Enterprise |
|-------|-------------|---------|-------|------------|
| maxPrivateFeeds | 3 | 10 | 25 | unlimited |
| maxGlobalSubscriptions | 5 | 20 | 50 | unlimited |
| minFetchInterval | 4h | 2h | 30m | 15m |
| retentionDays | 7 | 30 | 90 | unlimited |
| aiEnabled | false | true | true | true |
| dailyTokenBudget | 0 | 10K | 100K | unlimited |

Changes apply immediately to all tenants on that plan. Stored in `PlanTierConfig` table (already exists as hardcoded constants in feed-quota-store.ts — migrate to DB).

### Default Onboarding Flow

1. New user registers → tenant created with `plan: 'free'`
2. Auto-subscribe to free-tier global feeds (CISA RSS, THN, NVD) — no manual action
3. Global pipeline already processing these feeds → tenant immediately sees IOCs
4. Tenant dashboard shows real global data, not demo fallbacks
5. Upgrade to Starter → more global feed subscriptions unlocked + private feeds + AI enabled

**Super admin sets model per subtask per category. Global pipeline reads from this config (5-min TTL cache). Tenants cannot override global pipeline models — they can only configure models for their private feeds.**

---

## Feature Flags

```env
TI_GLOBAL_PROCESSING_ENABLED=false    # Master switch (Phase A-D)
TI_GLOBAL_FEED_SCHEDULING=false       # Phase B: global scheduler
TI_GLOBAL_NORMALIZATION=false         # Phase B: global normalize worker
TI_GLOBAL_ENRICHMENT=false            # Phase C: global enrich worker
TI_IOC_OVERLAY_API=false              # Phase C: overlay endpoints
```

## Rollback Strategy

- **Pre-migration:** `git tag safe-point-pre-global-processing`
- **Phase A:** Drop new tables (no existing data affected)
- **Phase B:** Set `TI_GLOBAL_PROCESSING_ENABLED=false` — workers stop
- **Phase C:** Overlay API is additive — remove routes
- **Phase D:** Keep original `iocs` + `feed_sources` tables for 30 days post-migration

## Verification

After each phase:
1. `pnpm -r test` — all existing tests pass
2. `pnpm --filter frontend exec tsc --noEmit` — 0 errors
3. Phase B: Verify global feed fetched once, article stored in `global_articles`
4. Phase C: Verify enrichment runs once per global IOC, overlay merge returns correct values
5. Phase D: Verify tenant sees subscribed global IOCs + private IOCs, overlay edits persist

## Critical Files

| File | Phase | Change |
|------|-------|--------|
| `prisma/schema.prisma` | A | 6 new models, 1 enum |
| `apps/ingestion/src/workers/scheduler.ts` | B | Add global sync loop |
| `apps/normalization/src/service.ts` | B | `buildGlobalDedupeHash()` (line 45) |
| `apps/ai-enrichment/src/workers/enrich-worker.ts` | C | Global enrich worker |
| `apps/ioc-intelligence/src/repository.ts` | C | Effective IOC view |
| `apps/customization/src/services/global-ai-store.ts` | A | Global AI model config |
| `apps/frontend/src/hooks/use-intel-data.ts` | D | Catalog/subscription hooks |
| `apps/onboarding/src/services/demo-seeder.ts` | D | Subscribe not clone |
