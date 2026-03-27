/**
 * @module hooks/use-global-catalog
 * @description TanStack Query hooks for Global Feed Catalog, subscriptions, and pipeline health.
 * DECISION-029 Phase C.
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'

// ─── Types ──────────────────────────────────────────────────

export interface GlobalCatalogFeed {
  id: string
  name: string
  description: string | null
  feedType: string
  url: string
  enabled: boolean
  sourceReliability: string
  infoCred: string
  admiraltyCode: string
  minPlanTier: string
  feedReliability: number
  subscriberCount: number
  lastFetchAt: string | null
  totalItemsIngested: number
  consecutiveFailures: number
  createdAt: string
}

export interface TenantSubscription {
  id: string
  tenantId: string
  globalFeedId: string
  alertConfig: {
    minSeverity?: string
    minConfidence?: number
    iocTypes?: string[]
  }
  createdAt: string
  feed?: GlobalCatalogFeed
}

export interface QueueHealthEntry {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

export interface PipelineHealth {
  queues: QueueHealthEntry[]
  pipeline: {
    articlesProcessed24h: number
    iocsCreated24h: number
    iocsEnriched24h: number
    avgNormalizeLatencyMs: number
    avgEnrichLatencyMs: number
  }
}

// ─── Demo Data ──────────────────────────────────────────────

const DEMO_CATALOG: GlobalCatalogFeed[] = [
  {
    id: 'gf-1', name: 'AlienVault OTX Global', description: 'Community threat intelligence', feedType: 'rss',
    url: 'https://otx.alienvault.com', enabled: true, sourceReliability: 'B', infoCred: '2',
    admiraltyCode: 'B2', minPlanTier: 'free', feedReliability: 92, subscriberCount: 45,
    lastFetchAt: new Date(Date.now() - 3600_000).toISOString(), totalItemsIngested: 15420,
    consecutiveFailures: 0, createdAt: new Date(Date.now() - 90 * 86400_000).toISOString(),
  },
  {
    id: 'gf-2', name: 'CISA KEV Global', description: 'Known Exploited Vulnerabilities', feedType: 'rest',
    url: 'https://cisa.gov/kev', enabled: true, sourceReliability: 'A', infoCred: '1',
    admiraltyCode: 'A1', minPlanTier: 'free', feedReliability: 98, subscriberCount: 78,
    lastFetchAt: new Date(Date.now() - 7200_000).toISOString(), totalItemsIngested: 2340,
    consecutiveFailures: 0, createdAt: new Date(Date.now() - 120 * 86400_000).toISOString(),
  },
  {
    id: 'gf-3', name: 'Abuse.ch MalwareBazaar', description: 'Malware sample intelligence', feedType: 'rest',
    url: 'https://mb-api.abuse.ch', enabled: true, sourceReliability: 'B', infoCred: '2',
    admiraltyCode: 'B2', minPlanTier: 'starter', feedReliability: 88, subscriberCount: 32,
    lastFetchAt: new Date(Date.now() - 5400_000).toISOString(), totalItemsIngested: 8900,
    consecutiveFailures: 0, createdAt: new Date(Date.now() - 60 * 86400_000).toISOString(),
  },
  {
    id: 'gf-4', name: 'NVD CVE Feed', description: 'National Vulnerability Database', feedType: 'nvd',
    url: 'https://services.nvd.nist.gov', enabled: true, sourceReliability: 'A', infoCred: '1',
    admiraltyCode: 'A1', minPlanTier: 'free', feedReliability: 96, subscriberCount: 91,
    lastFetchAt: new Date(Date.now() - 1800_000).toISOString(), totalItemsIngested: 45600,
    consecutiveFailures: 0, createdAt: new Date(Date.now() - 150 * 86400_000).toISOString(),
  },
  {
    id: 'gf-5', name: 'CIRCL MISP Community', description: 'MISP threat sharing', feedType: 'stix',
    url: 'https://misp.circl.lu', enabled: false, sourceReliability: 'C', infoCred: '3',
    admiraltyCode: 'C3', minPlanTier: 'teams', feedReliability: 72, subscriberCount: 15,
    lastFetchAt: new Date(Date.now() - 86400_000).toISOString(), totalItemsIngested: 3200,
    consecutiveFailures: 3, createdAt: new Date(Date.now() - 45 * 86400_000).toISOString(),
  },
]

const DEMO_PIPELINE_HEALTH: PipelineHealth = {
  queues: [
    { name: 'etip-feed-fetch-global-rss', waiting: 3, active: 1, completed: 1240, failed: 2, delayed: 0 },
    { name: 'etip-feed-fetch-global-nvd', waiting: 0, active: 0, completed: 890, failed: 0, delayed: 1 },
    { name: 'etip-feed-fetch-global-stix', waiting: 1, active: 0, completed: 340, failed: 1, delayed: 0 },
    { name: 'etip-feed-fetch-global-rest', waiting: 2, active: 1, completed: 2100, failed: 5, delayed: 0 },
    { name: 'etip-normalize-global', waiting: 8, active: 3, completed: 4200, failed: 3, delayed: 0 },
    { name: 'etip-enrich-global', waiting: 15, active: 2, completed: 3800, failed: 8, delayed: 5 },
  ],
  pipeline: {
    articlesProcessed24h: 1240,
    iocsCreated24h: 580,
    iocsEnriched24h: 420,
    avgNormalizeLatencyMs: 320,
    avgEnrichLatencyMs: 1450,
  },
}

// ─── Demo Fallback ──────────────────────────────────────────

function withDemoFallback<T>(
  result: UseQueryResult<T>,
  demoData: T,
  hasData: (d: T | undefined) => boolean,
) {
  const isDemo = !result.isLoading && !hasData(result.data)
  return { ...result, data: isDemo ? demoData : result.data, isDemo }
}

// ─── Hooks ──────────────────────────────────────────────────

export function useGlobalCatalog() {
  const empty: GlobalCatalogFeed[] = []
  const result = useQuery({
    queryKey: ['global-catalog'],
    queryFn: () =>
      api<{ data: GlobalCatalogFeed[] }>('/ingestion/catalog')
        .then(r => r?.data ?? empty)
        .catch(err => notifyApiError(err, 'global catalog', empty)),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_CATALOG, d => (d?.length ?? 0) > 0)
}

export function useMySubscriptions() {
  const qc = useQueryClient()
  const empty: TenantSubscription[] = []
  const result = useQuery({
    queryKey: ['global-subscriptions'],
    queryFn: () =>
      api<{ data: TenantSubscription[] }>('/ingestion/catalog/subscriptions')
        .then(r => r?.data ?? empty)
        .catch(err => notifyApiError(err, 'subscriptions', empty)),
    staleTime: 60_000,
  })

  const subscribeMut = useMutation({
    mutationFn: (feedId: string) => api(`/ingestion/catalog/${feedId}/subscribe`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['global-catalog'] })
      void qc.invalidateQueries({ queryKey: ['global-subscriptions'] })
    },
  })

  const unsubscribeMut = useMutation({
    mutationFn: (feedId: string) => api(`/ingestion/catalog/${feedId}/unsubscribe`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['global-catalog'] })
      void qc.invalidateQueries({ queryKey: ['global-subscriptions'] })
    },
  })

  return {
    ...withDemoFallback(result, [] as TenantSubscription[], d => (d?.length ?? 0) > 0),
    subscribe: subscribeMut.mutate,
    unsubscribe: unsubscribeMut.mutate,
    isSubscribing: subscribeMut.isPending,
    isUnsubscribing: unsubscribeMut.isPending,
  }
}

export function useGlobalPipelineHealth() {
  const result = useQuery({
    queryKey: ['global-pipeline-health'],
    queryFn: () =>
      api<{ data: PipelineHealth }>('/ingestion/global-pipeline/health')
        .then(r => r?.data ?? null)
        .catch(() => null),
    staleTime: 30_000,
  })
  return withDemoFallback(result, DEMO_PIPELINE_HEALTH, d => d != null && d.queues?.length > 0)
}
