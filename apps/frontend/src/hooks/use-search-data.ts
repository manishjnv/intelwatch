/**
 * @module hooks/use-search-data
 * @description TanStack Query hook for Elasticsearch IOC full-text search.
 * Connects to es-indexing service (port 3020) via nginx /api/v1/search/iocs.
 * Demo fallback: 5 hardcoded results when API unavailable or query is empty.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────

export interface SearchResult {
  id: string
  iocType: string
  normalizedValue: string
  severity: string
  confidence: number
  lifecycle: string
  tlp: string
  firstSeen: string
  lastSeen: string
  score?: number
}

export interface SearchFilters {
  type?: string
  severity?: string
  tlp?: string
  lifecycle?: string
  page?: number
  limit?: number
}

interface SearchResponse {
  data: SearchResult[]
  total: number
  took: number
  page: number
  limit: number
}

// ─── Demo data ───────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

export const DEMO_SEARCH_RESULTS: SearchResult[] = [
  {
    id: 'srch-1', iocType: 'ip', normalizedValue: '185.220.101.34',
    severity: 'critical', confidence: 92, lifecycle: 'active', tlp: 'red',
    firstSeen: daysAgo(28), lastSeen: daysAgo(0), score: 9.8,
  },
  {
    id: 'srch-2', iocType: 'domain', normalizedValue: 'evil-payload.darknet.ru',
    severity: 'critical', confidence: 95, lifecycle: 'new', tlp: 'red',
    firstSeen: daysAgo(5), lastSeen: daysAgo(0), score: 9.5,
  },
  {
    id: 'srch-3', iocType: 'hash_sha256', normalizedValue: 'e3b0c44298fc1c149afb4c8996fb92427ae41e4649b934ca495991b7852b855',
    severity: 'high', confidence: 88, lifecycle: 'active', tlp: 'amber',
    firstSeen: daysAgo(12), lastSeen: daysAgo(1), score: 7.4,
  },
  {
    id: 'srch-4', iocType: 'url', normalizedValue: 'https://phishing-login.example.net/auth',
    severity: 'high', confidence: 75, lifecycle: 'active', tlp: 'amber',
    firstSeen: daysAgo(10), lastSeen: daysAgo(1), score: 6.9,
  },
  {
    id: 'srch-5', iocType: 'cve', normalizedValue: 'CVE-2024-3400',
    severity: 'critical', confidence: 99, lifecycle: 'active', tlp: 'white',
    firstSeen: daysAgo(60), lastSeen: daysAgo(2), score: 6.2,
  },
]

const DEMO_SEARCH_RESPONSE: SearchResponse = {
  data: DEMO_SEARCH_RESULTS,
  total: DEMO_SEARCH_RESULTS.length,
  took: 0,
  page: 1,
  limit: 50,
}

// ─── Hook ────────────────────────────────────────────────────────

/**
 * Full-text IOC search via Elasticsearch.
 * Returns demo data when the API is unavailable or query < 2 chars.
 * Results are cached for 60 s and shown immediately from cache on re-query.
 */
export function useIOCSearch(query: string, filters: SearchFilters = {}) {
  const trimmed = query.trim()
  const enabled = trimmed.length >= 2

  const result = useQuery({
    queryKey: ['ioc-search', trimmed, filters],
    queryFn: async (): Promise<SearchResponse> => {
      const params = new URLSearchParams({ q: trimmed })
      if (filters.type)      params.set('type', filters.type)
      if (filters.severity)  params.set('severity', filters.severity)
      if (filters.tlp)       params.set('tlp', filters.tlp)
      if (filters.lifecycle) params.set('lifecycle', filters.lifecycle)
      if (filters.page)      params.set('page', String(filters.page))
      if (filters.limit)     params.set('limit', String(filters.limit ?? 50))
      return api<SearchResponse>(`/search/iocs?${params.toString()}`)
    },
    enabled,
    staleTime: 60_000,
    retry: 1,
  })

  // Show demo data when: disabled (query too short) OR API errored/empty
  const isDemo = !enabled || (!result.isLoading && !(result.data?.data?.length ?? 0 > 0) && !result.isError)
  const isApiError = result.isError || (!result.isLoading && enabled && !(result.data?.data?.length ?? 0 > 0))

  return {
    ...result,
    data: isDemo ? DEMO_SEARCH_RESPONSE : result.data,
    isDemo,
    isApiError,
  }
}
