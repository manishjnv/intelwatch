# Normalization Service

**Full documentation:** [docs/modules/normalization.md](../../docs/modules/normalization.md)

Port 3005 | 322 tests | IOC dedupe + 18 accuracy improvements + Redis Bloom filter → Queue to enrichment

## Features

| Feature | File | Description |
|---------|------|-------------|
| IOC Normalization | service.ts | Type detection, value normalization, quality filtering |
| Composite Confidence | service.ts | Weighted 4-signal formula with exponential time-decay |
| IOC Lifecycle FSM | service.ts, lifecycle-worker.ts | NEW→ACTIVE→AGING→EXPIRED→ARCHIVED |
| Redis Bloom Filter | bloom.ts | Pre-write IOC dedup — O(1) probabilistic check before DB |
| Bloom Admin API | routes/bloom.ts | Warm-up, stats, rebuild endpoints |
| Global Feed Processing | workers/global-normalize-worker.ts | DECISION-029 Phase B2 |

## Bloom Filter Config

| Var | Default | Purpose |
|-----|---------|---------|
| TI_BLOOM_ENABLED | false | Enable Redis Bloom filter for pre-write dedup |
| TI_BLOOM_EXPECTED_ITEMS | 1000000 | Expected items per tenant (determines filter size) |
| TI_BLOOM_FP_RATE | 0.0001 | Target false positive rate (0.01%) |
| TI_BLOOM_WARM_ON_BOOT | true | Auto warm-up bloom filter on service startup |

## Bloom Admin Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/admin/bloom/warm/:tenantId | super_admin | Warm up bloom filter from DB |
| GET | /api/v1/admin/bloom/stats/:tenantId | super_admin | Get bloom filter stats + metrics |
| POST | /api/v1/admin/bloom/rebuild/:tenantId | super_admin | Reset and rebuild bloom filter |
