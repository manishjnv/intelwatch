# @etip/shared-cache

Redis caching layer with tenant-aware key namespacing, TTL management, and cache-aside pattern.

## Usage

```typescript
import { createRedisClient, CacheService, CACHE_TTL, KEY_PATTERNS } from '@etip/shared-cache';

const redis = createRedisClient(process.env.REDIS_URL);
const cache = new CacheService(redis);

await cache.set('tenant-1', 'dashboard:overview', data, { ttl: CACHE_TTL.dashboard });
const result = await cache.getOrSet('tenant-1', 'ioc:8.8.8.8', CACHE_TTL.enrichment.ip, fetchFn);
await cache.invalidateTenant('tenant-1');
```

## TTL Constants

| Key | TTL |
|-----|-----|
| Dashboard | 48 hours |
| IOC Search | 1 hour |
| Enrichment (IP) | 1 hour |
| Enrichment (Domain) | 24 hours |
| Enrichment (Hash) | 7 days |
| Enrichment (CVE) | 12 hours |
| User Session | 15 min |
| Feed Data | 30 min |
