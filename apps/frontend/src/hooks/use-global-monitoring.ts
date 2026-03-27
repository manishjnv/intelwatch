/**
 * @module hooks/use-global-monitoring
 * @description TanStack Query hooks for the Global Pipeline Monitoring dashboard.
 * Aggregates data from ingestion + normalization services. Demo fallback for all.
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'
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

export interface MonitoringData {
  pipelineHealth: PipelineHealth | null
  feedHealth: GlobalCatalogFeed[]
  iocStats: GlobalIocStats | null
  corroborationLeaders: CorroborationLeader[]
  subscriptionStats: { total: number; uniqueTenants: number; popularFeeds: { name: string; count: number }[] }
  isLoading: boolean
  error: Error | null
  isDemo: boolean
  lastUpdated: Date | null
  pausePipeline: () => void
  resumePipeline: () => void
  retriggerFailed: (queueName: string) => void
}

// ─── Demo Data ──────────────────────────────────────────────

const DEMO_IOC_STATS: GlobalIocStats = {
  totalGlobalIOCs: 4820,
  created24h: 580,
  enriched24h: 420,
  unenriched: 145,
  warninglistFiltered: 312,
  avgConfidence: 68,
  highConfidenceCount: 1940,
  byType: { ip: 1800, domain: 1200, hash: 680, cve: 540, url: 380, email: 220 },
  byConfidenceTier: { None: 120, Low: 860, Medium: 1900, High: 1940 },
}

const DEMO_LEADERS: CorroborationLeader[] = [
  { id: 'gl-1', value: '185.220.101.34', iocType: 'ip', confidence: 95, stixConfidenceTier: 'High', crossFeedCorroboration: 7, sightingSources: ['OTX', 'CISA', 'Abuse.ch', 'NVD', 'MISP', 'THN', 'BleepingComputer'], firstSeen: new Date(Date.now() - 30 * 86_400_000).toISOString() },
  { id: 'gl-2', value: 'evil-payload.darknet.ru', iocType: 'domain', confidence: 92, stixConfidenceTier: 'High', crossFeedCorroboration: 5, sightingSources: ['OTX', 'Abuse.ch', 'MISP', 'THN', 'GreyNoise'], firstSeen: new Date(Date.now() - 14 * 86_400_000).toISOString() },
  { id: 'gl-3', value: 'CVE-2024-21887', iocType: 'cve', confidence: 98, stixConfidenceTier: 'High', crossFeedCorroboration: 6, sightingSources: ['NVD', 'CISA', 'THN', 'Rapid7', 'Qualys', 'Tenable'], firstSeen: new Date(Date.now() - 60 * 86_400_000).toISOString() },
  { id: 'gl-4', value: '45.33.32.156', iocType: 'ip', confidence: 88, stixConfidenceTier: 'High', crossFeedCorroboration: 4, sightingSources: ['Shodan', 'GreyNoise', 'OTX', 'Abuse.ch'], firstSeen: new Date(Date.now() - 7 * 86_400_000).toISOString() },
  { id: 'gl-5', value: 'a1b2c3d4e5f67890abcdef', iocType: 'hash', confidence: 82, stixConfidenceTier: 'High', crossFeedCorroboration: 3, sightingSources: ['MalwareBazaar', 'VT', 'MISP'], firstSeen: new Date(Date.now() - 5 * 86_400_000).toISOString() },
  { id: 'gl-6', value: 'CVE-2024-3400', iocType: 'cve', confidence: 96, stixConfidenceTier: 'High', crossFeedCorroboration: 5, sightingSources: ['NVD', 'CISA', 'Palo Alto', 'THN', 'Rapid7'], firstSeen: new Date(Date.now() - 45 * 86_400_000).toISOString() },
  { id: 'gl-7', value: 'malware-c2.evil.com', iocType: 'domain', confidence: 78, stixConfidenceTier: 'High', crossFeedCorroboration: 3, sightingSources: ['OTX', 'MISP', 'THN'], firstSeen: new Date(Date.now() - 3 * 86_400_000).toISOString() },
  { id: 'gl-8', value: '192.168.255.99', iocType: 'ip', confidence: 72, stixConfidenceTier: 'High', crossFeedCorroboration: 3, sightingSources: ['GreyNoise', 'Shodan', 'OTX'], firstSeen: new Date(Date.now() - 10 * 86_400_000).toISOString() },
  { id: 'gl-9', value: 'phishing-kit.zip', iocType: 'hash', confidence: 68, stixConfidenceTier: 'Medium', crossFeedCorroboration: 2, sightingSources: ['MalwareBazaar', 'MISP'], firstSeen: new Date(Date.now() - 2 * 86_400_000).toISOString() },
  { id: 'gl-10', value: 'CVE-2023-44487', iocType: 'cve', confidence: 90, stixConfidenceTier: 'High', crossFeedCorroboration: 4, sightingSources: ['NVD', 'CISA', 'Cloudflare', 'Google'], firstSeen: new Date(Date.now() - 90 * 86_400_000).toISOString() },
]

const DEMO_SUB_STATS = {
  total: 42,
  uniqueTenants: 8,
  popularFeeds: [
    { name: 'NVD CVE Feed', count: 91 },
    { name: 'CISA KEV Global', count: 78 },
    { name: 'AlienVault OTX Global', count: 45 },
  ],
}

// ─── withDemoFallback ──────────────────────────────────────

function withDemoFallback<T>(
  result: UseQueryResult<T>,
  demoData: T,
  hasData: (d: T | undefined) => boolean,
) {
  const isDemo = !result.isLoading && !hasData(result.data)
  return { ...result, data: isDemo ? demoData : result.data, isDemo }
}

// ─── IOC Stats Hook ──────────────────────────────────────

export function useGlobalIocStats(refreshInterval: number = 30_000) {
  const result = useQuery({
    queryKey: ['global-ioc-stats'],
    queryFn: () =>
      api<{ data: GlobalIocStats }>('/normalization/global-iocs/stats')
        .then(r => r?.data ?? null)
        .catch(err => notifyApiError(err, 'global IOC stats', null)),
    staleTime: refreshInterval,
    refetchInterval: refreshInterval,
  })
  return withDemoFallback(result, DEMO_IOC_STATS, d => d != null && (d as GlobalIocStats).totalGlobalIOCs > 0)
}

// ─── Corroboration Leaders Hook ──────────────────────────

export function useCorroborationLeaders(refreshInterval: number = 30_000) {
  const empty: CorroborationLeader[] = []
  const result = useQuery({
    queryKey: ['global-corroboration-leaders'],
    queryFn: () =>
      api<{ data: CorroborationLeader[] }>('/normalization/global-iocs?sortBy=crossFeedCorroboration&sortOrder=desc&limit=10')
        .then(r => r?.data ?? empty)
        .catch(err => notifyApiError(err, 'corroboration leaders', empty)),
    staleTime: refreshInterval,
    refetchInterval: refreshInterval,
  })
  return withDemoFallback(result, DEMO_LEADERS, d => (d?.length ?? 0) > 0)
}

// ─── Subscription Stats Hook ──────────────────────────────

export function useSubscriptionStats(refreshInterval: number = 60_000) {
  const result = useQuery({
    queryKey: ['global-subscription-stats'],
    queryFn: () =>
      api<{ data: typeof DEMO_SUB_STATS }>('/ingestion/catalog/subscription-stats')
        .then(r => r?.data ?? null)
        .catch(() => null),
    staleTime: refreshInterval,
  })
  return withDemoFallback(result, DEMO_SUB_STATS, d => d != null && (d as typeof DEMO_SUB_STATS).total > 0)
}

// ─── Main composite hook ──────────────────────────────────

export function useGlobalMonitoring(refreshInterval: number = 30_000): MonitoringData {
  const qc = useQueryClient()
  const { data: feedHealth, isLoading: feedsLoading, isDemo: feedsDemo } = useGlobalCatalog()
  const { data: pipelineHealth, isLoading: healthLoading, isDemo: healthDemo } = useGlobalPipelineHealth()
  const { data: iocStats, isLoading: statsLoading, isDemo: statsDemo } = useGlobalIocStats(refreshInterval)
  const { data: leaders, isDemo: leadersDemo } = useCorroborationLeaders(refreshInterval)
  const { data: subStats, isDemo: subDemo } = useSubscriptionStats(refreshInterval)

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

  const isDemo = feedsDemo || healthDemo || statsDemo || leadersDemo || subDemo
  const isLoading = feedsLoading || healthLoading || statsLoading

  return {
    pipelineHealth: pipelineHealth ?? null,
    feedHealth: feedHealth ?? [],
    iocStats: iocStats ?? null,
    corroborationLeaders: leaders ?? [],
    subscriptionStats: subStats ?? DEMO_SUB_STATS,
    isLoading,
    error: null,
    isDemo,
    lastUpdated: isLoading ? null : new Date(),
    pausePipeline: () => pauseMut.mutate(),
    resumePipeline: () => resumeMut.mutate(),
    retriggerFailed: (queueName: string) => retriggerMut.mutate(queueName),
  }
}
