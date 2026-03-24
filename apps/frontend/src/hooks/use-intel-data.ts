/**
 * @module hooks/use-intel-data
 * @description TanStack Query hooks for all intelligence services.
 * Connects to: IOC (:3005/iocs), Feeds (:3004/feeds), Actors (:3008/actors),
 * Malware (:3009/malware), Vulnerabilities (:3010/vulnerabilities).
 * All queries go through nginx → backend services.
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { DEMO_IOCS_RESPONSE, DEMO_IOC_STATS, DEMO_DASHBOARD_STATS, DEMO_FEEDS_RESPONSE, DEMO_ACTORS_RESPONSE, DEMO_MALWARE_RESPONSE, DEMO_VULNS_RESPONSE } from './demo-data'
import type { EnrichmentStats } from './use-enrichment-data'

// ─── Generic list response shape ──────────────────────────────────

interface ListResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

interface QueryParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  [key: string]: string | number | boolean | undefined
}

function buildQuery(params: QueryParams): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') parts.push(`${k}=${encodeURIComponent(String(v))}`)
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

// ─── Demo fallback helper ───────────────────────────────────────

/** Wraps a query result: if the API errored or returned empty, substitute demo data */
function withDemoFallback<T>(
  result: UseQueryResult<T>,
  demoData: T,
  hasData: (d: T | undefined) => boolean,
) {
  const isDemo = !result.isLoading && !hasData(result.data)
  return { ...result, data: isDemo ? demoData : result.data, isDemo }
}

// ─── IOC types ──────────────────────────────────────────────────

export interface IOCRecord {
  id: string; iocType: string; normalizedValue: string; severity: string
  confidence: number; lifecycle: string; tlp: string; tags: string[]
  threatActors: string[]; malwareFamilies: string[]; firstSeen: string; lastSeen: string
  campaignId?: string | null
}

export function useIOCs(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  const empty = { data: [] as IOCRecord[], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['iocs', params],
    queryFn: () => api<ListResponse<IOCRecord>>(`/iocs${query}`).then(r => r ?? empty).catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_IOCS_RESPONSE, d => (d?.data?.length ?? 0) > 0)
}

export function useIOCStats() {
  const empty = { total: 0, byType: {}, bySeverity: {}, byLifecycle: {} }
  const result = useQuery({
    queryKey: ['ioc-stats'],
    queryFn: () => api<{ total: number; byType: Record<string, number>; bySeverity: Record<string, number>; byLifecycle: Record<string, number> }>('/iocs/stats').catch(() => empty),
    staleTime: 5 * 60_000,
  })
  return withDemoFallback(result, DEMO_IOC_STATS, d => (d?.total ?? 0) > 0)
}

// ─── Feed types ─────────────────────────────────────────────────

export interface FeedRecord {
  id: string; name: string; description: string | null; feedType: string
  url: string | null; schedule: string | null; status: string; enabled: boolean
  lastFetchAt: string | null; lastErrorAt: string | null; lastErrorMessage: string | null
  consecutiveFailures: number; totalItemsIngested: number; feedReliability: number
  createdAt: string; updatedAt: string
}

export function useFeeds(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  const empty = { data: [] as FeedRecord[], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['feeds', params],
    queryFn: () => api<ListResponse<FeedRecord>>(`/feeds${query}`).then(r => r ?? empty).catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_FEEDS_RESPONSE, d => (d?.data?.length ?? 0) > 0)
}

export function useRetryFeed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (feedId: string) =>
      api<{ feedId: string; status: string }>(`/feeds/${feedId}/trigger`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] })
    },
  })
}

// ─── Threat Actor types ─────────────────────────────────────────

export interface ActorRecord {
  id: string; name: string; aliases: string[]; actorType: string
  motivation: string; sophistication: string; country: string | null
  confidence: number; tlp: string; tags: string[]; active: boolean
  firstSeen: string | null; lastSeen: string | null
  mitreTechniques?: string[]
}

/** Compact IOC shape returned by /actors/:id/iocs and /malware/:id/iocs */
export interface LinkedIOC {
  id: string; iocType: string; normalizedValue: string; severity: string
}

export function useActors(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  const empty = { data: [] as ActorRecord[], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['actors', params],
    queryFn: () => api<ListResponse<ActorRecord>>(`/actors${query}`).then(r => r ?? empty).catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_ACTORS_RESPONSE, d => (d?.data?.length ?? 0) > 0)
}

// ─── Malware types ──────────────────────────────────────────────

export interface MalwareRecord {
  id: string; name: string; aliases: string[]; malwareType: string
  platforms: string[]; capabilities: string[]; confidence: number
  tlp: string; tags: string[]; active: boolean
  firstSeen: string | null; lastSeen: string | null
}

export function useMalware(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  const empty = { data: [] as MalwareRecord[], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['malware', params],
    queryFn: () => api<ListResponse<MalwareRecord>>(`/malware${query}`).then(r => r ?? empty).catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_MALWARE_RESPONSE, d => (d?.data?.length ?? 0) > 0)
}

// ─── Actor/Malware detail + linked IOC hooks ────────────────────

export function useActorDetail(id: string | null) {
  return useQuery({
    queryKey: ['actor-detail', id],
    queryFn: () => id ? api<ActorRecord>(`/actors/${id}`).catch(() => null) : null,
    enabled: !!id,
    staleTime: 60_000,
  })
}

export function useActorLinkedIOCs(id: string | null) {
  return useQuery({
    queryKey: ['actor-iocs', id],
    queryFn: () => id
      ? api<ListResponse<LinkedIOC>>(`/actors/${id}/iocs?limit=10`).then(r => r?.data ?? []).catch(() => [])
      : ([] as LinkedIOC[]),
    enabled: !!id,
    staleTime: 60_000,
  })
}

export function useMalwareLinkedIOCs(id: string | null) {
  return useQuery({
    queryKey: ['malware-iocs', id],
    queryFn: () => id
      ? api<ListResponse<LinkedIOC>>(`/malware/${id}/iocs?limit=10`).then(r => r?.data ?? []).catch(() => [])
      : ([] as LinkedIOC[]),
    enabled: !!id,
    staleTime: 60_000,
  })
}

// ─── Vulnerability types ────────────────────────────────────────

export interface VulnRecord {
  id: string; cveId: string; description: string; cvssV3Score: number
  cvssV3Severity: string; epssScore: number; epssPercentile: number
  cisaKev: boolean; exploitedInWild: boolean; exploitAvailable: boolean
  priorityScore: number; affectedProducts: string[]; affectedVendors: string[]
  weaknessType: string | null; confidence: number; tlp: string; tags: string[]
  active: boolean; publishedDate: string | null; firstSeen: string | null; lastSeen: string | null
}

export function useVulnerabilities(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  const empty = { data: [] as VulnRecord[], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['vulnerabilities', params],
    queryFn: () => api<ListResponse<VulnRecord>>(`/vulnerabilities${query}`).then(r => r ?? empty).catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_VULNS_RESPONSE, d => (d?.data?.length ?? 0) > 0)
}

// ─── Dashboard stats ────────────────────────────────────────────

export function useDashboardStats() {
  const result = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Aggregate from multiple services - fail gracefully per service
      const [iocStats, feedStats, enrichStats] = await Promise.allSettled([
        api<{ total: number; byType: Record<string, number>; bySeverity: Record<string, number> }>('/iocs/stats'),
        api<ListResponse<FeedRecord>>('/feeds?limit=1'),
        api<EnrichmentStats>('/enrichment/stats'),
      ])

      const ioc = iocStats.status === 'fulfilled' ? iocStats.value : null
      const feeds = feedStats.status === 'fulfilled' ? feedStats.value : null
      const enrich = enrichStats.status === 'fulfilled' ? enrichStats.value : null

      return {
        totalIOCs: ioc?.total ?? 0,
        criticalIOCs: ioc?.bySeverity?.['critical'] ?? 0,
        activeFeeds: feeds?.total ?? 0,
        enrichedToday: enrich?.enrichedToday ?? 0,
        lastIngestTime: 'Live',
      }
    },
    staleTime: 30_000,
  })
  return withDemoFallback(result, DEMO_DASHBOARD_STATS, d => (d?.totalIOCs ?? 0) > 0)
}
