# Global Processing Pipeline — Operational Runbook

DECISION-029 Phase F | Last updated: 2026-03-27

## Monitoring

- **Dashboard**: https://ti.intelwatch.in/global-monitoring
- **Health script**: `npx tsx scripts/check-global-pipeline.ts`
- **Prometheus**: `/metrics` on all services (23 scrape targets)
- **Redis stats**: `global:stats:*` keys (articles-created-24h, iocs-created-24h, etc.)

## Common Issues

### Feed stuck (lastFetchAt not updating)

1. Check: `GET /api/v1/global-pipeline/health` → queue status
2. If queue backed up: check Redis memory (`redis-cli INFO memory`), increase concurrency
3. If worker crashed: check logs, restart: `docker restart etip_ingestion`
4. Auto-recovery: runs every 6h, re-enables feeds after 24h cooldown

### Articles stuck in 'normalizing'

1. Check: `npx tsx scripts/check-global-pipeline.ts` → articles.stuck count
2. Auto-recovery resets stuck articles every 6h
3. Manual: `POST /api/v1/global-pipeline/retrigger/etip-normalize-global`

### High warninglist filter rate (>50%)

1. Check feed quality — may be ingesting benign data (CDN IPs, Google DNS, etc.)
2. Review warninglist: are lists too aggressive?
3. Consider: lower feed Admiralty Code (C→D) to reduce priority
4. Check `global:stats:warninglist-filtered-24h` counter

### Low enrichment quality

1. Check: Shodan/GreyNoise API keys configured? (`TI_SHODAN_API_KEY`, `TI_GREYNOISE_API_KEY`)
2. Check: EPSS cron running? (daily at 6 AM UTC)
3. Check: rate limits hit? (Shodan 1/sec, GreyNoise 50/day free tier)
4. Manual re-enrich: `POST /api/v1/global-pipeline/retrigger/etip-enrich-global`

### Confidence scores seem wrong

1. Check: confidence model (Bayesian vs Linear) — `selectConfidenceModel()` in shared-normalization
2. Check: feed Admiralty Code (A1 should produce high confidence)
3. Check: `crossFeedCorroboration` (single source → lower confidence)
4. Verify: GreyNoise `riot=true` correctly lowers confidence (FP indicator)
5. Check: velocity score — high velocity from multiple sources → higher confidence

### Fuzzy dedup not merging expected variants

1. Verify: both IOCs are same type (fuzzy dedupe is type-scoped)
2. Check normalization: `fuzzyNormalizeIocValue(type, value)` — does it produce same canonical form?
3. Check: `computeFuzzyHash(type, value1)` vs `computeFuzzyHash(type, value2)` — same hash?
4. Note: fuzzy dedupe is conservative — false negatives are acceptable, false positives are NOT

### Emergency: pause pipeline

1. `POST /api/v1/global-pipeline/pause`
2. Or: set `TI_GLOBAL_PROCESSING_ENABLED=false` + restart services
3. Investigate issue
4. Resume: `POST /api/v1/global-pipeline/resume`

## Capacity Planning

| Volume | Articles/day | IOCs/day | Redis | Postgres/month |
|--------|-------------|----------|-------|----------------|
| 10 feeds | ~300 | ~900 | ~10MB | ~200MB |
| 50 feeds | ~1,500 | ~4,500 | ~30MB | ~500MB |
| 100 feeds | ~3,000 | ~9,000 | ~50MB | ~1GB |

### Scaling triggers

- Queue depth consistently >200: increase worker concurrency (currently 5)
- Redis memory >500MB: enable key eviction, increase instance size
- Postgres >10GB: enable cold storage archival (60-day policy)
- Cache hit rate <50%: increase TTLs or add more keys to known-iocs set

## Phase F Components

### Fuzzy Deduplication (`shared-normalization/fuzzy-dedupe.ts`)
- Catches ~15% of near-duplicates missed by exact hash
- Type-specific normalization: defang, port strip, leading zeros, plus-addressing
- Safe: false negatives OK (falls back to exact match), false positives prevented

### Batch Normalizer (`normalization/services/batch-normalizer.ts`)
- Adaptive batch sizing: 1 (low) → 10 → 25 → 50 (high volume)
- Intra-batch dedup eliminates duplicates before any DB calls
- Cache-first: known IOCs skip full upsert path

### Global Cache (`ingestion/services/global-cache.ts`)
- Catalog entries: 10-min TTL, invalidated on PUT/DELETE
- Known IOC hashes: 24h TTL, rebuilt daily
- Warninglists: 1h TTL
- Stats counters: 24h auto-reset

### Velocity Score (`shared-normalization/velocity-score.ts`)
- Formula: sightings × 10 (cap 50) + sources × 15 (cap 50) = 0-100
- Trend: accelerating/stable/decelerating based on half-window comparison
- Decay: half-life 6h — inactive IOCs lose velocity fast
- Spike detection: current >= 2× previous triggers alert

### CWE Chain Mapper (`shared-normalization/cwe-chain.ts`)
- Top 40 CWEs from MITRE/OWASP curated database
- Attack chain analysis: root causes, severity, narrative generation
- Category grouping: injection, memory, auth, crypto, config, info-disclosure
