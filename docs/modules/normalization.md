# Normalization Service

**Port:** 3005 | **Queue:** etip-normalize | **Status:** ✅ Deployed | **Tests:** 256

## What It Does

Receives raw IOCs from ingestion, normalizes values, deduplicates via SHA-256 hash, calculates composite confidence with 18 accuracy improvements, manages IOC lifecycle, and queues for AI enrichment.

## Pipeline

```
QUEUES.NORMALIZE → Normalize Worker
  → Detect IOC type → Map to Prisma enum
  → Normalize value (refang, lowercase, URL dedup with tracking param strip)
  → Quality filters (bogon IPv4/IPv6, safe domains, placeholder hashes)
  → Build dedupe hash: SHA-256(type:normalizedValue:tenantId)
  → Fetch existing IOC → merge arrays
  → Composite confidence (3-signal weighted + type-specific decay)
  → Auto-severity (ransomware→CRITICAL, APT→HIGH)
  → Severity/TLP escalation (never downgrade)
  → Batch anomaly penalty → Velocity scoring → Confidence floor/ceiling
  → Upsert IOC → Append confidence history
  → Queue → QUEUES.ENRICH_REALTIME
```

## 18 Accuracy Improvements

| # | Feature | Description |
|---|---------|-------------|
| 1 | Confidence decay | Time-decay on re-sighting from firstSeen |
| 2 | Feed reliability | Queries actual feed reliability from DB |
| 3 | Source diversity | Tracks independent sources per IOC |
| 4 | Lifecycle transitions | NEW→ACTIVE→REACTIVATED state machine |
| 5 | Quality filters | Bogon IPs, safe domains, placeholder hashes |
| 6 | Auto-severity | Ransomware→CRITICAL, APT→HIGH, MITRE→HIGH |
| 7 | TLP escalation | RED never downgrades to GREEN |
| 8 | Severity escalation | CRITICAL never downgrades to LOW |
| 9 | Confidence bounds | hash_sha256 floor 60, IP floor 20, URL floor 15 |
| 10 | Batch anomaly | 100+ IOCs from 1 article = 0.5x penalty |
| 11 | Type-specific decay | Hash 0.001, IP 0.05, domain 0.02 |
| 12 | IPv6 bogon | ::1, fe80::, fc00::, 2001:db8::, ff00:: |
| 13 | 3-signal weights | 0.35 feed + 0.35 corroboration + 0.30 AI |
| 14 | Defang URL safety | Handles hxxps[:]// in safe-domain filter |
| 15 | Confidence history | {date, score, source} capped at 20 entries |
| 16 | Velocity scoring | Spread speed = campaign detection (0-100) |
| 17 | URL dedup | Strip 30+ tracking params, sort query params |
| 18 | Lifecycle cron | ACTIVE→AGING(30d)→EXPIRED(60d)→ARCHIVED(90d) every 6h |

## Global Processing (DECISION-029 Phase B2)

| Feature | File | Description |
|---------|------|-------------|
| Global Normalize Worker | workers/global-normalize-worker.ts | NORMALIZE_GLOBAL queue: extract IOCs, warninglist filter, Bayesian confidence, STIX tiers, upsert global_iocs |
| Global Enrich Worker | workers/global-enrich-worker.ts | ENRICH_GLOBAL queue: Shodan/GreyNoise enrichment, confidence recalc, quality scoring, GLOBAL_IOC_CRITICAL |
| Shodan Client | enrichment/shodan-client.ts | IP enrichment (ports, vulns, tags, risk scoring). Graceful degradation. |
| GreyNoise Client | enrichment/greynoise-client.ts | Community API (noise/riot, threat assessment, confidence adjustment) |
| Tenant Overlay Service | services/tenant-overlay-service.ts | Multi-tenant IOC view: overlay wins over global, tags merged, CRUD + bulk |
| Tenant Overlay Routes | routes/tenant-overlay.ts | 6 REST routes gated by TI_GLOBAL_PROCESSING_ENABLED |
| Fuzzy Dedupe (worker) | workers/global-normalize-worker.ts | computeFuzzyHash fallback in upsert: exact match → fuzzy match → new IOC. fuzzyDedupeHash stored. |
| Batch Normalizer | services/batch-normalizer.ts | Batch processing: intra-batch dedup, cache-first, createMany, adaptive sizing (1-50). BatchResult stats. |

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | - | Health check |
| GET | /api/v1/iocs | JWT | List IOCs (type, severity, lifecycle, TLP, search, minConfidence, sort) |
| GET | /api/v1/iocs/:id | JWT | Single IOC by ID |
| GET | /api/v1/iocs/stats | JWT | Counts by type, lifecycle, severity |
| GET | /api/v1/normalization/global-iocs | JWT | Tenant's merged global IOC view (with overlay) |
| GET | /api/v1/normalization/global-iocs/:iocId | JWT | Single global IOC detail + enrichmentData |
| PUT | /api/v1/normalization/global-iocs/:iocId/overlay | JWT+RBAC | Set/update tenant overlay |
| DELETE | /api/v1/normalization/global-iocs/:iocId/overlay | JWT+RBAC | Remove tenant overlay (revert to global) |
| POST | /api/v1/normalization/global-iocs/bulk-overlay | JWT+RBAC | Bulk set overlay (max 100) |
| GET | /api/v1/normalization/global-iocs/stats | JWT | Overlay stats for tenant |

## Config

| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_NORMALIZATION_PORT | 3005 | Service port |
| TI_NORMALIZATION_BATCH_SIZE | 500 | Max IOCs per job |
| TI_NORMALIZATION_CONCURRENCY | 3 | Worker concurrency |
| TI_GLOBAL_PROCESSING_ENABLED | false | Gate for global normalize/enrich workers + overlay routes |
| TI_SHODAN_API_KEY | - | Shodan API key (optional, enrichment degrades gracefully) |
| TI_GREYNOISE_API_KEY | - | GreyNoise API key (optional, enrichment degrades gracefully) |
