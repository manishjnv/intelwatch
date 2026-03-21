# AI Enrichment Service

**Port:** 3006 | **Queue:** etip-enrich-realtime | **Status:** ✅ Deployed | **Tests:** 27

## What It Does

Receives IOCs from normalization, enriches with VirusTotal and AbuseIPDB external API lookups, computes weighted risk score, stores results on IOC record. Graceful degradation when providers fail or AI is disabled.

## Pipeline

```
QUEUES.ENRICH_REALTIME → Enrich Worker
  → Check AI gate (TI_AI_ENABLED)
  → VirusTotal lookup (IP/domain/hash/URL — 4/min rate limit)
  → AbuseIPDB lookup (IP only — 1000/day rate limit)
  → Compute risk score: VT 50% + AbuseIPDB 30% + base confidence 20%
  → Determine status: enriched / partial / failed / skipped
  → Merge with existing enrichmentData on IOC
  → Update Ioc.enrichmentData + enrichedAt
```

## Features

| Feature | File | Description |
|---------|------|-------------|
| VirusTotal Provider | providers/virustotal.ts | VT API v3 — detection rate, tags, analysis date |
| AbuseIPDB Provider | providers/abuseipdb.ts | Abuse score, reports, ISP, country, Tor flag |
| Rate Limiter | rate-limiter.ts | Sliding-window per provider (configurable) |
| Enrich Worker | workers/enrich-worker.ts | BullMQ consumer with job validation |
| Enrichment Service | service.ts | Parallel lookups, risk scoring, merge logic |
| Repository | repository.ts | updateEnrichment, findPending, getStats |

## Degradation Behavior

| Scenario | Result |
|----------|--------|
| TI_AI_ENABLED=false | `skipped` — no API calls, no DB update |
| VT API key empty | VT skipped, AbuseIPDB runs if applicable |
| VT returns 429 | VT null, status `partial` |
| Both providers fail | Status `failed`, error logged |
| IOC type has no providers | Status `enriched` (nothing to look up) |

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | - | Health check |
| POST | /api/v1/enrichment/trigger | JWT | Queue IOC for enrichment (priority 1) |
| GET | /api/v1/enrichment/stats | JWT | `{total, enriched, pending}` |
| GET | /api/v1/enrichment/pending | JWT | List IOCs awaiting enrichment |

## Config

| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_ENRICHMENT_PORT | 3006 | Service port |
| TI_AI_ENABLED | false | Master switch for external APIs |
| TI_VIRUSTOTAL_API_KEY | (empty) | VT API key |
| TI_ABUSEIPDB_API_KEY | (empty) | AbuseIPDB key |
| TI_ENRICHMENT_CONCURRENCY | 2 | Worker concurrency |
| TI_VT_RATE_LIMIT_PER_MIN | 4 | VT rate limit |
| TI_ABUSEIPDB_RATE_LIMIT_PER_DAY | 1000 | AbuseIPDB rate limit |
