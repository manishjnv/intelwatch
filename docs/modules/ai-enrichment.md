# AI Enrichment Service

**Port:** 3006 | **Queue:** etip-enrich-realtime | **Status:** ✅ Deployed | **Tests:** 289

## What It Does

Receives IOCs from normalization, enriches with VirusTotal, AbuseIPDB, Google Safe Browsing, and Haiku AI triage. Computes weighted risk score (backward-compatible: 2-provider or 4-component with AI). Tracks per-IOC enrichment cost with full provider breakdown. Stores results on IOC record. Graceful degradation when providers fail or AI is disabled. Redis enrichment cache with type-specific TTLs. Budget enforcement gate with rule-based fallback. Confidence feedback loop wires AI score back into composite confidence formula.

## Pipeline

```
QUEUES.ENRICH_REALTIME → Enrich Worker
  → Check AI gate (TI_AI_ENABLED)
  → Check Redis cache (type-specific TTL) → return cached if hit (#6)
  → VirusTotal lookup (IP/domain/hash/URL — 4/min rate limit) → track cost ($0)
  → AbuseIPDB lookup (IP only — 1000/day rate limit) → track cost ($0)
  → Google Safe Browsing lookup (url/domain/fqdn — 8000/day, batch 500 URLs/call)
  → Budget gate check (#5):
      ≥100% budget → skip Haiku, use rule-based scorer ($0)
      ≥90% budget → use rule-based scorer ($0)
      <90% budget → call Haiku normally
  → Haiku AI triage (structured output — when under budget):
      risk_score, confidence, severity, threat_category, reasoning, tags
      + score_justification, evidence_sources, uncertainty_factors (#1)
      + mitre_techniques[] with T-code validation (#2)
      + isFalsePositive, falsePositiveReason → severity override to INFO (#3)
      + malwareFamilies[], attributedActors[] (#7)
      + recommendedActions[] max 5 with priority levels (#8)
  → Compute risk score:
      Without Haiku: VT 50% + AbuseIPDB 30% + base 20% (backward compat)
      With Haiku:    VT 35% + AbuseIPDB 25% + Haiku 25% + base 15%
  → Confidence feedback loop (#4):
      Feed riskScore as aiScore (weight 0.30) → calculateCompositeConfidence()
      Update IOC.confidence in DB
  → Determine status: enriched / partial / failed / skipped
  → Merge with existing enrichmentData + costBreakdown on IOC
  → Cache result in Redis (enriched only) (#6)
  → Track tenant spend (24h rolling window)
```

## Features

| Feature | File | Description |
|---------|------|-------------|
| VirusTotal Provider | providers/virustotal.ts | VT API v3 — detection rate, tags, analysis date |
| AbuseIPDB Provider | providers/abuseipdb.ts | Abuse score, reports, ISP, country, Tor flag |
| Google Safe Browsing Provider | providers/google-safe-browsing.ts | GSB Lookup API v4 — malware/phishing/unwanted software verdicts for URLs and domains. Batch support (up to 500 URLs per call). 8,000/day budget. |
| Haiku Triage Provider | providers/haiku-triage.ts | Claude Haiku IOC classifier — structured output with evidence chain, MITRE mapping, FP detection, malware/actor extraction, recommended actions. Prompt injection defense via shared-enrichment sanitizer. |
| Cost Tracker | cost-tracker.ts | Per-IOC per-provider cost tracking. Aggregate stats with headline. Tenant budget alerts. |
| Rule-Based Scorer | rule-based-scorer.ts | Fallback scorer when budget >= 90%. Deterministic VT+AbuseIPDB scoring, CDN FP detection, $0 cost. (#5) |
| Enrichment Cache | cache.ts | Redis cache with type-specific TTLs: hash=7d, IP=1h, domain=24h, URL=12h, CVE=12h. (#6) |
| Rate Limiter | rate-limiter.ts | Sliding-window per provider (configurable) |
| Enrich Worker | workers/enrich-worker.ts | BullMQ consumer with job validation |
| Enrichment Service | service.ts | 4-provider pipeline (VT → AbuseIPDB → GSB → Haiku), budget gate, risk scoring, confidence feedback loop, cache integration, cost tracking |
| Repository | repository.ts | updateEnrichment, updateConfidence, findPending, getStats |

## Accuracy Improvements (Session 22)

| # | Improvement | Status |
|---|-------------|--------|
| 1 | Structured Evidence Chain (scoreJustification, evidenceSources, uncertaintyFactors) | ✅ Done |
| 2 | MITRE ATT&CK Technique Extraction (T-code regex validated) | ✅ Done |
| 3 | False Positive Detection (isFalsePositive, severity→INFO override, CDN/sinkhole) | ✅ Done |
| 4 | Confidence Feedback Loop (aiScore → calculateCompositeConfidence → update IOC) | ✅ Done |
| 5 | Budget Enforcement Gate (100% skip, 90% rule-based fallback) | ✅ Done |
| 6 | Redis Enrichment Cache (type-specific TTLs) | ✅ Done |
| 7 | Malware Family + Threat Actor Extraction | ✅ Done |
| 8 | Recommended Actions Generation (max 5, priority levels) | ✅ Done |
| 9 | STIX 2.1 Label Generation | 📋 Session 23 |
| 10 | Enrichment Quality Score | 📋 Session 23 |
| 11 | Prompt Caching (90% token savings) | 📋 Session 23 |
| 12 | Geolocation Enrichment | 📋 Session 23 |
| 13 | Batch Enrichment via Anthropic Batch API | 📋 Session 23 |
| 14 | Cost Persistence to Redis | 📋 Session 23 |
| 15 | Re-enrichment Scheduler | 📋 Session 23 |

## Degradation Behavior

| Scenario | Result |
|----------|--------|
| TI_AI_ENABLED=false | `skipped` — no API calls, no DB update |
| VT API key empty | VT skipped, AbuseIPDB + Haiku run if applicable |
| GSB API key empty | GSB skipped, VT + AbuseIPDB + Haiku run normally |
| GSB returns 429 | GSB null, enrichment continues without GSB verdict |
| Haiku API key empty | Haiku skipped, VT + AbuseIPDB run (backward compat scoring) |
| VT returns 429 | VT null, status `partial` |
| Haiku API error | Returns null, pipeline continues with 2-provider scoring |
| Budget >= 90% | Rule-based fallback ($0 cost), VT + AbuseIPDB still run |
| Budget >= 100% | Rule-based fallback ($0 cost), Haiku skipped entirely |
| Both external providers fail | Status `failed`, error logged |
| IOC type has no providers | Status `enriched` (nothing to look up) |
| Redis unavailable | Cache disabled, enrichment runs normally |
| Cache hit | Return cached result immediately, $0 cost |
| Confidence update fails | Non-fatal — logged, enrichment continues |

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | - | Health check |
| POST | /api/v1/enrichment/trigger | JWT | Queue IOC for enrichment (priority 1) |
| GET | /api/v1/enrichment/stats | JWT | `{total, enriched, pending}` |
| GET | /api/v1/enrichment/pending | JWT | List IOCs awaiting enrichment |
| GET | /api/v1/enrichment/cost/stats | JWT | Aggregate cost stats with headline |
| GET | /api/v1/enrichment/cost/ioc/:iocId | JWT | Per-IOC cost breakdown by provider |
| GET | /api/v1/enrichment/cost/budget | JWT | Tenant budget status |

## Config

| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_ENRICHMENT_PORT | 3006 | Service port |
| TI_AI_ENABLED | false | Master switch for all enrichment |
| TI_VIRUSTOTAL_API_KEY | (empty) | VT API key |
| TI_ABUSEIPDB_API_KEY | (empty) | AbuseIPDB key |
| TI_ANTHROPIC_API_KEY | (empty) | Anthropic API key for Haiku triage |
| TI_HAIKU_MODEL | claude-haiku-4-5-20251001 | Haiku model ID |
| TI_ENRICHMENT_DAILY_BUDGET_USD | 5.00 | Daily cost budget per tenant (0 = unlimited) |
| TI_ENRICHMENT_CACHE_ENABLED | true | Enable Redis enrichment cache |
| TI_ENRICHMENT_CONCURRENCY | 2 | Worker concurrency |
| TI_VT_RATE_LIMIT_PER_MIN | 4 | VT rate limit |
| TI_ABUSEIPDB_RATE_LIMIT_PER_DAY | 1000 | AbuseIPDB rate limit |
| TI_GSB_API_KEY | (empty) | Google Safe Browsing API key |
| TI_GSB_RATE_LIMIT_PER_DAY | 8000 | GSB rate limit (API calls/day) |
