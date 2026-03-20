# SKILL: Caching & Data Archival Strategy
**ID:** 23-caching-archival | **Version:** 3.0
**Scope:** Performance optimization — 48hr cache, 60-day archival, on-demand retrieval

---

## PURPOSE
Ensure the platform feels instant at all times. Implement a multi-layer caching strategy for dashboards and search, and automatically archive intelligence data after 60 days to maintain hot storage performance without data loss.

---

## CACHING ARCHITECTURE

```
Browser (SWR)    →   CDN (Cloudflare)   →   Redis (L1)   →   PostgreSQL/ES
  0-5 seconds         1-5 minutes           48 hours          Persistent
```

### Cache Layer Responsibilities

| Layer | What | TTL | How |
|---|---|---|---|
| Redis L1 | Dashboard widgets, IOC search pages, enrichment results | Per-type (see below) | Redis SETEX + JSON |
| Browser SWR | API responses with stale-while-revalidate | 60s stale, 5min max | TanStack Query staleTime |
| CDN | Static frontend assets | 1 year immutable | Cache-Control headers |
| ETags | API responses for conditional requests | N/A | Fastify ETag plugin |

---

## REDIS CACHE TTL MATRIX

```typescript
export const CACHE_TTL = {
  // Dashboard — 48 hours (main USP for fast load)
  dashboardWidget:    48 * 3600,    // 172,800 seconds
  dashboardStats:     48 * 3600,
  topStatsBar:        1800,         // 30 min — more dynamic

  // Search results
  iocSearchPage:      3600,         // 1 hour
  threatActorList:    3600,
  malwareList:        3600,
  vulnList:           1800,         // 30 min — more volatile

  // Enrichment (by IOC type — some are immutable)
  enrichment: {
    sha256:  7 * 24 * 3600,  // 7 days — hashes are immutable
    sha1:    7 * 24 * 3600,
    md5:     7 * 24 * 3600,
    domain:  24 * 3600,      // 24 hours
    url:     3600,           // 1 hour — URLs change
    ip:      3600,           // 1 hour — IPs rotate
    cve:     12 * 3600,      // 12 hours — patching status changes
    email:   24 * 3600,
  },

  // Feed metadata
  feedConfig:     1800,   // 30 min
  feedStats:      900,    // 15 min

  // Graph queries (expensive)
  graphCluster:   3600,   // 1 hour per actor cluster
  graphPath:      1800,   // 30 min per path query

  // Platform
  tenantConfig:   60,     // 1 min — config changes should propagate fast
  userSession:    900,    // 15 min
  planLimits:     300,    // 5 min
}
```

---

## CACHE SERVICE IMPLEMENTATION

```typescript
// packages/shared-utils/src/cache.service.ts
export class CacheService {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key)
    return raw ? JSON.parse(raw) : null
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.setex(key, ttlSeconds, JSON.stringify(value))
  }

  async getOrSet<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) return cached
    const fresh = await fetcher()
    await this.set(key, fresh, ttl)
    return fresh
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern)
    if (keys.length > 0) await this.redis.del(...keys)
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    await this.invalidate(`${tenantId}:dashboard:*`)
    await this.invalidate(`${tenantId}:ioc:search:*`)
    await this.invalidate(`${tenantId}:stats:*`)
  }

  buildKey(tenantId: string, ...parts: string[]): string {
    return `${tenantId}:${parts.join(':')}`
  }
}
```

### Usage in Services
```typescript
// Dashboard widget caching — 48 hours
async function getDashboardWidget(widgetId: string, tenantId: string): Promise<WidgetData> {
  const key = cache.buildKey(tenantId, 'dashboard', widgetId)
  return cache.getOrSet(key, CACHE_TTL.dashboardWidget, () => computeWidgetData(widgetId, tenantId))
}

// Cache invalidation on new HIGH/CRITICAL IOC
eventBus.subscribe('ioc.severity.high', async (event) => {
  await cache.invalidateTenant(event.tenantId)  // Force dashboard refresh
})

// IOC search with cache
async function searchIOCs(params: SearchParams, tenantId: string): Promise<SearchResult> {
  const cacheKey = cache.buildKey(tenantId, 'ioc', 'search', hashParams(params))
  return cache.getOrSet(cacheKey, CACHE_TTL.iocSearchPage, () => esService.search(params, tenantId))
}
```

---

## DASHBOARD PREFETCHING (SWR Pattern — Frontend)

```typescript
// Prefetch dashboard data before user lands on page
export function useDashboardData(widgetIds: string[]) {
  return useQueries({
    queries: widgetIds.map(id => ({
      queryKey: ['dashboard', 'widget', id],
      queryFn: () => api.getDashboardWidget(id),
      staleTime: 30 * 60 * 1000,   // consider fresh for 30 min
      gcTime: 48 * 60 * 60 * 1000, // keep in memory 48 hours
      refetchOnWindowFocus: false,
      refetchInterval: 30 * 60 * 1000  // background refresh every 30 min
    }))
  })
}

// Optimistic cache update on new IOC
export function useCreateIOC() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.createIOC,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['ioc', 'list'] })
    }
  })
}
```

---

## DATA ARCHIVAL STRATEGY

### Archival Rules

```typescript
export const ARCHIVAL_CONFIG = {
  hotToColdDays: 60,        // After 60 days → move to MinIO
  coldRetentionDays: 365,   // Keep in cold for 1 year
  purgeAfterDays: 1825,     // Delete after 5 years (compliance: configure per tenant)
  
  // Only archive these entity types (IOCs from feeds, not manually created)
  archivableTypes: ['feed_ioc', 'feed_threat_actor', 'feed_malware'],
  
  // Never archive manually created or analyst-tagged entities
  excludeConditions: ['manually_created', 'tagged:keep', 'actively_hunting'],
  
  // Archive format
  format: 'parquet',        // Columnar, 10x compression vs JSON
  compression: 'snappy',
  partitionBy: ['tenant_id', 'entity_type', 'year', 'month']
}
```

### Archival Job (Scheduled Daily at 2am)
```typescript
// BullMQ scheduled job
archivalQueue.add('archive', {}, { repeat: { pattern: '0 2 * * *' } })

archivalQueue.process('archive', async (job) => {
  const cutoffDate = subDays(new Date(), ARCHIVAL_CONFIG.hotToColdDays)
  
  // 1. Find all archivable IOCs older than 60 days
  const toArchive = await prisma.ioc.findMany({
    where: {
      createdAt: { lt: cutoffDate },
      source: { in: ['feed'] },
      status: { not: 'keep' },
      archivedAt: null
    },
    take: 10_000  // Batch size
  })
  
  if (toArchive.length === 0) return
  
  // 2. Convert to Parquet and upload to MinIO
  const parquetBuffer = await toParquet(toArchive)
  const archivePath = buildArchivePath(toArchive)
  await minioClient.putObject('etip-archive', archivePath, parquetBuffer)
  
  // 3. Remove from PostgreSQL + Elasticsearch (keep in Neo4j for graph relationships)
  const ids = toArchive.map(i => i.id)
  await prisma.ioc.updateMany({ where: { id: { in: ids } }, data: { archivedAt: new Date() } })
  await esService.deleteByIds(ids)
  
  // 4. Keep lightweight "tombstone" in PostgreSQL for search awareness
  // tombstone: {id, type, value, archivedAt, archivePath} — tiny footprint
  
  logger.info(`Archived ${toArchive.length} IOCs to ${archivePath}`)
})
```

### Archive Path Convention
```typescript
function buildArchivePath(items: CanonicalIOC[]): string {
  const { tenantId, year, month } = getPartitionInfo(items[0])
  const ts = Date.now()
  return `${tenantId}/ioc/${year}/${month}/${ts}.parquet`
}
// e.g.: tenant-abc123/ioc/2025/01/1735689600000.parquet
```

---

## ON-DEMAND ARCHIVE RETRIEVAL

When an analyst searches for an archived IOC:

```typescript
// Transparent retrieval — user doesn't know it's in cold storage
async function searchIOCWithArchive(query: string, tenantId: string): Promise<SearchResult> {
  // 1. Search hot storage first (fast)
  const hotResults = await esService.search(query, tenantId)
  
  // 2. Check tombstones for archived matches
  const tombstones = await prisma.tombstone.findMany({
    where: { tenantId, value: { contains: query }, archivedAt: { not: null } }
  })
  
  if (tombstones.length === 0) return hotResults
  
  // 3. Retrieve from archive (background, stream to user)
  const archiveResults = await Promise.all(
    tombstones.map(t => retrieveFromArchive(t.archivePath, t.id))
  )
  
  return mergeResults(hotResults, archiveResults.filter(Boolean))
}

async function retrieveFromArchive(archivePath: string, entityId: string): Promise<CanonicalIOC | null> {
  const stream = await minioClient.getObject('etip-archive', archivePath)
  const data = await parseParquetStream(stream)
  return data.find(d => d.id === entityId) ?? null
}
```

### Archive UI Indicator
```tsx
// Show "archived" badge on results from cold storage — transparent but informative
{ioc.archivedAt && (
  <Tooltip content={`This indicator was archived on ${format(ioc.archivedAt, 'PPP')}. Data loaded from cold storage.`}>
    <Badge variant="outline" className="text-muted">
      <Archive className="w-3 h-3 mr-1" />
      Archived
    </Badge>
  </Tooltip>
)}
```

---

## CACHE MONITORING (Admin Dashboard)
```typescript
router.get('/api/v1/admin/performance/cache', rbac('admin'), async (req, res) => {
  const info = await redis.info('stats')
  res.json({
    hitRate:     parseRedisHitRate(info),
    memoryUsed:  parseRedisMemory(info),
    keyCount:    await redis.dbsize(),
    topKeys:     await getTopCachedKeys(),  // by access count
    archiveStats: await getArchivalStats()  // bytes archived, count, last run
  })
})
```

---

## TESTING
```typescript
describe('CacheService', () => {
  it('returns cached value on second call without fetching', async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: 'test' })
    await cacheService.getOrSet('key', 3600, fetcher)
    await cacheService.getOrSet('key', 3600, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('invalidates tenant cache on HIGH severity IOC event', async () => {
    await cacheService.set('tenant-1:dashboard:widget-1', { data: 'stale' }, 3600)
    await eventBus.publish('notifications', { type: 'ioc.severity.high', tenantId: 'tenant-1' })
    await waitForEvent('cache.invalidated')
    const cached = await cacheService.get('tenant-1:dashboard:widget-1')
    expect(cached).toBeNull()
  })
})

describe('ArchivalJob', () => {
  it('moves 60+ day IOCs to MinIO and creates tombstone', async () => {
    const oldIOC = await seedIOC({ createdAt: subDays(new Date(), 61) })
    await archivalQueue.process()
    
    const inDB = await prisma.ioc.findUnique({ where: { id: oldIOC.id } })
    expect(inDB?.archivedAt).not.toBeNull()
    
    const tombstone = await prisma.tombstone.findFirst({ where: { entityId: oldIOC.id } })
    expect(tombstone).not.toBeNull()
    
    const inMinIO = await minioClient.statObject('etip-archive', tombstone!.archivePath)
    expect(inMinIO.size).toBeGreaterThan(0)
  })
})
```
