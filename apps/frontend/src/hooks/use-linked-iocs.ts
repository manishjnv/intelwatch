/**
 * @module hooks/use-linked-iocs
 * @description TanStack Query hook for linked IOCs across entity types.
 * Fetches from: /actors/:id/iocs, /malware/:id/iocs, /iocs/:id/pivot
 * Client-side filtering + sorting (data usually < 100 IOCs).
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'

// ─── Types ──────────────────────────────────────────────────────

export type EntityType = 'actor' | 'malware' | 'campaign' | 'vulnerability'

export interface LinkedIoc {
  id: string
  iocType: string
  normalizedValue: string
  severity: string
  confidence?: number
  relationship?: string
  lastSeen?: string | null
  source?: string
}

interface ListResponse {
  data: LinkedIoc[]
  total?: number
}

// ─── Demo Data ──────────────────────────────────────────────────

const DEMO_LINKED_IOCS: LinkedIoc[] = [
  { id: 'li-1', iocType: 'ip', normalizedValue: '185.220.101.1', severity: 'critical', confidence: 88, relationship: 'attributed', lastSeen: '2025-03-20T00:00:00Z', source: 'global' },
  { id: 'li-2', iocType: 'domain', normalizedValue: 'evil-c2.net', severity: 'high', confidence: 75, relationship: 'used_by', lastSeen: '2025-03-18T00:00:00Z', source: 'global' },
  { id: 'li-3', iocType: 'hash_sha256', normalizedValue: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', severity: 'high', confidence: 82, relationship: 'drops', lastSeen: '2025-03-15T00:00:00Z', source: 'private' },
  { id: 'li-4', iocType: 'url', normalizedValue: 'http://malware-cdn.ru/payload.exe', severity: 'medium', confidence: 60, relationship: 'contacts', lastSeen: '2025-03-10T00:00:00Z', source: 'global' },
  { id: 'li-5', iocType: 'cve', normalizedValue: 'CVE-2024-3400', severity: 'critical', confidence: 95, relationship: 'exploits', lastSeen: '2025-03-22T00:00:00Z', source: 'global' },
]

// ─── Endpoint mapping ───────────────────────────────────────────

function getEndpoint(entityType: EntityType, entityId: string): string {
  switch (entityType) {
    case 'actor': return `/actors/${entityId}/iocs`
    case 'malware': return `/malware/${entityId}/iocs`
    case 'vulnerability': return `/vulnerabilities/${entityId}/iocs`
    case 'campaign': return `/iocs/${entityId}/pivot`
    default: return `/iocs/${entityId}/pivot`
  }
}

// ─── Hook ───────────────────────────────────────────────────────

export function useLinkedIocs(entityId: string | null, entityType: EntityType) {
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sevFilter, setSevFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<'confidence' | 'lastSeen' | 'severity'>('confidence')
  const [visibleCount, setVisibleCount] = useState(20)

  const result = useQuery({
    queryKey: ['linked-iocs', entityType, entityId],
    queryFn: async () => {
      if (!entityId) return [] as LinkedIoc[]
      try {
        const endpoint = getEndpoint(entityType, entityId)
        const res = await api<ListResponse | { relatedIOCs?: LinkedIoc[] }>(endpoint + '?limit=100')
        // Handle pivot response shape vs list response shape
        if ('relatedIOCs' in (res ?? {})) {
          return ((res as any).relatedIOCs ?? []) as LinkedIoc[]
        }
        return ((res as ListResponse)?.data ?? []) as LinkedIoc[]
      } catch (err) {
        notifyApiError(err, 'linked IOCs', null)
        return [] as LinkedIoc[]
      }
    },
    enabled: !!entityId,
    staleTime: 60_000,
  })

  const raw = result.data && result.data.length > 0 ? result.data : DEMO_LINKED_IOCS
  const isDemo = !result.isLoading && (!result.data || result.data.length === 0)

  const filtered = useMemo(() => {
    let items = [...raw]
    if (typeFilter !== 'all') items = items.filter(i => i.iocType === typeFilter)
    if (sevFilter !== 'all') items = items.filter(i => i.severity === sevFilter)

    const SEV_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
    items.sort((a, b) => {
      if (sortKey === 'confidence') return (b.confidence ?? 0) - (a.confidence ?? 0)
      if (sortKey === 'severity') return (SEV_ORDER[b.severity] ?? 0) - (SEV_ORDER[a.severity] ?? 0)
      if (sortKey === 'lastSeen') return (b.lastSeen ?? '').localeCompare(a.lastSeen ?? '')
      return 0
    })
    return items
  }, [raw, typeFilter, sevFilter, sortKey])

  // Type/severity breakdown for summary bar
  const typeBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    raw.forEach(i => { map[i.iocType] = (map[i.iocType] ?? 0) + 1 })
    return map
  }, [raw])

  const sevBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    raw.forEach(i => { map[i.severity] = (map[i.severity] ?? 0) + 1 })
    return map
  }, [raw])

  return {
    iocs: filtered.slice(0, visibleCount),
    totalCount: raw.length,
    filteredCount: filtered.length,
    isLoading: result.isLoading,
    isDemo,
    typeFilter, setTypeFilter,
    sevFilter, setSevFilter,
    sortKey, setSortKey,
    hasMore: filtered.length > visibleCount,
    loadMore: () => setVisibleCount(c => c + 20),
    typeBreakdown,
    sevBreakdown,
  }
}
