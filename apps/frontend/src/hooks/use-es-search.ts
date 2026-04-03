/**
 * @module hooks/use-es-search
 * @description Enhanced Elasticsearch IOC search hook with URL sync, faceted filters, demo fallback.
 * Connects to es-indexing service (port 3020) via GET /api/v1/search/iocs.
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useDebouncedValue } from './useDebouncedValue'
import { notifyApiError } from './useApiError'

// ─── Types ───────────────────────────────────────────────────

export interface EsSearchFilters {
  type?: string[]
  severity?: string[]
  tlp?: string[]
  enriched?: boolean
  confidenceMin?: number
  confidenceMax?: number
  page?: number
  pageSize?: number
}

export interface EsSearchResult {
  id: string
  iocType: string
  value: string
  severity: string
  confidence: number
  tags: string[]
  firstSeen: string
  lastSeen: string
  enriched: boolean
  tlp: string
  sourceId?: string
  campaignIds?: string[]
  actorIds?: string[]
}

export interface FacetBucket {
  key: string
  count: number
}

export interface EsSearchFacets {
  byType: FacetBucket[]
  bySeverity: FacetBucket[]
  byTlp: FacetBucket[]
}

interface EsApiResponse {
  total: number
  page: number
  limit: number
  data: Array<{
    iocId: string
    value: string
    type: string
    severity: string
    confidence: number
    tags: string[]
    firstSeen: string
    lastSeen: string
    enriched: boolean
    tlp: string
    sourceId?: string
    campaignIds?: string[]
    actorIds?: string[]
  }>
  aggregations: {
    by_type: FacetBucket[]
    by_severity: FacetBucket[]
    by_tlp: FacetBucket[]
  }
}

const EMPTY_RESPONSE: EsApiResponse = {
  total: 0, page: 1, limit: 50, data: [],
  aggregations: { by_type: [], by_severity: [], by_tlp: [] },
}

// ─── URL param helpers ──────────────────────────────────────

function filtersFromParams(params: URLSearchParams): EsSearchFilters {
  const arr = (key: string) => {
    const v = params.get(key)
    return v ? v.split(',').filter(Boolean) : undefined
  }
  const num = (key: string) => {
    const v = params.get(key)
    return v ? Number(v) : undefined
  }
  return {
    type: arr('type'),
    severity: arr('severity'),
    tlp: arr('tlp'),
    enriched: params.get('enriched') === 'true' ? true : undefined,
    confidenceMin: num('conf_min'),
    confidenceMax: num('conf_max'),
    page: num('page') ?? 1,
    pageSize: num('size') ?? 50,
  }
}

function filtersToParams(query: string, filters: EsSearchFilters, sortBy: string): Record<string, string> {
  const p: Record<string, string> = {}
  if (query) p.q = query
  if (filters.type?.length) p.type = filters.type.join(',')
  if (filters.severity?.length) p.severity = filters.severity.join(',')
  if (filters.tlp?.length) p.tlp = filters.tlp.join(',')
  if (filters.enriched) p.enriched = 'true'
  if (filters.confidenceMin != null) p.conf_min = String(filters.confidenceMin)
  if (filters.confidenceMax != null) p.conf_max = String(filters.confidenceMax)
  if ((filters.page ?? 1) > 1) p.page = String(filters.page)
  if ((filters.pageSize ?? 50) !== 50) p.size = String(filters.pageSize)
  if (sortBy !== 'relevance') p.sort = sortBy
  return p
}

// ─── Demo data ──────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

export const DEMO_ES_RESULTS: EsSearchResult[] = [
  { id: 'es-1', iocType: 'ip', value: '185.220.101.34', severity: 'critical', confidence: 92, tags: ['tor-exit', 'c2'], firstSeen: daysAgo(28), lastSeen: daysAgo(0), enriched: true, tlp: 'RED' },
  { id: 'es-2', iocType: 'domain', value: 'evil-payload.darknet.ru', severity: 'critical', confidence: 95, tags: ['malware-delivery', 'apt'], firstSeen: daysAgo(5), lastSeen: daysAgo(0), enriched: true, tlp: 'RED' },
  { id: 'es-3', iocType: 'hash_sha256', value: 'e3b0c44298fc1c149afb4c8996fb924...', severity: 'high', confidence: 88, tags: ['ransomware'], firstSeen: daysAgo(12), lastSeen: daysAgo(1), enriched: true, tlp: 'AMBER' },
  { id: 'es-4', iocType: 'url', value: 'https://phishing-login.example.net/auth', severity: 'high', confidence: 75, tags: ['phishing'], firstSeen: daysAgo(10), lastSeen: daysAgo(1), enriched: false, tlp: 'AMBER' },
  { id: 'es-5', iocType: 'cve', value: 'CVE-2024-3400', severity: 'critical', confidence: 99, tags: ['palo-alto', 'rce'], firstSeen: daysAgo(60), lastSeen: daysAgo(2), enriched: true, tlp: 'WHITE' },
  { id: 'es-6', iocType: 'ip', value: '91.219.236.174', severity: 'high', confidence: 78, tags: ['c2', 'backdoor'], firstSeen: daysAgo(21), lastSeen: daysAgo(1), enriched: true, tlp: 'AMBER' },
  { id: 'es-7', iocType: 'domain', value: 'c2-beacon.malware.top', severity: 'high', confidence: 82, tags: ['c2', 'botnet'], firstSeen: daysAgo(18), lastSeen: daysAgo(1), enriched: false, tlp: 'RED' },
  { id: 'es-8', iocType: 'email', value: 'attacker@phish-domain.com', severity: 'medium', confidence: 65, tags: ['phishing', 'bec'], firstSeen: daysAgo(7), lastSeen: daysAgo(3), enriched: false, tlp: 'GREEN' },
  { id: 'es-9', iocType: 'ip', value: '203.0.113.42', severity: 'medium', confidence: 61, tags: ['scanner', 'recon'], firstSeen: daysAgo(14), lastSeen: daysAgo(2), enriched: false, tlp: 'GREEN' },
  { id: 'es-10', iocType: 'cve', value: 'CVE-2023-44228', severity: 'critical', confidence: 97, tags: ['log4j', 'rce'], firstSeen: daysAgo(90), lastSeen: daysAgo(1), enriched: true, tlp: 'WHITE' },
  { id: 'es-11', iocType: 'domain', value: 'tracker.adnetwork.info', severity: 'low', confidence: 40, tags: ['tracking'], firstSeen: daysAgo(30), lastSeen: daysAgo(10), enriched: false, tlp: 'GREEN' },
  { id: 'es-12', iocType: 'hash_md5', value: 'd41d8cd98f00b204e9800998ecf8427e', severity: 'medium', confidence: 55, tags: ['dropper'], firstSeen: daysAgo(8), lastSeen: daysAgo(4), enriched: true, tlp: 'AMBER' },
  { id: 'es-13', iocType: 'ip', value: '45.33.32.156', severity: 'low', confidence: 45, tags: ['shodan', 'recon'], firstSeen: daysAgo(30), lastSeen: daysAgo(7), enriched: false, tlp: 'GREEN' },
  { id: 'es-14', iocType: 'url', value: 'http://malware-cdn.ru/payload.exe', severity: 'critical', confidence: 91, tags: ['malware-delivery'], firstSeen: daysAgo(3), lastSeen: daysAgo(0), enriched: true, tlp: 'RED' },
  { id: 'es-15', iocType: 'domain', value: 'login-verify.microsft-secure.com', severity: 'high', confidence: 85, tags: ['typosquat', 'phishing'], firstSeen: daysAgo(2), lastSeen: daysAgo(0), enriched: true, tlp: 'RED' },
  { id: 'es-16', iocType: 'ip', value: '198.51.100.23', severity: 'low', confidence: 30, tags: ['probe'], firstSeen: daysAgo(25), lastSeen: daysAgo(10), enriched: false, tlp: 'WHITE' },
  { id: 'es-17', iocType: 'cve', value: 'CVE-2024-21887', severity: 'critical', confidence: 96, tags: ['ivanti', 'rce'], firstSeen: daysAgo(45), lastSeen: daysAgo(0), enriched: true, tlp: 'WHITE' },
  { id: 'es-18', iocType: 'hash_sha256', value: 'a1b2c3d4e5f67890abcdef1234567890...', severity: 'high', confidence: 72, tags: ['infostealer'], firstSeen: daysAgo(6), lastSeen: daysAgo(2), enriched: false, tlp: 'AMBER' },
  { id: 'es-19', iocType: 'domain', value: 'data-exfil.cobaltstrike.net', severity: 'critical', confidence: 93, tags: ['c2', 'cobalt-strike'], firstSeen: daysAgo(15), lastSeen: daysAgo(0), enriched: true, tlp: 'RED' },
  { id: 'es-20', iocType: 'email', value: 'ceo@company-invoice.biz', severity: 'medium', confidence: 58, tags: ['bec', 'impersonation'], firstSeen: daysAgo(4), lastSeen: daysAgo(1), enriched: false, tlp: 'AMBER' },
]

const DEMO_FACETS: EsSearchFacets = {
  byType: [
    { key: 'ip', count: 5 }, { key: 'domain', count: 6 }, { key: 'cve', count: 3 },
    { key: 'hash_sha256', count: 2 }, { key: 'url', count: 2 }, { key: 'email', count: 2 },
  ],
  bySeverity: [
    { key: 'critical', count: 7 }, { key: 'high', count: 5 },
    { key: 'medium', count: 4 }, { key: 'low', count: 4 },
  ],
  byTlp: [
    { key: 'RED', count: 6 }, { key: 'AMBER', count: 5 },
    { key: 'GREEN', count: 4 }, { key: 'WHITE', count: 5 },
  ],
}

// ─── Export helpers ──────────────────────────────────────────

function exportCsv(results: EsSearchResult[]) {
  const headers = ['Type', 'Value', 'Severity', 'Confidence', 'TLP', 'Tags', 'First Seen', 'Last Seen', 'Enriched']
  const rows = results.map(r => [
    r.iocType, r.value, r.severity, r.confidence, r.tlp,
    r.tags.join('; '), r.firstSeen, r.lastSeen, r.enriched,
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `ioc-search-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function exportJson(results: EsSearchResult[]) {
  const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `ioc-search-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Hook ───────────────────────────────────────────────────

export function useEsSearch() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tenantId = useAuthStore(s => s.user?.tenantId)

  // Selection state for multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Restore state from URL on mount
  const [query, setQueryState] = useState(searchParams.get('q') ?? '')
  const [filters, setFiltersState] = useState<EsSearchFilters>(() => filtersFromParams(searchParams))
  const [sortBy, setSortBy] = useState(searchParams.get('sort') ?? 'relevance')

  const debouncedQuery = useDebouncedValue(query, 300)
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 50

  // Sync URL params when state changes
  useEffect(() => {
    const newParams = filtersToParams(debouncedQuery, filters, sortBy)
    setSearchParams(newParams, { replace: true })
  }, [debouncedQuery, filters, sortBy, setSearchParams])

  // Build API query string
  const apiParams = useMemo(() => {
    const p = new URLSearchParams()
    if (tenantId) p.set('tenantId', tenantId)
    if (debouncedQuery.trim()) p.set('q', debouncedQuery.trim())
    if (filters.type?.length === 1) p.set('type', filters.type[0])
    if (filters.severity?.length === 1) p.set('severity', filters.severity[0])
    if (filters.tlp?.length === 1) p.set('tlp', filters.tlp[0])
    if (filters.enriched != null) p.set('enriched', String(filters.enriched))
    p.set('page', String(page))
    p.set('limit', String(pageSize))
    return p.toString()
  }, [tenantId, debouncedQuery, filters, page, pageSize])

  const result = useQuery({
    queryKey: ['es-search', apiParams],
    queryFn: async (): Promise<EsApiResponse> => {
      return api<EsApiResponse>(`/search/iocs?${apiParams}`)
        .catch(err => notifyApiError(err, 'IOC search', EMPTY_RESPONSE))
    },
    enabled: !!tenantId,
    staleTime: 30_000,
    retry: 1,
  })

  // Transform API response to component-friendly shape
  const apiData = result.data
  const hasApiData = !!apiData && apiData.data?.length > 0

  const rawResults: EsSearchResult[] = useMemo(() => {
    if (!hasApiData) return []
    return apiData!.data.map(d => ({
      id: d.iocId,
      iocType: d.type,
      value: d.value,
      severity: d.severity,
      confidence: d.confidence,
      tags: d.tags,
      firstSeen: d.firstSeen,
      lastSeen: d.lastSeen,
      enriched: d.enriched,
      tlp: d.tlp,
      sourceId: d.sourceId,
      campaignIds: d.campaignIds,
      actorIds: d.actorIds,
    }))
  }, [hasApiData, apiData])

  // Client-side confidence filtering (ES doesn't support range queries on confidence)
  const results = useMemo(() => {
    let filtered = rawResults
    if (filters.confidenceMin != null) {
      filtered = filtered.filter(r => r.confidence >= filters.confidenceMin!)
    }
    if (filters.confidenceMax != null) {
      filtered = filtered.filter(r => r.confidence <= filters.confidenceMax!)
    }
    // Client-side multi-value filters (ES only supports single value)
    if (filters.type && filters.type.length > 1) {
      filtered = filtered.filter(r => filters.type!.includes(r.iocType))
    }
    if (filters.severity && filters.severity.length > 1) {
      filtered = filtered.filter(r => filters.severity!.includes(r.severity))
    }
    if (filters.tlp && filters.tlp.length > 1) {
      filtered = filtered.filter(r => filters.tlp!.includes(r.tlp))
    }
    return filtered
  }, [rawResults, filters])

  const facets: EsSearchFacets = useMemo(() => {
    if (!hasApiData || !apiData?.aggregations) return { byType: [], bySeverity: [], byTlp: [] }
    const agg = apiData.aggregations
    return {
      byType: agg.by_type ?? [],
      bySeverity: agg.by_severity ?? [],
      byTlp: agg.by_tlp ?? [],
    }
  }, [hasApiData, apiData])

  const isDemo = !result.isLoading && !hasApiData && !result.isError
  const searchTimeMs = hasApiData ? (apiData as any)?.took ?? 0 : 0

  // Public setters
  const setQuery = useCallback((q: string) => {
    setQueryState(q)
    setFiltersState(prev => ({ ...prev, page: 1 }))
  }, [])

  const setFilters = useCallback((f: EsSearchFilters) => {
    setFiltersState(prev => ({ ...prev, ...f, page: 1 }))
  }, [])

  const setPage = useCallback((p: number) => {
    setFiltersState(prev => ({ ...prev, page: p }))
  }, [])

  const setPageSize = useCallback((s: number) => {
    setFiltersState(prev => ({ ...prev, pageSize: s, page: 1 }))
  }, [])

  const clearAll = useCallback(() => {
    setQueryState('')
    setFiltersState({ page: 1, pageSize: 50 })
    setSortBy('relevance')
  }, [])

  const exportResults = useCallback((format: 'csv' | 'json') => {
    const data = isDemo ? DEMO_ES_RESULTS : results
    if (format === 'csv') exportCsv(data)
    else exportJson(data)
  }, [results, isDemo])

  // Parse search syntax: type:ip, severity:critical, tag:malware, "exact phrase"
  const parsedQuery = useMemo(() => {
    let q = debouncedQuery.trim()
    const syntaxTypes: string[] = []
    const syntaxSeverities: string[] = []
    const syntaxTags: string[] = []

    // Extract type:xxx
    q = q.replace(/\btype:(\w+)/gi, (_, val) => { syntaxTypes.push(val.toLowerCase()); return '' })
    // Extract severity:xxx
    q = q.replace(/\bseverity:(\w+)/gi, (_, val) => { syntaxSeverities.push(val.toLowerCase()); return '' })
    // Extract tag:xxx
    q = q.replace(/\btag:([\w-]+)/gi, (_, val) => { syntaxTags.push(val.toLowerCase()); return '' })
    // Extract "exact phrase"
    const exactPhrases: string[] = []
    q = q.replace(/"([^"]+)"/g, (_, phrase) => { exactPhrases.push(phrase.toLowerCase()); return '' })

    return { text: q.trim(), syntaxTypes, syntaxSeverities, syntaxTags, exactPhrases }
  }, [debouncedQuery])

  // Apply client-side filtering to demo data
  const demoFiltered = useMemo(() => {
    if (!isDemo) return DEMO_ES_RESULTS
    let data = [...DEMO_ES_RESULTS]
    const { text, syntaxTypes, syntaxSeverities, syntaxTags, exactPhrases } = parsedQuery

    // Text search (remaining text after syntax extraction)
    if (text) {
      const q = text.toLowerCase()
      data = data.filter(r =>
        r.value.toLowerCase().includes(q) ||
        r.tags.some(t => t.toLowerCase().includes(q)) ||
        r.iocType.toLowerCase().includes(q)
      )
    }

    // Exact phrase matching
    for (const phrase of exactPhrases) {
      data = data.filter(r =>
        r.value.toLowerCase().includes(phrase) ||
        r.tags.some(t => t.toLowerCase().includes(phrase))
      )
    }

    // Search syntax filters (merged with sidebar filters)
    const allTypes = [...(filters.type ?? []), ...syntaxTypes]
    const allSeverities = [...(filters.severity ?? []), ...syntaxSeverities]

    if (allTypes.length) {
      data = data.filter(r => allTypes.includes(r.iocType))
    }
    if (allSeverities.length) {
      data = data.filter(r => allSeverities.includes(r.severity))
    }
    if (syntaxTags.length) {
      data = data.filter(r => syntaxTags.some(tag => r.tags.some(t => t.toLowerCase().includes(tag))))
    }

    // Sidebar-only filters (TLP, enriched, confidence)
    if (filters.tlp?.length) {
      data = data.filter(r => filters.tlp!.includes(r.tlp))
    }
    if (filters.enriched != null) {
      data = data.filter(r => r.enriched === filters.enriched)
    }
    if (filters.confidenceMin != null) {
      data = data.filter(r => r.confidence >= filters.confidenceMin!)
    }

    // Sort
    if (sortBy === 'confidence_desc') data.sort((a, b) => b.confidence - a.confidence)
    else if (sortBy === 'severity_desc') {
      const sevOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
      data.sort((a, b) => (sevOrder[b.severity] ?? 0) - (sevOrder[a.severity] ?? 0))
    }
    else if (sortBy === 'lastSeen_desc') data.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    else if (sortBy === 'firstSeen_asc') data.sort((a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime())

    return data
  }, [isDemo, parsedQuery, filters, sortBy])

  // Recompute facets from filtered demo data
  const demoFacets: EsSearchFacets = useMemo(() => {
    if (!isDemo) return DEMO_FACETS
    const base = demoFiltered.length > 0 ? DEMO_ES_RESULTS : []
    const byType: Record<string, number> = {}
    const bySeverity: Record<string, number> = {}
    const byTlp: Record<string, number> = {}
    for (const r of base) {
      byType[r.iocType] = (byType[r.iocType] ?? 0) + 1
      bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1
      byTlp[r.tlp] = (byTlp[r.tlp] ?? 0) + 1
    }
    return {
      byType: Object.entries(byType).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
      bySeverity: Object.entries(bySeverity).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
      byTlp: Object.entries(byTlp).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    }
  }, [isDemo, demoFiltered])

  // Paginate demo results
  const demoPaginated = useMemo(() => {
    if (!isDemo) return demoFiltered
    const start = (page - 1) * pageSize
    return demoFiltered.slice(start, start + pageSize)
  }, [isDemo, demoFiltered, page, pageSize])

  // ─── Selection ──────────────────────────────────────────────

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const toggleSelectAll = useCallback(() => {
    const allResults = isDemo ? demoPaginated : results
    setSelectedIds(prev => {
      if (prev.size === allResults.length) return new Set()
      return new Set(allResults.map(r => r.id))
    })
  }, [isDemo, demoPaginated, results])

  const bulkSearch = useCallback((values: string[]) => {
    const joined = values.join(' OR ')
    setQueryState(joined)
    setFiltersState(prev => ({ ...prev, page: 1 }))
  }, [])

  return {
    // Query state
    query,
    setQuery,
    filters,
    setFilters,
    sortBy,
    setSortBy,
    page,
    setPage,
    pageSize,
    setPageSize,

    // Results
    results: isDemo ? demoPaginated : results,
    totalCount: isDemo ? demoFiltered.length : (apiData?.total ?? 0),
    facets: isDemo ? demoFacets : facets,
    isLoading: result.isLoading,
    isDemo,
    error: result.error,
    searchTimeMs,

    // Actions
    clearAll,
    exportResults,

    // Selection
    selectedIds,
    toggleSelection,
    clearSelection,
    toggleSelectAll,

    // Bulk search
    bulkSearch,
  }
}
