/**
 * @module hooks/use-global-search-results
 * @description Data fetch for the ⌘K GlobalSearch dropdown (DashboardLayout).
 * Mirrors use-es-search.ts's call shape: same endpoint, same api() envelope,
 * same notifyApiError fallback pattern — but maps to shared-ui's SearchResult.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'
import type { SearchResult } from '@etip/shared-ui/components/GlobalSearch'

interface GlobalSearchApiResponse {
  total: number
  page: number
  limit: number
  data: Array<{
    iocId: string
    value: string
    type: string
    severity: string
  }>
}

function toSearchResults(res: GlobalSearchApiResponse): SearchResult[] {
  return res.data.map(doc => ({
    id: doc.iocId,
    type: doc.type,
    value: doc.value,
    severity: doc.severity,
    category: 'iocs',
  }))
}

export function useGlobalSearchResults(query: string) {
  const q = query.trim()
  return useQuery<SearchResult[]>({
    queryKey: ['global-search', q],
    queryFn: async () => {
      return api<GlobalSearchApiResponse>(`/search/iocs?q=${encodeURIComponent(q)}&limit=20`)
        .then(toSearchResults)
        .catch(err => notifyApiError(err, 'global search', []))
    },
    enabled: q.length >= 2,
    staleTime: 30_000,
    retry: false,
  })
}
