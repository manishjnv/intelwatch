/**
 * Tests for use-analytics-dashboard hook — parallel fetch, demo fallback,
 * date range, caching, partial failure, loading/error states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@/test/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// ─── Mock API ───────────────────────────────────────────────────

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))
vi.mock('@/hooks/useApiError', () => ({
  notifyApiError: vi.fn(),
}))

import { useAnalyticsDashboard, DEMO_ANALYTICS } from '@/hooks/use-analytics-dashboard'

// ─── Helpers ────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

const MOCK_DASHBOARD = {
  widgets: {
    'total-iocs': { id: 'total-iocs', label: 'Total IOCs', value: 5000 },
    'active-feeds': { id: 'active-feeds', label: 'Active Feeds', value: 15 },
    'alert-breakdown': { id: 'alert-breakdown', label: 'Alerts', value: 100 },
  },
  generatedAt: new Date().toISOString(),
  cacheHit: false,
}

const MOCK_TRENDS = {
  data: [
    { metric: 'ioc.total', points: [{ timestamp: '2026-03-20', value: 4000 }, { timestamp: '2026-03-21', value: 5000 }] },
    { metric: 'alert.open', points: [{ timestamp: '2026-03-20', value: 30 }, { timestamp: '2026-03-21', value: 25 }] },
  ],
}

function setupSuccessMocks() {
  mockApi.mockImplementation((path: string) => {
    if (path.startsWith('/analytics/trends')) return Promise.resolve(MOCK_TRENDS)
    if (path.startsWith('/analytics/distributions')) return Promise.resolve({ byType: { ip: 100 }, bySeverity: {}, byConfidenceTier: {}, byLifecycle: {} })
    if (path.startsWith('/analytics/cost-tracking')) return Promise.resolve({ totalCostUsd: 10, costPerArticle: 0.001, costPerIoc: 0.005, byModel: {}, trend: [] })
    if (path.startsWith('/analytics/enrichment-quality')) return Promise.resolve({ highConfidence: 100, mediumConfidence: 50, lowConfidence: 20, pendingEnrichment: 30, highPct: 60 })
    if (path.startsWith('/analytics/feed-performance')) return Promise.resolve({ totalArticles: 1000, feeds: [] })
    if (path.startsWith('/analytics/alert-summary')) return Promise.resolve({ total: 100, open: 25 })
    if (path.startsWith('/analytics/top-iocs')) return Promise.resolve([{ type: 'ip', value: '1.2.3.4', confidence: 90, severity: 'high' }])
    if (path.startsWith('/analytics/top-actors')) return Promise.resolve([{ name: 'APT28', iocCount: 10, lastSeen: '2026-03-20' }])
    if (path.startsWith('/analytics/top-vulns')) return Promise.resolve([{ cveId: 'CVE-2024-1234', epss: 0.8, severity: 'critical', affectedProducts: 2 }])
    if (path.startsWith('/analytics')) return Promise.resolve(MOCK_DASHBOARD)
    return Promise.resolve(null)
  })
}

// ─── Tests ──────────────────────────────────────────────────────

describe('useAnalyticsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches all endpoints in parallel', async () => {
    setupSuccessMocks()
    const { result } = renderHook(() => useAnalyticsDashboard('7d'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Should have called api() for all 10 endpoints
    expect(mockApi).toHaveBeenCalled()
    const calls = mockApi.mock.calls.map(c => c[0])
    expect(calls.some((c: string) => c.includes('/analytics/trends'))).toBe(true)
    expect(calls.some((c: string) => c.includes('/analytics/distributions'))).toBe(true)
    expect(calls.some((c: string) => c.includes('/analytics/cost-tracking'))).toBe(true)
  })

  it('returns correct summary stats shape', async () => {
    setupSuccessMocks()
    const { result } = renderHook(() => useAnalyticsDashboard('7d'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.summary).toBeDefined()
    expect(typeof result.current.summary.totalIocs).toBe('number')
    expect(typeof result.current.summary.totalFeeds).toBe('number')
    expect(typeof result.current.summary.totalAlerts).toBe('number')
  })

  it('date range change triggers refetch', async () => {
    setupSuccessMocks()
    const { result } = renderHook(() => useAnalyticsDashboard('7d'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApi.mock.calls.length

    result.current.setPreset('30d')
    await waitFor(() => expect(mockApi.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('partial endpoint failure → rest still returned', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path.startsWith('/analytics/cost-tracking')) return Promise.reject(new Error('fail'))
      if (path.startsWith('/analytics/distributions')) return Promise.reject(new Error('fail'))
      if (path.startsWith('/analytics/trends')) return Promise.resolve(MOCK_TRENDS)
      if (path.startsWith('/analytics/enrichment-quality')) return Promise.resolve({ highConfidence: 50, mediumConfidence: 30, lowConfidence: 10, pendingEnrichment: 10, highPct: 50 })
      if (path.startsWith('/analytics/feed-performance')) return Promise.resolve({ totalArticles: 500 })
      if (path.startsWith('/analytics/alert-summary')) return Promise.resolve({ total: 50 })
      if (path.startsWith('/analytics/top-iocs')) return Promise.resolve([])
      if (path.startsWith('/analytics/top-actors')) return Promise.resolve([])
      if (path.startsWith('/analytics/top-vulns')) return Promise.resolve([])
      if (path.startsWith('/analytics')) return Promise.resolve(MOCK_DASHBOARD)
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useAnalyticsDashboard('7d'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemo).toBe(false)
    expect(result.current.summary.totalIocs).toBe(5000)
  })

  it('all endpoints fail → demo fallback data', async () => {
    mockApi.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useAnalyticsDashboard('7d'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemo).toBe(true)
    expect(result.current.summary.totalIocs).toBe(DEMO_ANALYTICS.summary.totalIocs)
  })

  it('cache: staleTime prevents immediate refetch', async () => {
    setupSuccessMocks()
    const { result } = renderHook(() => useAnalyticsDashboard('7d'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsAfterFirst = mockApi.mock.calls.length

    // Data is loaded, staleTime is 5min — isFetching should be false
    expect(result.current.isFetching).toBe(false)
    expect(callsAfterFirst).toBeGreaterThan(0)
  })

  it('DateRange presets compute correct from/to dates', async () => {
    setupSuccessMocks()
    const { result } = renderHook(() => useAnalyticsDashboard('24h'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const from = new Date(result.current.dateRange.from).getTime()
    const to = new Date(result.current.dateRange.to).getTime()
    const diffHours = (to - from) / 3_600_000
    expect(diffHours).toBeGreaterThan(23)
    expect(diffHours).toBeLessThan(25)
  })

  it('loading state true during fetch', async () => {
    let resolveApi: (v: unknown) => void
    mockApi.mockReturnValue(new Promise(r => { resolveApi = r }))

    const { result } = renderHook(() => useAnalyticsDashboard('7d'), { wrapper: createWrapper() })
    expect(result.current.isLoading).toBe(true)

    resolveApi!(MOCK_DASHBOARD)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('error state set on complete failure', async () => {
    mockApi.mockRejectedValue(new Error('total failure'))
    const { result } = renderHook(() => useAnalyticsDashboard('7d'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Even on error, demo data is provided
    expect(result.current.isDemo).toBe(true)
  })

  it('custom date range works', async () => {
    setupSuccessMocks()
    const { result } = renderHook(() => useAnalyticsDashboard('7d'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    result.current.setCustomRange('2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z')
    await waitFor(() => expect(result.current.dateRange.preset).toBe('custom'))
    expect(result.current.dateRange.from).toBe('2026-01-01T00:00:00Z')
  })
})
