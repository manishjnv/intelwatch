# DECISION-029 v2: Global Feed Processing + Standards-Based Intelligence Leadership

## Context

**Problem:** ETIP processes every feed per-tenant. 100 tenants = 100x cost ($20/day vs $0.30/day).
**Solution:** Global OSINT processing (once) + tenant overlay (custom scores/tags/lifecycle).
**Enhancement:** Add 15 global standards/frameworks to make ETIP a competitive leader vs Recorded Future, Anomali, CrowdStrike, OpenCTI.

**This plan merges:** Original DECISION-029 (12 improvements) + 15 new standards-based accuracy/CX improvements = 27 total improvements across 5 phases.

---

## Non-Negotiable Quality Principles

1. **Accuracy is priority** — global processing must produce equal or better results than per-tenant
2. **System recommends, super admin decides** — star-marked AI model recommendation per phase
3. **Real-time cost prediction** — UI shows projected monthly cost as admin toggles models
4. **Free plan by default** — auto-register free, auto-subscribe to OSINT feeds
5. **Super admin controls plan limits** — editable per tier, changes apply immediately
6. **Standards-first** — every scoring/classification/export follows a named global standard

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  GLOBAL LAYER (process once, enrich once)                      │
│                                                                 │
│  Feed Catalog ──→ Fetch ONCE ──→ Parse ONCE                    │
│  ──→ Normalize ONCE (MISP Warninglists + fuzzy dedup)          │
│  ──→ AI Enrich ONCE (Bayesian confidence + multi-provider)     │
│  ──→ GlobalIoc pool (Admiralty Code + STIX Sightings)          │
│                                                                 │
│  Standards: STIX 2.1, TAXII 2.1, MITRE ATT&CK v14,           │
│  NATO Admiralty Code, FIRST.org EPSS, CPE 2.3, CWE hierarchy  │
├───────────────────────────────────────────────────────────────┤
│  TENANT LAYER (per-customer)                                    │
│                                                                 │
│  Feed Subscriptions + IOC Overlays + Private Feeds              │
│  Alerts/Correlations + Confidence Explainability                │
│  ATT&CK Heatmap + STIX Import/Export                           │
└───────────────────────────────────────────────────────────────┘
```

---

## Standards Coverage (Current → Target)

| Standard | Current | After DECISION-029 v2 | Competitive Edge |
|----------|---------|----------------------|------------------|
| STIX 2.1 | 85% | 95% (+Sightings, +Confidence Tiers) | OpenCTI parity |
| MITRE ATT&CK | 95% | 99% (+sub-technique, +tactic weighting) | CrowdStrike parity |
| NATO Admiralty Code | 0% | 100% (6x6 matrix on all feeds) | Unique in Indian market |
| FIRST.org EPSS | 60% | 95% (+live daily API refresh) | CrowdStrike parity |
| CPE 2.3 | 20% | 90% (+structured URI, NVD extraction) | Recorded Future parity |
| CWE Hierarchy | 40% | 85% (+weakness chains, root cause) | Strategic insight |
| MISP Warninglists | 5% | 90% (+100K known-good indicators) | OpenCTI parity |
| Confidence Model | Linear | Bayesian (+log-odds multi-signal) | Recorded Future+ |

---

## Phase Breakdown (5 sessions: 88-92)

### Phase A1 — Schema + Catalog + Standards Foundation (Session 88)

**Module:** prisma + ingestion + shared-types + shared-normalization
**Do not modify:** frontend, ai-enrichment, customization

#### New Prisma Models (7 models)

**1. GlobalFeedCatalog** — with Admiralty Code + quality metrics
```
global_feed_catalog: id, name (unique), description, feedType, url, schedule,
  headers, authConfig, parseConfig, status, enabled, minPlanTier,
  lastFetchAt, consecutiveFailures, totalItemsIngested, feedReliability,
  # Admiralty Code [NEW-1]
  sourceReliability  String @default("C"),    # A-F (NATO 6-tier)
  infoCred           Int    @default(3),       # 1-6 (info credibility)
  # Quality metrics [ORIG-7]
  articlesPerDay Int @default(0),
  iocsPerDay     Int @default(0),
  avgSeverity    Json @default("{}"),
  industries     String[] @default([]),  # [ORIG-9] industry recommendations
  subscriberCount Int @default(0)
```

**2. TenantFeedSubscription**
```
tenant_feed_subscriptions: id, tenantId, globalFeedId, enabled, alertConfig, subscribedAt
  @@unique([tenantId, globalFeedId])
```

**3. GlobalArticle** — no tenantId
```
global_articles: id, globalFeedId, title, content, url, publishedAt,
  pipelineStatus, isCtiRelevant, triageResult, extractionResult, totalCostUsd
```

**4. GlobalIoc** — with corroboration + consensus + FP + velocity fields
```
global_iocs: id, globalFeedId, iocType, value, normalizedValue,
  dedupeHash     String @unique,           # SHA256(type:value) — NO tenantId
  fuzzyDedupeHash String?,                 # [NEW-6] LSH/canonical hash for near-dedup
  severity, tlp, confidence, lifecycle, tags, enrichmentData, enrichedAt,
  firstSeen, lastSeen,
  # Cross-feed corroboration [ORIG-1]
  sightingSources         String[] @default([]),
  crossFeedCorroboration  Int @default(0),
  # Consensus severity [ORIG-2]
  severityVotes  Json @default("{}"),
  # Community FP [ORIG-4]
  communityFpRate  Float @default(0),
  communityFpCount Int @default(0),
  # Enrichment quality [ORIG-11]
  enrichmentQuality Int @default(0),
  # Trending velocity [ORIG-8]
  velocityScore     Float @default(0),
  velocityUpdatedAt DateTime?,
  # STIX Confidence Tier [NEW-9]
  stixConfidenceTier String @default("Med"),
  # Bayesian confidence [NEW-5]
  confidenceModel    String @default("bayesian"),
  # CPE for CVE IOCs [NEW-2]
  affectedCPEs String[] @default([]),
  # Warninglist match [NEW-7]
  warninglistMatch String?,
  # CWE chain for CVE IOCs [NEW-8]
  cweChain String[] @default([])
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

**7. PlanTierConfig** — editable plan limits
```
plan_tier_config: id, planId (unique), maxPrivateFeeds, maxGlobalSubscriptions,
  minFetchInterval, retentionDays, aiEnabled, dailyTokenBudget, updatedBy, updatedAt
```

#### Standards Utilities (shared packages)

**Admiralty Code [NEW-1]** — `packages/shared-normalization/src/admiralty.ts`
```typescript
// NATO 6x6: Source Reliability (A-F) x Info Credibility (1-6)
// Maps to 0-100 feedReliability: score = (6-reliabilityRank)*14 + (6-credibilityRank)*3
export function admiraltyToScore(source: string, cred: number): number;
export function scoreToAdmiralty(score: number): { source: string; cred: number };
```

**CPE 2.3 Parser [NEW-2]** — `packages/shared-normalization/src/cpe.ts`
```typescript
// Parse cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:* into components
export function parseCPE(uri: string): CPEComponents;
export function matchCPE(cpe: string, target: string): boolean;
```

**STIX Sighting Schema [NEW-3]** — update `packages/shared-types/src/stix.ts`
```typescript
// Add StixSightingSchema: count, first_seen, last_seen, sighting_of_ref, where_sighted_refs
```

#### API Endpoints (ingestion service)
```
GET    /api/v1/catalog                   — list global feeds + quality + Admiralty Code
POST   /api/v1/catalog                   — add global feed (super_admin)
PUT    /api/v1/catalog/:id               — update global feed (super_admin)
DELETE /api/v1/catalog/:id               — remove global feed (super_admin)
POST   /api/v1/catalog/:id/subscribe     — tenant subscribes (plan limit check)
DELETE /api/v1/catalog/:id/unsubscribe   — tenant unsubscribes
GET    /api/v1/catalog/subscriptions     — tenant's active subscriptions
```

#### New Queue Constants + Events
```
FEED_FETCH_GLOBAL_RSS, FEED_FETCH_GLOBAL_NVD, FEED_FETCH_GLOBAL_STIX,
FEED_FETCH_GLOBAL_REST, NORMALIZE_GLOBAL, ENRICH_GLOBAL
Events: GLOBAL_IOC_UPDATED, GLOBAL_IOC_CRITICAL
```

**Files:** ~14 | **Tests:** ~30 | **Feature flag:** `TI_GLOBAL_PROCESSING_ENABLED=false`

---

### Phase A2 — AI Config + Scoring Models + EPSS (Session 89)

**Module:** customization + shared-normalization + vulnerability-intel
**Do not modify:** ingestion, frontend, ai-enrichment

#### Bayesian Confidence Model [NEW-5]

Replace linear weighted sum in `packages/shared-normalization/src/confidence.ts`:

**Current (linear):** `score = 0.35*feedReliability + 0.35*corroboration + 0.30*aiScore * decay`

**New (Bayesian log-odds):**
```typescript
// Convert each signal to log-odds, sum, convert back to probability
// Prior: 0.5 (uninformed). Each signal updates posterior.
// feedReliability from Admiralty Code → prior update
// corroboration (N independent sources) → multiplicative evidence
// aiScore → AI posterior update
// Result: stronger signals compound (2 high-reliability feeds > 4 low-reliability)
export function calculateBayesianConfidence(signals: ConfidenceSignal): CompositeConfidence;
// Keep legacy function with `scoringModel: 'linear' | 'bayesian'` flag
```

**Why:** Linear sum treats signals as independent. Bayesian handles conditional probability — VT 60/72 + AbuseIPDB 95/100 combined should be much higher than either alone.

#### STIX 2.1 Confidence Tiers [NEW-9]

`packages/shared-normalization/src/stix-confidence.ts`:
```typescript
// OASIS STIX 2.1 Section 4.14 semantic tiers
// 0="None", 1-29="Low", 30-69="Med", 70-100="High"
// Sub-tiers: 15="Low-Medium", 45="Med-Medium", 85="High-High"
export function stixConfidenceTier(score: number): string;
```

#### EPSS Live API Integration [NEW-4]

`apps/vulnerability-intel/src/crons/epss-refresh.ts`:
```typescript
// Daily cron: fetch from https://api.first.org/data/v1/epss?cve=CVE-XXXX
// Batch API: 100 CVEs per request. Free, unlimited.
// Update: epssScore, epssPercentile, epssUpdatedAt on GlobalIoc + Vulnerability profiles
```

#### Super Admin AI Config + Recommendations

3 categories, 15 subtasks — same as original plan. **Add `confidenceModel` toggle:**

| Category | Subtask | Recommended | Accuracy |
|----------|---------|------------|----------|
| news_feed | classification | sonnet (93%) | haiku 85%, sonnet 93%, opus 96% |
| news_feed | ioc_extraction | sonnet (93%) | haiku 80%, sonnet 93%, opus 96% |
| news_feed | deduplication | haiku (92%) | haiku 92%, sonnet 94%, opus 95% |
| ioc_enrichment | ioc_triage | sonnet (93%) | haiku 85%, sonnet 93%, opus 96% |
| ioc_enrichment | graph_relations | haiku (88%) | — |
| ... | (15 total) | ... | ... |

**New:** `GET/PUT /customization/ai/global/confidence-model` — switch linear/bayesian

#### Plan Limit Management
```
GET  /api/v1/customization/plans            — list tiers + limits
PUT  /api/v1/customization/plans/:planId    — update limits (super_admin)
```

| Field | Free | Starter | Teams | Enterprise |
|-------|------|---------|-------|------------|
| maxPrivateFeeds | 3 | 10 | 25 | unlimited |
| maxGlobalSubscriptions | 5 | 20 | 50 | unlimited |
| minFetchInterval | 4h | 2h | 30m | 15m |
| retentionDays | 7 | 30 | 90 | unlimited |
| aiEnabled | false | true | true | true |
| dailyTokenBudget | 0 | 10K | 100K | unlimited |

#### Cost Prediction Engine
```
GET /api/v1/customization/ai/global/cost-estimate?changes=news_feed.classification:opus
```
Based on: 30-day article/IOC volume, token pricing per model tier, avg tokens per subtask.

**Files:** ~10 | **Tests:** ~30

---

### Phase B — Global Pipeline + Dedup + FP Reduction (Session 90)

**Module:** ingestion + normalization
**Do not modify:** customization, frontend, ai-enrichment

#### Global Feed Workers

**1. Scheduler** — add `syncGlobalFeeds()` loop (feature-flagged)
**2. Global Feed Fetch Worker** — `global-feed-fetch.ts` (NEW)
- Listens on `etip-feed-fetch-global-{type}`, no tenantId
- Updates catalog quality metrics: articlesPerDay, iocsPerDay [ORIG-7]

**3. Global Normalize Worker** — `global-normalize-worker.ts` (NEW)
- `buildGlobalDedupeHash(type, value)` — NO tenantId
- Cross-feed corroboration [ORIG-1]: append feedId to sightingSources[], recompute score
- Consensus severity [ORIG-2]: increment severityVotes[], compute weighted median
- Trending velocity [ORIG-8]: update velocityScore from sighting frequency

#### Fuzzy Deduplication [NEW-6]

`apps/normalization/src/fuzzy-dedup.ts`:
```typescript
// Layer 1: Exact hash (existing, fast)
// Layer 2: Canonical normalization — RFC 3986 URL canonicalization:
//   lowercase scheme+host, remove default ports, sort query params, strip fragments
//   Domain: strip trailing dots, punycode normalize, case fold
//   IP: strip leading zeros, expand IPv6
// Produces fuzzyDedupeHash for near-duplicate detection
// Does NOT replace exact hash — additional near-match layer
export function buildFuzzyDedupeHash(type: string, value: string): string;
export function canonicalizeUrl(url: string): string;
export function canonicalizeDomain(domain: string): string;
```

#### MISP Warninglists Integration [NEW-7]

`apps/normalization/src/warninglist-store.ts`:
```typescript
// Daily cron: fetch MISP warninglist JSON from GitHub (MIT, free)
// 100+ lists: Alexa Top 1M, Cisco Umbrella, Google IPs, AWS ranges, RFC5737...
// In-memory Map by IOC value for O(1) lookup
// Integration: applyQualityFilters() checks warninglists BEFORE existing SAFE_DOMAINS
// Tag filtered IOCs with "warninglist:{listname}" instead of silently dropping
// Store warninglistMatch on GlobalIoc for analyst visibility
```

**Impact:** 50 safe domains → 100,000+ known-good indicators. Massive FP reduction.

#### CWE Weakness Chain Mapping [NEW-8]

`apps/vulnerability-intel/src/cwe-hierarchy.ts`:
```typescript
// Static map: top 200 CWEs + parent chains
// CWE-79 (XSS) → CWE-20 (Input Validation) parent chain
// Populate cweChain[] on GlobalIoc during normalization
// New endpoint: GET /vulns/weakness-patterns — root-cause clusters
```

#### Feed Reliability Auto-Adjustment [ORIG-5]

6h cron: evaluate tenant overlay override rates. If tenants frequently downgrade a feed's IOC severity, reduce feed reliability. Adjust +-5 points, floor 10, ceiling 100.

**Files:** ~16 | **Tests:** ~55

---

### Phase C — Enrichment + Overlay + Graph + Providers (Session 91)

**Module:** ai-enrichment + ioc-intelligence + threat-graph
**Do not modify:** ingestion, normalization, frontend

#### Global Enrich Worker
- Listens on `etip-enrich-global`, no tenantId
- Reads model config from global AI config store
- VT/AbuseIPDB called ONCE per unique IOC
- Enrichment quality scoring [ORIG-11]: compute quality = f(provider_count, agreement, MITRE completeness)
- Provider consensus display [ORIG-12]: store per-provider results in enrichmentData JSON

#### Multi-Provider: Shodan + GreyNoise [NEW-10]

`apps/ai-enrichment/src/providers/shodan.ts` + `greynoise.ts`:
```typescript
// Shodan: GET /shodan/host/{ip} — ports, OS, ASN, SSL, banners
// GreyNoise: GET /v3/community/{ip} — classification: benign|malicious|unknown
// GreyNoise benign → cap riskScore at 15 (like existing ISP FP detection)
// Both have free tiers. IP-type IOCs only.
// Update countApplicableProviders() in quality-score.ts
```

**Why:** GreyNoise identifies mass-scanners (Shodan crawlers, Censys, academic researchers). Without it, ETIP flags legitimate scanners as threats. Shodan adds infrastructure context.

#### MITRE ATT&CK Sub-Technique + Tactic Weighting [NEW-11]

`apps/normalization/src/mitre-weights.ts`:
```typescript
// TACTIC_SEVERITY_WEIGHT: {TA0001: 'high', TA0003: 'critical', TA0007: 'low', ...}
// TECHNIQUE_TO_TACTIC: reverse lookup (~200 entries from ATT&CK STIX data)
// Replace 5 hardcoded technique IDs in classifySeverity() with:
//   resolve technique → tactic → severity weight → take highest
// Covers 201 techniques + 610 sub-techniques vs current 5
```

#### AI Relationship Extraction to Graph [NEW-12]

After Haiku triage produces `attributedActors`, `malwareFamilies`, `mitreTechniques`:
```typescript
// Emit GRAPH_RELATION_EXTRACTED events with typed relationship tuples:
//   (APT29, USES, CobaltStrike), (CobaltStrike, INDICATES, APT29)
// Threat graph worker consumes events, creates edges with source: 'ai-extracted'
// Validate against RELATIONSHIP_RULES to prevent invalid edges
```

#### Stale Enrichment Re-Processing [ORIG-3]
Daily cron: find GlobalIocs where `enrichedAt < 30d AND lifecycle IN (active, new)`. Re-queue with low priority.

#### Community FP Signal [ORIG-4]
When tenant overlay sets `lifecycle = 'false_positive'`:
- Increment communityFpCount, recompute communityFpRate
- If rate > 0.30: auto-tag "Community FP Signal", reduce confidence 20%
- Never reveal which tenants flagged

#### Global-to-Tenant Alert Propagation [ORIG-10]
After enrichment: if severity=critical OR zero-day CVE → emit GLOBAL_IOC_CRITICAL → alerting service fans out to subscribed tenants.

#### Effective IOC View
```typescript
async getEffectiveIocs(tenantId, filters): Promise<EffectiveIoc[]> {
  // 1. Get subscribed global feed IDs
  // 2. Query global_iocs WHERE globalFeedId IN subscribed + filters
  // 3. LEFT JOIN tenant_ioc_overlays
  // 4. UNION with private iocs WHERE tenantId
  // 5. Merge: overlay.customSeverity ?? global.severity
  // 6. Include: corroboration, enrichmentQuality, communityFpRate, Admiralty Code
}
```

#### Overlay CRUD + Trending
```
PUT    /api/v1/iocs/:globalIocId/overlay  — create/update overlay
DELETE /api/v1/iocs/:globalIocId/overlay  — remove overlay
GET    /api/v1/iocs/effective             — merged view
GET    /api/v1/iocs/effective/stats       — stats
GET    /api/v1/iocs/trending              — top IOCs by velocity [ORIG-8]
```

**Files:** ~15 | **Tests:** ~45

---

### Phase D — Frontend + Migration + Onboarding (Session 92)

**Module:** frontend + onboarding
**Do not modify:** backend services

#### Feed Catalog Page
- "Catalog" tab: browse global feeds with Subscribe/Unsubscribe
- Quality metrics per feed [ORIG-7]: articles/day, IOCs/day, severity distribution
- Admiralty Code badge [NEW-1]: "B2" next to reliability bar
- Industry recommendations [ORIG-9]: "Recommended for your industry"
- "Global" badge (blue) vs "Private" badge (green)

#### IOC List Page — Effective View
- Table fetches from `/iocs/effective`
- Source badge: "Global" or "Private"
- Cross-feed corroboration bar [ORIG-1]
- Consensus severity tooltip [ORIG-2]
- Community FP amber badge [ORIG-4]
- Enrichment quality badge [ORIG-11]
- Provider consensus section [ORIG-12]: VT/AbuseIPDB/Shodan/GreyNoise side-by-side
- Overlay editor drawer (custom severity, tags, notes, lifecycle)

#### Confidence Explainability Panel [NEW-13]

IOC detail panel waterfall chart:
```
Starting: 0
+ Feed Reliability (Admiralty B2):  +27
+ Corroboration (4 sources):       +28
+ AI Score (Sonnet 93%):           +22
- Time Decay (14 days):            -5
- Batch Penalty (batch 50):        -2
= Final Score: 70 (High-Low STIX)
```
Shows confidence history sparkline + STIX semantic tier label.

#### STIX Bundle Import/Export Wizard [NEW-14]

Integration page "STIX Import/Export" section:
- **Import:** drag-and-drop JSON, validate StixBundleSchema, preview entities, conflict resolution (merge/skip/overwrite), include STIX Sightings [NEW-3]
- **Export:** select IOCs by filter, STIX 2.1 bundle download, include Sightings

#### ATT&CK Navigator Heatmap [NEW-15]

New "ATT&CK Coverage" widget/page:
- 14-tactic x N-technique CSS grid
- Color intensity = observation frequency from IOCs + actors + malware
- Click cell → associated IOCs/actors list
- Static ATT&CK Enterprise matrix JSON (MITRE GitHub, MIT licensed)

#### Trending IOCs Widget [ORIG-8]
Dashboard: "Trending Threats (24h)" — top 10 IOCs by cross-feed velocity.

#### Zero-Wait Dashboard [ORIG-6]
New tenant sees real global IOCs within seconds. Welcome: "Monitoring X active IOCs from 3 global feeds."

#### Admin AI Config Panel
- 3 tabs: News Feed | IOC Enrichment | Reporting
- Per subtask: model dropdown + star recommendation + accuracy % + reason tooltip
- Live cost prediction bar
- Confidence model toggle: Linear/Bayesian [NEW-5]
- Plan limits editor

#### Onboarding Rewrite
- Registration → `plan: 'free'` → auto-subscribe to free-tier global feeds
- DemoSeeder creates subscriptions (not feed copies)
- FeedQuotaStore counts only private feeds

#### Data Migration Script
1. Find OSINT feeds duplicated across tenants (same URL)
2. Insert into global_feed_catalog (with Admiralty Code assessment)
3. Create tenant_feed_subscriptions
4. Deduplicate IOCs into global_iocs (hash without tenantId)
5. Create tenant_ioc_overlays where tenants had custom values
6. Do NOT delete original data — dual-read 2 weeks

**Files:** ~12 | **Tests:** ~35

---

## All 27 Improvements — Traceability Matrix

| # | Improvement | Standard | Phase | Accuracy | CX | Status |
|---|-----------|---------|-------|----------|-----|--------|
| O1 | Cross-feed corroboration | Multi-source intel | B | HIGH | MED | Original |
| O2 | Consensus severity | Weighted median | B | HIGH | MED | Original |
| O3 | Stale enrichment re-processing | Lifecycle mgmt | C | MED | LOW | Original |
| O4 | Community FP signal | Crowd wisdom | C | HIGH | MED | Original |
| O5 | Feed reliability auto-adjust | Feedback loop | B | MED | LOW | Original |
| O6 | Zero-wait dashboard | Onboarding UX | D | LOW | HIGH | Original |
| O7 | Feed catalog quality metrics | Catalog UX | A1+B | LOW | HIGH | Original |
| O8 | Trending IOCs widget | Velocity scoring | C+D | MED | HIGH | Original |
| O9 | Industry feed recommendations | Vertical targeting | A1+D | LOW | HIGH | Original |
| O10 | Global-to-tenant alert propagation | Alert fan-out | C | MED | HIGH | Original |
| O11 | Enrichment quality scoring | Quality metrics | C | MED | MED | Original |
| O12 | Provider consensus display | Transparency | D | LOW | HIGH | Original |
| N1 | Admiralty Code source reliability | NATO/FIRST.org SIS | A1 | HIGH | HIGH | **NEW** |
| N2 | CPE 2.3 structured URI | NIST CPE 2.3 | A1 | HIGH | MED | **NEW** |
| N3 | STIX 2.1 Sighting objects | OASIS STIX 2.1 | A1 | MED | HIGH | **NEW** |
| N4 | EPSS live API refresh | FIRST.org EPSS v3 | A2 | HIGH | MED | **NEW** |
| N5 | Bayesian confidence calibration | Bayesian/MISP decay | A2 | HIGH | LOW | **NEW** |
| N6 | Fuzzy dedup (canonical + LSH) | RFC 3986 / ssdeep | B | HIGH | LOW | **NEW** |
| N7 | MISP Warninglists (100K+ FP) | MISP Warninglists | B | HIGH | MED | **NEW** |
| N8 | CWE weakness chain mapping | CWE hierarchy | B | MED | HIGH | **NEW** |
| N9 | STIX confidence scale tiers | OASIS STIX 2.1 s4.14 | A2 | MED | HIGH | **NEW** |
| N10 | Shodan + GreyNoise providers | Industry practice | C | HIGH | MED | **NEW** |
| N11 | ATT&CK sub-technique + tactic weighting | MITRE ATT&CK v14 | C | HIGH | MED | **NEW** |
| N12 | AI relationship extraction to graph | STIX 2.1 SRO | C | MED | HIGH | **NEW** |
| N13 | Confidence explainability panel | FIRST.org TI quality | D | LOW | HIGH | **NEW** |
| N14 | STIX bundle import/export wizard | OASIS STIX 2.1 | D | LOW | HIGH | **NEW** |
| N15 | ATT&CK Navigator heatmap | MITRE ATT&CK Nav | D | LOW | HIGH | **NEW** |

---

## Feature Flags

```env
TI_GLOBAL_PROCESSING_ENABLED=false    # Master switch
TI_GLOBAL_FEED_SCHEDULING=false       # Phase B
TI_GLOBAL_NORMALIZATION=false         # Phase B
TI_GLOBAL_ENRICHMENT=false            # Phase C
TI_IOC_OVERLAY_API=false              # Phase C
TI_BAYESIAN_CONFIDENCE=false          # Phase A2 (toggle scoring model)
```

## Rollback Strategy

- Pre-migration: `git tag safe-point-pre-global-processing`
- Phase A: Drop new tables (no existing data affected)
- Phase B: Set feature flag false — workers stop
- Phase C: Overlay API is additive — remove routes
- Phase D: Keep original tables 30 days post-migration

## Verification Per Phase

1. `pnpm -r test` — all existing tests pass
2. `pnpm --filter frontend exec tsc --noEmit` — 0 errors
3. Phase A1: Admiralty score↔feedReliability round-trips correctly, CPE parser handles NVD URIs
4. Phase A2: Bayesian confidence produces higher scores for multi-source corroboration than linear
5. Phase B: MISP Warninglists suppress Google/AWS IPs, fuzzy dedup catches URL variants
6. Phase C: Shodan/GreyNoise reduce FP for scanner IPs, ATT&CK weighting improves severity accuracy
7. Phase D: Confidence explainability shows waterfall, ATT&CK heatmap renders, STIX import works

---

## Session 88 (Phase A1) — First Task

**Scope:** prisma + ingestion + shared-normalization + shared-types (~14 files, ~30 tests)

**Steps:**
1. `git tag safe-point-2026-03-27-pre-global-processing`
2. Add 7 Prisma models + FeedVisibility enum to `prisma/schema.prisma`
3. Create `packages/shared-normalization/src/admiralty.ts` — Admiralty Code mapping
4. Create `packages/shared-normalization/src/cpe.ts` — CPE 2.3 parser
5. Update `packages/shared-types/src/stix.ts` — add StixSightingSchema
6. Create `apps/ingestion/src/repositories/global-feed-repo.ts` — catalog CRUD
7. Create `apps/ingestion/src/repositories/subscription-repo.ts` — subscription CRUD
8. Create `apps/ingestion/src/routes/catalog.ts` — 7 API routes
9. Create `apps/ingestion/src/schemas/catalog.ts` — Zod validation
10. Add 6 queue constants to `packages/shared-utils/src/queues.ts`
11. Add 2 events to `packages/shared-utils/src/events.ts`
12. Add `TI_GLOBAL_PROCESSING_ENABLED=false` feature flag
13. Write tests: ~30 (catalog CRUD, Admiralty mapping, CPE parsing, STIX Sighting schema)
14. `pnpm -r test` → all pass

## Critical Files (all phases)

| File | Phase | Change |
|------|-------|--------|
| `prisma/schema.prisma` | A1 | 7 new models, 1 enum |
| `packages/shared-normalization/src/admiralty.ts` | A1 | Admiralty Code [NEW-1] |
| `packages/shared-normalization/src/cpe.ts` | A1 | CPE 2.3 parser [NEW-2] |
| `packages/shared-normalization/src/confidence.ts` | A2 | Bayesian model [NEW-5] |
| `packages/shared-normalization/src/stix-confidence.ts` | A2 | STIX tiers [NEW-9] |
| `packages/shared-types/src/stix.ts` | A1 | Sighting SRO [NEW-3] |
| `apps/vulnerability-intel/src/crons/epss-refresh.ts` | A2 | EPSS live [NEW-4] |
| `apps/normalization/src/fuzzy-dedup.ts` | B | Fuzzy dedup [NEW-6] |
| `apps/normalization/src/warninglist-store.ts` | B | MISP Warninglists [NEW-7] |
| `apps/normalization/src/mitre-weights.ts` | C | ATT&CK weighting [NEW-11] |
| `apps/ai-enrichment/src/providers/shodan.ts` | C | Shodan [NEW-10] |
| `apps/ai-enrichment/src/providers/greynoise.ts` | C | GreyNoise [NEW-10] |
| `apps/ingestion/src/workers/scheduler.ts` | B | Global sync loop |
| `apps/ioc-intelligence/src/repository.ts` | C | Effective IOC view |
| `apps/customization/src/services/global-ai-store.ts` | A2 | AI config store |
| `apps/frontend/src/components/ConfidenceExplainer.tsx` | D | Waterfall [NEW-13] |
| `apps/frontend/src/pages/AttackHeatmap.tsx` | D | ATT&CK Nav [NEW-15] |
