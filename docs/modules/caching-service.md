# Caching & Archival Service (Module 25)

**Port:** 3025 | **Status:** ✅ Deployed | **Tests:** 94 | **Session:** 58

## Features

| Feature | File | Description |
|---------|------|-------------|
| Cache Stats | services/cache-manager.ts | Redis INFO parsing, hit/miss ratios, memory usage |
| Cache Key Management | services/cache-manager.ts | SCAN pagination, namespace breakdown, key listing |
| Cache Invalidation | services/cache-invalidator.ts | Event-driven debounced invalidation (5s flush window) |
| Cache Warming | services/cache-manager.ts | Pre-warm dashboard via analytics-service (30min interval) |
| Archive Engine | services/archive-engine.ts | Cron-driven archival (60-day), JSONL+gzip to MinIO |
| Archive Store | services/archive-store.ts | In-memory manifest store (DECISION-013) |
| Archive Restore | services/archive-engine.ts | On-demand restore from MinIO to hot storage |
| MinIO Client | services/minio-client.ts | S3-compatible storage: upload, download, list, metadata |
| Event Listener | workers/event-listener.ts | BullMQ listener for cache invalidation events |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Health probe (Redis + MinIO connectivity) |
| GET | /ready | No | Readiness probe |
| GET | /api/v1/cache/stats | Yes | Redis stats + invalidator stats |
| GET | /api/v1/cache/keys | Yes | List cached keys by prefix |
| GET | /api/v1/cache/namespaces | Yes | Namespace breakdown (key counts per prefix) |
| DELETE | /api/v1/cache/keys/:key | Yes | Invalidate specific cache key |
| DELETE | /api/v1/cache/prefix/:prefix | Yes | Invalidate all keys with prefix |
| POST | /api/v1/cache/warm | Yes | Pre-warm dashboard cache |
| POST | /api/v1/cache/invalidate-tenant/:tenantId | Yes | Flush all tenant cache |
| GET | /api/v1/archive/status | Yes | Archive job status, last/next run |
| POST | /api/v1/archive/run | Yes | Trigger manual archive job |
| GET | /api/v1/archive/manifests | Yes | List archived data manifests |
| GET | /api/v1/archive/manifests/:id | Yes | Specific manifest details |
| POST | /api/v1/archive/restore/:manifestId | Yes | Restore archived data to hot storage |
| GET | /api/v1/archive/stats | Yes | Total archived records, storage size |

## Configuration

| Var | Default | Purpose |
|-----|---------|---------|
| TI_PORT | 3025 | Service port |
| TI_REDIS_URL | redis://etip_redis:6379 | Redis connection |
| TI_MINIO_ENDPOINT | etip_minio | MinIO host |
| TI_MINIO_PORT | 9000 | MinIO port |
| TI_MINIO_ACCESS_KEY | - | MinIO access key |
| TI_MINIO_SECRET_KEY | - | MinIO secret key |
| TI_MINIO_BUCKET | etip-archives | Archive bucket name |
| TI_ARCHIVE_CRON | 0 2 * * * | Archive schedule (daily 2am) |
| TI_ARCHIVE_RETENTION_DAYS | 365 | Cold storage retention |
| TI_ARCHIVE_AGE_DAYS | 60 | Hot→cold threshold |
| TI_CACHE_WARM_CRON | */30 * * * * | Cache warming schedule |
| TI_ANALYTICS_SERVICE_URL | http://etip_analytics:3024 | Analytics service for warming |

## Event Namespace Mapping

| Event Type | Invalidated Prefixes |
|-----------|---------------------|
| ioc.created | etip:cache:ioc, etip:cache:dashboard |
| feed.fetched | etip:cache:feed, etip:cache:dashboard |
| enrichment.completed | etip:cache:enrichment, etip:cache:ioc |
| alert.created | etip:cache:alert, etip:cache:dashboard |
| actor.updated | etip:cache:actor |
| malware.updated | etip:cache:malware |
