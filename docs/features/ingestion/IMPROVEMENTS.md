# Ingestion Service — 11 Accuracy & Differentiation Modules

**Status:** Implemented (Chunks 2-3) | **Tests:** 133 tests across 11 modules | **Date:** 2026-03-21

## Architecture Overview

All modules live in `apps/ingestion/src/services/`. Each is a standalone class with constructor injection, testable in isolation. They integrate with shared packages (`@etip/shared-normalization`, `@etip/shared-enrichment`, `@etip/shared-utils`) but never modify them.

```
5-Stage Pipeline with Improvements:
  Article → [1] Triage (feedback loop) → [2] Extract (context windowing)
         → [2.5] Enrich (external APIs, cost tracked)
         → [3] Dedup (3-layer) → [4] Persist (corroborated confidence, auto-reliability)
```

---

## Module 1: Corroboration Engine

**File:** `src/services/corroboration.ts` | **Tests:** 13

Tracks IOC sightings across independent feeds. When multiple feeds report the same IOC, confidence is boosted using logarithmic scaling.

**Key Methods:**
- `recordSighting(iocValue, iocType, feedId, tenantId)` — registers a feed sighting
- `getCorroboration(iocValue, iocType, tenantId, baseConfidence)` — returns sighting count, feed list, boosted confidence, and corroboration signal (0-100)
- `calculateFullConfidence(...)` — integrates with `@etip/shared-normalization` composite confidence (4-signal weighted + time decay)

**Confidence Boost Formula:**
```
boostedConfidence = base * (1 + 0.15 * ln(sightingCount))
corroborationSignal = min(100, 20 + 35 * ln(sightingCount))
```

1 feed = 20 signal, 2 feeds = 44, 5 feeds = 76, 10+ feeds = 100.

---

## Module 2: Triage with Feedback Loop

**File:** `src/services/triage.ts` | **Tests:** 10

Stage 1 Haiku classification with per-tenant adaptive learning. Analyst feedback (false positives, confirmations) is stored as few-shot examples in the triage prompt.

**Key Methods:**
- `recordFeedback(articleId, tenantId, title, excerpt, originalResult, action)` — stores analyst correction
- `buildTriagePrompt(article, tenantId)` — constructs system + few-shot + article prompt
- `parseTriageResponse(rawJson)` — type-safe parsing of LLM output
- `buildFewShotExamples(tenantId, limit)` — selects diverse mix of FP + confirmed examples

**Feedback Types:** `confirmed_relevant`, `false_positive`, `escalated`, `downgraded`

Max 50 feedback records per tenant (rolling window, most recent kept).

---

## Module 3: IOC Context Windowing

**File:** `src/services/context-extractor.ts` | **Tests:** 9

Extracts surrounding sentence context (±1 sentence window) for each IOC found in article content. Handles defanged IOC notation.

**Key Methods:**
- `extractIOCContexts(content, iocs)` — returns `IOCContext[]` with value, type, context string, and byte offsets
- `extractSentences(text)` — splits on sentence boundaries
- `findContextWindow(sentences, iocValue)` — finds IOC in sentences, returns surrounding window

**Defang Handling:** Matches `192[.]168[.]1[.]1`, `hxxps://`, `192(.)168(.)1(.)1` automatically.

---

## Module 4: Feed Reliability Auto-Tuner

**File:** `src/services/reliability.ts` | **Tests:** 13

Automatically scores feeds 0-100 based on 4 weighted metrics. Uses exponential moving average (EMA) to prevent sudden score jumps.

**Weighted Formula:**
| Metric | Weight | Source |
|--------|--------|--------|
| Confirmation Rate | 40% | % of IOCs later seen in 2+ feeds |
| False Positive Rate | 30% | % marked FP by analysts (inverted) |
| Freshness Score | 20% | Avg hours to first report (log decay) |
| Uptime Score | 10% | 1 - (failures / maxFailures) |

**EMA Smoothing:** `newScore = alpha * raw + (1 - alpha) * current` (alpha = 0.3 default)

---

## Module 5: 3-Layer Deduplication

**File:** `src/services/dedup.ts` | **Tests:** 12

Three-layer dedup pipeline with increasing precision and cost.

| Layer | Method | Speed | Cost | Threshold |
|-------|--------|-------|------|-----------|
| 1 | Bloom filter (Set) | O(1) | Free | Exact match |
| 2 | Jaccard similarity | O(n*m) | Free | >= 0.85 duplicate, 0.60-0.85 review |
| 3 | LLM arbitration | Slow | ~$0.001 | Ambiguous cases only |

**Key Methods:**
- `dedup(article, existingArticles)` — returns `DedupResult` with `isDuplicate`, `existingId`, `similarityScore`, `dedupLayer`, `action`
- `jaccardSimilarity(setA, setB)` — `|A∩B| / |A∪B|` on IOC value sets
- `buildArbiterPrompt(articleA, articleB)` — LLM comparison prompt (stub)

---

## Module 6: Cost Tracker

**File:** `src/services/cost-tracker.ts` | **Tests:** 11

Per-article per-stage AI cost tracking with tenant budget alerting.

**Model Pricing (per 1M tokens):**
| Model | Input | Output |
|-------|-------|--------|
| Haiku | $0.25 | $1.25 |
| Sonnet | $3.00 | $15.00 |
| Opus | $15.00 | $75.00 |

**Key Methods:**
- `trackStage(articleId, stage, inputTokens, outputTokens, model)` — records cost
- `getArticleCost(articleId)` — full per-stage breakdown
- `checkBudgetAlert(tenantId, dailyLimitUsd)` — returns `BudgetAlert` with `isOverBudget`, `percentUsed`

**Pipeline Stages:** `triage`, `extraction`, `enrichment`, `dedup_llm`, `external_api`

---

## Module 7: Source Triangulation (Competitive Differentiator #1)

**File:** `src/services/source-triangulation.ts` | **Tests:** 12

Independence-weighted corroboration. Two feeds scraping the same upstream blog are NOT independent corroboration — this module tracks co-occurrence patterns and discounts correlated sources.

**Key Concepts:**
- **Feed Overlap Matrix:** Tracks `|A∩B| / min(|A|, |B|)` per feed pair
- **Independence Weight:** 1.0 at <20% overlap, 0.2 at >70% overlap (linear interpolation)
- **Effective Source Count:** Sum of independence weights (first source always 1.0)
- **Genuine Corroboration:** Requires effectiveSources >= 2.0

**Key Methods:**
- `recordSighting(feedId, iocValue)` — registers what each feed reports
- `recordCooccurrence(feedA, feedB, iocValue)` — tracks shared IOCs
- `getOverlap(feedA, feedB)` — returns overlap stats + independence weight
- `triangulate(iocValue, feedIds, baseConfidence)` — independence-weighted confidence boost

**Why it matters:** No major TIP does source independence weighting. Most count raw sighting numbers, inflating confidence when correlated feeds report the same upstream data.

---

## Module 8: Confidence Calibrator (Competitive Differentiator #2)

**File:** `src/services/confidence-calibrator.ts` | **Tests:** 13

Calibrated probability bands for triage. A "0.85 confidence" should mean "85% of articles scored 0.85 are actually CTI-relevant."

**Key Concepts:**
- **10 Decile Bands:** 0.0-0.1, 0.1-0.2, ..., 0.9-1.0
- **Per-Tenant Calibration:** Each tenant's analyst feedback shapes their own curve
- **Blend Formula:** `calibrated = raw * (1-w) + precision * w` where `w = min(0.8, samples/100)`
- **Calibration Error:** Mean absolute |precision - midpoint| across populated bands

**Key Methods:**
- `recordOutcome(tenantId, confidence, wasRelevant)` — accumulates TP/FP per band
- `calibrate(tenantId, rawConfidence)` — returns calibrated score with band data
- `getSummary(tenantId)` — full calibration curve with reliability indicator

**Thresholds:** Min 10 samples/band, min 50 total for reliable calibration.

---

## Module 9: IOC Reactivation Detection (Competitive Differentiator #3)

**File:** `src/services/ioc-reactivation.ts` | **Tests:** 16

Detects when expired/aging IOCs reappear in fresh reports. APT groups routinely re-use infrastructure after cooldown periods.

**Lifecycle State Machine:**
```
NEW → ACTIVE → AGING → EXPIRED → ARCHIVED
                                → FALSE_POSITIVE
       EXPIRED/AGING/ARCHIVED → REACTIVATED → ACTIVE (confirmed)
```

**Aging Thresholds (days since last seen):**
| IOC Type | Aging | Expired (2x) | Never Ages |
|----------|-------|-------------|------------|
| IP | 30 | 60 | — |
| Domain | 90 | 180 | — |
| URL | 60 | 120 | — |
| Hash | — | — | Yes |
| CVE | — | — | Yes |

**Priority Boost on Reactivation:**
- 3+ reactivations OR >90d cooldown → `critical`
- 2 reactivations OR >30d cooldown → `high`
- Otherwise → `normal`

**Key Methods:**
- `recordSighting(iocValue, iocType, tenantId, confidence)` — returns `ReactivationEvent` if reactivated
- `ageIOCs(tenantId)` — periodic aging (call daily)
- `getReactivated(tenantId)` — all currently reactivated IOCs for alerting

---

## Module 10: Predictive Lead-time Scorer (Competitive Differentiator #4)

**File:** `src/services/lead-time-scorer.ts` | **Tests:** 11

Measures how early each feed reports IOCs. Feeds that report 48hrs before mainstream are exponentially more valuable. Surfaced as "Early Warning Score" in the UI.

**Key Concepts:**
- **Lead Time:** Hours ahead of second reporter (first feed gets positive score)
- **First Report Rate:** % of IOCs where this feed was the global first reporter
- **Early Warning Score:** 0-100, weighted 60% time + 40% first-report rate
- **Log Scale:** 48h early = 100, 0h = 50, -48h late = 0

**Key Methods:**
- `recordSighting(feedId, iocValue, iocType, seenAt)` — returns `LeadTimeEvent`
- `getFeedStats(feedId)` — avg/median lead time, early warning score, distribution
- `rankFeeds()` — all feeds ranked by early warning score

**Min IOCs for scoring:** 5 (prevents noisy scores from small samples)

---

## Module 11: Attribution Tracker (Competitive Differentiator #5)

**File:** `src/services/attribution-tracker.ts` | **Tests:** 13

Preserves provenance chain during deduplication. When merging near-duplicates, tracks which feed reported first and which added unique context.

**Key Concepts:**
- **Attribution Chain:** Full history of which feeds contributed what for each IOC
- **Context Deduplication:** Normalized comparison (lowercase, trim, collapse whitespace)
- **TLP Enforcement:** Effective TLP = most restrictive across all contributing feeds
- **Primary Attribution:** Automatically tracks earliest reporter as original source

**Key Methods:**
- `addAttribution(iocValue, iocType, tenantId, attribution)` — builds/extends chain
- `mergeAttributions(iocValues, tenantId, feed, contexts, tlp)` — batch merge for near-dupes
- `getChain(iocValue, iocType, tenantId)` — full provenance chain
- `getContributors(iocValue, iocType, tenantId)` — feeds sorted by report time

**Why it matters:** Competitors merge and lose provenance. Keeping the full chain enables TLP compliance, legal defensibility, and analyst trust
