# @etip/shared-cache

Redis caching layer for the Enterprise Threat Intelligence Platform. Provides tenant-aware key namespacing, TTL management, and a cache-aside (getOrSet) pattern.

## Installation

```bash
pnpm add @etip/shared-cache
```

## Usage

```typescript
import { createRedisClient, CacheService, CACHE_TTL, KEY_PATTERNS } from '@etip/shared-cache';

// 1. Create Redis client with retry logic
const redis = createRedisClient(process.env.REDIS_URL);

// 2. Create cache service
const cache = new CacheService(redis);

// 3. Simple get/set with TTL
await cache.set('tenant-1', 'dashboard:overview', dashboardData, {
  ttl: CACHE_TTL.dashboard, // 48 hours
});
const data = await cache.get<DashboardData>('tenant-1', 'dashboard:overview');

// 4. Cache-aside pattern
const iocData = await cache.getOrSet('tenant-1', 'ioc:8.8.8.8', CACHE_TTL.enrichment.ip, async () => {
  return await enrichmentService.enrich('8.8.8.8');
});

// 5. Invalidation
await cache.invalidate('tenant-1', 'dashboard:overview');
await cache.invalidateTenant('tenant-1'); // flush all tenant keys

// 6. Use pre-built key patterns
const key = KEY_PATTERNS.enrichment('tenant-1', 'ip', '8.8.8.8');
// → 'etip:tenant-1:enrich:ip:8.8.8.8'
```

## Key Format

All keys follow: `etip:{tenantId}:{resource}:{identifier}`

This ensures complete tenant isolation at the cache level.

## TTL Constants

| Key | TTL | Seconds |
|-----|-----|---------|
| Dashboard | 48 hours | 172,800 |
| IOC Search | 1 hour | 3,600 |
| Enrichment (IP) | 1 hour | 3,600 |
| Enrichment (Domain) | 24 hours | 86,400 |
| Enrichment (Hash) | 7 days | 604,800 |
| Enrichment (CVE) | 12 hours | 43,200 |
| User Session | 15 min | 900 |
| Feed Data | 30 min | 1,800 |

## Modules

| File | Contents |
|------|----------|
| `redis-client.ts` | Redis client factory with retry/reconnect logic |
| `cache-service.ts` | CacheService class (get/set/getOrSet/invalidate/invalidateTenant) |
| `cache-ttl.ts` | CACHE_TTL constants and KEY_PATTERNS builders |

## Testing

```bash
pnpm test            # Run tests (uses in-memory mock, no Redis needed)
pnpm test:coverage   # Run with coverage
```
