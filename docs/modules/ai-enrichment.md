# AI Enrichment Service

**Port:** 3006 | **Queue:** etip-enrich-realtime | **Status:** ✅ Deployed | **Tests:** 125

## What It Does

Receives IOCs from normalization, enriches with VirusTotal, AbuseIPDB, and Haiku AI triage. Computes weighted risk score (backward-compatible: 2-provider or 4-component with AI). Tracks per-IOC enrichment cost with full provider breakdown. Stores results on IOC record. Graceful degradation when providers fail or AI is disabled.

## Pipeline

```
QUEUES.ENRICH_REALTIME → Enrich Worker
  → Check AI gate (TI_AI_ENABLED)
  → VirusTotal lookup (IP/domain/hash/URL — 4/min rate limit) → track cost ($0)
  → AbuseIPDB lookup (IP only — 1000/day rate limit) → track cost ($0)
  → Haiku AI triage (all IOC types — when TI_ANTHROPIC_API_KEY set) → track cost (token-based)
  → Compute risk score:
      Without Haiku: VT 50% + AbuseIPDB 30% + base 20% (backward compat)
      With Haiku:    VT 35% + AbuseIPDB 25% + Haiku 25% + base 15%
  → Determine status: enriched / partial / failed / skipped
  → Merge with existing enrichmentData + costBreakdown on IOC
  → Update Ioc.enrichmentData + enrichedAt
  → Track tenant spend (24h rolling window)
```

## Features

| Feature | File | Description |
|---------|------|-------------|
| VirusTotal Provider | providers/virustotal.ts | VT API v3 — detection rate, tags, analysis date |
| AbuseIPDB Provider | providers/abuseipdb.ts | Abuse score, reports, ISP, country, Tor flag |
| Haiku Triage Provider | providers/haiku-triage.ts | Claude Haiku IOC classifier — riskScore, severity, threatCategory, reasoning, tags. Prompt injection defense via shared-enrichment sanitizer. |
| Cost Tracker | cost-tracker.ts | Per-IOC per-provider cost tracking. Aggregate stats with headline "X IOCs enriched for $Y.YY". Tenant budget alerts. |
| Rate Limiter | rate-limiter.ts | Sliding-window per provider (configurable) |
| Enrich Worker | workers/enrich-worker.ts | BullMQ consumer with job validation |
| Enrichment Service | service.ts | 3-provider pipeline, risk scoring, cost tracking, tenant spend |
| Repository | repository.ts | updateEnrichment, findPending, getStats |

## Degradation Behavior

| Scenario | Result |
|----------|--------|
| TI_AI_ENABLED=false | `skipped` — no API calls, no DB update |
| VT API key empty | VT skipped, AbuseIPDB + Haiku run if applicable |
| Haiku API key empty | Haiku skipped, VT + AbuseIPDB run (backward compat scoring) |
| VT returns 429 | VT null, status `partial` |
| Haiku API error | Returns null, pipeline continues with 2-provider scoring |
| Both external providers fail | Status `failed`, error logged |
| IOC type has no providers | Status `enriched` (nothing to look up) |

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
| TI_ENRICHMENT_CONCURRENCY | 2 | Worker concurrency |
| TI_VT_RATE_LIMIT_PER_MIN | 4 | VT rate limit |
| TI_ABUSEIPDB_RATE_LIMIT_PER_DAY | 1000 | AbuseIPDB rate limit |
