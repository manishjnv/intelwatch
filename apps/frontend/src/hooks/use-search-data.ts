/**
 * @module hooks/use-search-data
 * @description TanStack Query hook for Elasticsearch IOC full-text search.
 * Connects to es-indexing service (port 3020) via nginx /api/v1/search/iocs.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'

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

// ─── Hook ────────────────────────────────────────────────────────

/**
 * Full-text IOC search via Elasticsearch.
 * Honest result: real data, loading state, or isError for the caller to handle
 * (e.g. via QueryStateView) — no demo substitution.
 */
export function useIOCSearch(query: string, filters: SearchFilters = {}) {
  const trimmed = query.trim()
  const enabled = trimmed.length >= 2
  const empty: SearchResponse = { data: [], total: 0, took: 0, page: 1, limit: 50 }

  return useQuery({
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
        .catch(err => notifyApiError(err, 'IOC search', empty))
    },
    enabled,
    staleTime: 60_000,
    retry: 1,
  })
}
