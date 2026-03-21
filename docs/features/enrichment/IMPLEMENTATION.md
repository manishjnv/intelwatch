# AI Enrichment Service — Feature Documentation

**Module:** apps/ai-enrichment | **Port:** 3006 | **Status:** ✅ Deployed | **Tests:** 27

## What It Does

Receives IOCs from normalization queue, enriches them with VirusTotal and AbuseIPDB external API lookups, computes a weighted risk score, and stores results back on the IOC record.

## Pipeline Flow

```
QUEUES.ENRICH_REALTIME (BullMQ) → Enrich Worker
  → Check AI gate (TI_AI_ENABLED must be true)
  → VirusTotal lookup (IP/domain/hash/URL — rate limited 4/min)
  → AbuseIPDB lookup (IP only — rate limited 1000/day)
  → Compute weighted risk score: VT 50% + AbuseIPDB 30% + base confidence 20%
  → Determine status: enriched / partial / failed / skipped
  → Merge results with existing enrichmentData on IOC
  → Update Ioc.enrichmentData + enrichedAt in DB
```

## Key Features

| Feature | File | What it does |
|---------|------|-------------|
| VirusTotal Provider | `src/providers/virustotal.ts` | VT API v3 — IP, domain, hash, URL lookups |
| AbuseIPDB Provider | `src/providers/abuseipdb.ts` | AbuseIPDB API v2 — IP reputation check |
| Rate Limiter | `src/rate-limiter.ts` | Sliding-window per provider (VT 4/min, AbuseIPDB 1000/day) |
| Enrich Worker | `src/workers/enrich-worker.ts` | BullMQ consumer for QUEUES.ENRICH_REALTIME |
| Enrichment Service | `src/service.ts` | Core logic: parallel API calls, risk score, graceful degradation |
| Repository | `src/repository.ts` | IOC enrichment DB queries (updateEnrichment, findPending, getStats) |

## Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| TI_AI_ENABLED=false | Returns `skipped`, no API calls |
| VT API key empty | VT provider returns null, AbuseIPDB still runs |
| VT rate limited (429) | Returns null for VT, partial result |
| Both providers fail | Returns `failed` with error details |
| Only one provider applicable | `enriched` (e.g., hash → VT only, no AbuseIPDB) |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | None | Health check |
| POST | /api/v1/enrichment/trigger | JWT | Manually trigger enrichment for an IOC |
| GET | /api/v1/enrichment/stats | JWT | Enriched vs pending counts |
| GET | /api/v1/enrichment/pending | JWT | List IOCs pending enrichment |

## Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_ENRICHMENT_PORT | 3006 | Service port |
| TI_AI_ENABLED | false | Master switch |
| TI_VIRUSTOTAL_API_KEY | (empty) | VT API key (free: 4/min) |
| TI_ABUSEIPDB_API_KEY | (empty) | AbuseIPDB key (free: 1000/day) |
| TI_ENRICHMENT_CONCURRENCY | 2 | Worker concurrency |
| TI_VT_RATE_LIMIT_PER_MIN | 4 | VT rate limit |
| TI_ABUSEIPDB_RATE_LIMIT_PER_DAY | 1000 | AbuseIPDB rate limit |
