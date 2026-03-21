# Normalization Service — Feature Documentation

**Module:** apps/normalization | **Port:** 3005 | **Status:** ✅ Deployed | **Tests:** 139

## What It Does

Receives raw IOCs from ingestion, normalizes values, deduplicates via SHA-256 hash, calculates composite confidence with 18 accuracy improvements, manages IOC lifecycle, and queues for AI enrichment.

## Pipeline Flow

```
QUEUES.NORMALIZE (BullMQ) → Normalize Worker
  → Detect IOC type (shared-normalization)
  → Map to Prisma enum (md5→hash_md5, etc.)
  → Normalize value (refang, lowercase, URL dedup)
  → Quality filters (bogon IP, safe domains, placeholder hashes, IPv6)
  → Build dedupe hash: SHA-256(type:normalizedValue:tenantId)
  → Fetch existing IOC for merge
  → Calculate composite confidence (3-signal weighted + type-specific decay)
  → Auto-classify severity (ransomware, APT, MITRE, corroboration)
  → Severity escalation (never downgrade)
  → TLP escalation (never downgrade)
  → Batch anomaly penalty (bulk dumps get lower confidence)
  → IOC velocity scoring (campaign detection)
  → Confidence floor/ceiling per IOC type
  → Upsert IOC to DB (merge arrays, preserve lifecycle)
  → Append to confidence history
  → Queue to QUEUES.ENRICH_REALTIME
```

## 18 Accuracy Improvements

| # | Feature | What it does |
|---|---------|-------------|
| 1 | Live confidence decay | Time-decay on re-sighting based on firstSeen |
| 2 | Feed reliability from DB | Queries actual feed reliability score |
| 3 | Sighting count + source diversity | Tracks independent sources per IOC |
| 4 | IOC lifecycle transitions | NEW→ACTIVE→REACTIVATED state machine |
| 5 | Quality filters | Bogon IPs, safe domains, placeholder hashes |
| 6 | Auto-severity classification | Ransomware→CRITICAL, APT→HIGH, MITRE→HIGH |
| 7 | TLP escalation | RED never downgrades to GREEN |
| 8 | Severity escalation | CRITICAL never downgrades to LOW |
| 9 | Confidence floor/ceiling | hash_sha256 floor 60, IP floor 20 |
| 10 | Batch anomaly scoring | 100+ IOCs = 0.5x penalty |
| 11 | Type-specific decay | Hash 0.001, IP 0.05, domain 0.02 |
| 12 | IPv6 bogon filters | ::1, fe80::, fc00::, 2001:db8::, ff00:: |
| 13 | 3-signal weights | 0.35/0.35/0.30 (dropped dead communityVotes) |
| 14 | Partial defang URL safety | Handles hxxps[:]// in safe-domain filter |
| 15 | Confidence history | Appends {date, score, source} capped at 20 |
| 16 | IOC velocity scoring | Spread speed = campaign detection signal |
| 17 | URL normalization dedup | Strip 30+ tracking params, sort query |
| 18 | Lifecycle cron worker | ACTIVE→AGING(30d)→EXPIRED(60d)→ARCHIVED(90d) every 6h |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | None | Health check |
| GET | /api/v1/iocs | JWT | List IOCs (paginated, filterable by type/severity/lifecycle/TLP/search) |
| GET | /api/v1/iocs/:id | JWT | Get single IOC |
| GET | /api/v1/iocs/stats | JWT | IOC counts by type, lifecycle, severity |

## Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_NORMALIZATION_PORT | 3005 | Service port |
| TI_NORMALIZATION_BATCH_SIZE | 500 | Max IOCs per job |
| TI_NORMALIZATION_CONCURRENCY | 3 | Worker concurrency |
