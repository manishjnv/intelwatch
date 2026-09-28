/**
 * @module hooks/use-global-monitoring
 * @description TanStack Query hooks for the Global Pipeline Monitoring dashboard.
 * Aggregates data from ingestion + normalization services.
 * Real data or honest empty/error states only — no demo fallback (DECISION-048).
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { QueryLike } from '@/components/ui/QueryStateView'
import {
  useGlobalCatalog, useGlobalPipelineHealth,
  type GlobalCatalogFeed, type PipelineHealth,
} from './use-global-catalog'

// ─── Types ──────────────────────────────────────────────────

export interface GlobalIocStats {
  totalGlobalIOCs: number
  created24h: number
  enriched24h: number
  unenriched: number
  warninglistFiltered: number
  avgConfidence: number
  highConfidenceCount: number
  byType: Record<string, number>
  byConfidenceTier: Record<string, number>
}

export interface CorroborationLeader {
  id: string
  value: string
  iocType: string
  confidence: number
  stixConfidenceTier: string
  crossFeedCorroboration: number
  sightingSources: string[]
  firstSeen: string
}

export interface SubscriptionStats {
  total: number
  uniqueTenants: number
  popularFeeds: { name: string; count: number }[]
}

export interface MonitoringData {
  feedQuery: UseQueryResult<GlobalCatalogFeed[]>
  // useGlobalPipelineHealth (use-global-catalog.ts) overrides `data` with `?? null`,
  // which breaks UseQueryResult's discriminated union — QueryLike is the same shape
  // QueryStateView consumes, so this stays compatible without a strict union.
  pipelineQuery: QueryLike<PipelineHealth | null>
  iocStatsQuery: UseQueryResult<GlobalIocStats>
  leadersQuery: UseQueryResult<CorroborationLeader[]>
  subStatsQuery: UseQueryResult<SubscriptionStats>
  isLoading: boolean
  lastUpdated: Date | null
  pausePipeline: () => void
  resumePipeline: () => void
  retriggerFailed: (queueName: string) => void
}

// ─── IOC Stats Hook ──────────────────────────────────────

export function useGlobalIocStats(refreshInterval: number = 30_000) {
  return useQuery({
    queryKey: ['global-ioc-stats'],
    // Backend sends { data: stats }; api() already unwraps that envelope — stats IS the payload.
    // BACKEND GAP: the live route (/normalization/global-iocs/stats -> tenant-overlay-service's
    // getOverlayStats) returns OverlayStats (totalGlobalIocs, overlayCount, customSeverityCount,
    // customConfidenceCount, customTagsCount) — not this GlobalIocStats shape. A matching service
    // (GlobalIocStatsService.getGlobalStats in normalization/src/services/global-ioc-stats.ts)
    // exists but isn't wired to any route. Guard so the shape mismatch is an honest error, never
    // fabricated numbers. Fix is a backend route change — out of this frontend-only slice.
    queryFn: () => api<GlobalIocStats>('/normalization/global-iocs/stats').then(d => {
      if (d == null || typeof (d as unknown as Record<string, unknown>)?.byType !== 'object') {
        throw new Error('Unexpected response from /normalization/global-iocs/stats')
      }
      return d
    }),
    meta: { resource: 'global IOC stats' },
    staleTime: refreshInterval,
    refetchInterval: refreshInterval,
  })
}

// ─── Corroboration Leaders Hook ──────────────────────────

// Backend's TenantIocView (normalization/tenant-overlay-service.ts) has every CorroborationLeader
// field except sightingSources — that source-attribution list isn't tracked there yet.
function toCorroborationLeader(v: Record<string, unknown>): CorroborationLeader {
  return {
    id: v.id as string,
    value: v.value as string,
    iocType: v.iocType as string,
    confidence: v.confidence as number,
    stixConfidenceTier: v.stixConfidenceTier as string,
    crossFeedCorroboration: v.crossFeedCorroboration as number,
    sightingSources: [], // ponytail: backend doesn't track this yet; add when TenantIocView does
    firstSeen: v.firstSeen as string,
  }
}

export function useCorroborationLeaders(refreshInterval: number = 30_000) {
  return useQuery({
    queryKey: ['global-corroboration-leaders'],
    // Backend sends { data: TenantIocView[] } (no total/page); api() unwraps to the raw array.
    // NOTE: the route's ListQuerySchema has no sortBy/sortOrder field, so `?sortBy=...` below is
    // silently dropped and results come back in default (lastSeen desc) order, not corroboration
    // order — pre-existing backend schema gap, out of scope for this frontend slice.
    queryFn: () =>
      api<Record<string, unknown>[]>('/normalization/global-iocs?sortBy=crossFeedCorroboration&sortOrder=desc&limit=10')
        .then(r => (r ?? []).map(toCorroborationLeader)),
    meta: { resource: 'corroboration leaders' },
    staleTime: refreshInterval,
    refetchInterval: refreshInterval,
  })
}

// ─── Subscription Stats Hook ──────────────────────────────

// BLOCKED: no backend route exists at /ingestion/catalog/subscription-stats (only
// GET /ingestion/catalog/subscriptions, a raw list — not the aggregated {total,uniqueTenants,
// popularFeeds} shape this hook needs). Always 404s -> honest error card, not demo. Needs a new
// backend aggregation endpoint before this can be fixed; out of scope for this frontend slice.
export function useSubscriptionStats(refreshInterval: number = 60_000) {
  return useQuery({
    queryKey: ['global-subscription-stats'],
    queryFn: () => api<SubscriptionStats>('/ingestion/catalog/subscription-stats'),
    meta: { resource: 'subscription stats' },
    staleTime: refreshInterval,
  })
}

// ─── Main composite hook ──────────────────────────────────

export function useGlobalMonitoring(refreshInterval: number = 30_000): MonitoringData {
  const qc = useQueryClient()
  const feedQuery = useGlobalCatalog()
  const pipelineQuery = useGlobalPipelineHealth()
  const iocStatsQuery = useGlobalIocStats(refreshInterval)
  const leadersQuery = useCorroborationLeaders(refreshInterval)
  const subStatsQuery = useSubscriptionStats(refreshInterval)

  const pauseMut = useMutation({
    mutationFn: () => api('/ingestion/global-pipeline/pause', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['global-pipeline-health'] }),
  })

  const resumeMut = useMutation({
    mutationFn: () => api('/ingestion/global-pipeline/resume', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['global-pipeline-health'] }),
  })

  const retriggerMut = useMutation({
    mutationFn: (queueName: string) => api(`/ingestion/global-pipeline/retrigger/${encodeURIComponent(queueName)}`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['global-pipeline-health'] }),
  })

  const isLoading = feedQuery.isLoading || pipelineQuery.isLoading || iocStatsQuery.isLoading

  return {
    feedQuery,
    pipelineQuery,
    iocStatsQuery,
    leadersQuery,
    subStatsQuery,
    isLoading,
    lastUpdated: isLoading ? null : new Date(),
    pausePipeline: () => pauseMut.mutate(),
    resumePipeline: () => resumeMut.mutate(),
    retriggerFailed: (queueName: string) => retriggerMut.mutate(queueName),
  }
}
