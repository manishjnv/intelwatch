# Normalization Service

**Port:** 3005 | **Queue:** etip-normalize | **Status:** ✅ Deployed | **Tests:** 139

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

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | - | Health check |
| GET | /api/v1/iocs | JWT | List IOCs (type, severity, lifecycle, TLP, search, minConfidence, sort) |
| GET | /api/v1/iocs/:id | JWT | Single IOC by ID |
| GET | /api/v1/iocs/stats | JWT | Counts by type, lifecycle, severity |

## Config

| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_NORMALIZATION_PORT | 3005 | Service port |
| TI_NORMALIZATION_BATCH_SIZE | 500 | Max IOCs per job |
| TI_NORMALIZATION_CONCURRENCY | 3 | Worker concurrency |
