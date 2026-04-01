/**
 * @module hooks/use-global-catalog
 * @description TanStack Query hooks for Global Feed Catalog, subscriptions, and pipeline health.
 * DECISION-029 Phase C.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

// Demo fallback removed — no fake data

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
  return { ...result, isDemo: false }
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
    ...result, isDemo: false as const,
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
      api<PipelineHealth>('/ingestion/global-pipeline/health')
        .catch(() => null),
    staleTime: 30_000,
  })
  return { ...result, data: result.data ?? null, isDemo: false }
}
