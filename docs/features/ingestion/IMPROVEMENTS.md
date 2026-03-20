# Ingestion Service — 6 Accuracy & Differentiation Modules

**Status:** Implemented (Chunk 2) | **Tests:** 68 tests across 6 modules | **Date:** 2026-03-20

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
