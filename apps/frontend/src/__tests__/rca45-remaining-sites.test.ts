/**
 * @module __tests__/rca45-remaining-sites
 * @description RCA #45 double-unwrap fixes for the sites not covered by the earlier
 * rca45-*.test.ts files: use-analytics-dashboard.ts (trends) and use-onboarding-feeds.ts
 * (catalog + feed validation). Each was typed api<{data:...}> when api() already unwraps
 * that envelope, so `.data` reads were always undefined.
 *
 * Type-only sites (use-intel-data useUpdateIOCLifecycle, use-plan-builder create/update,
 * use-compliance-reports generate report/dsar, use-tenant-overrides create/update) have no
 * consumer reading the mutation result — verified by grep of onSuccess callbacks — so they
 * need no regression test per the task contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@/test/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))
vi.mock('@/hooks/useApiError', () => ({
  notifyApiError: vi.fn(),
}))

import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import { useOnboardingFeeds } from '@/hooks/use-onboarding-feeds'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { mockApi.mockReset() })

describe('useAnalyticsDashboard — trends real backend shape (array, not {data:[...]})', () => {
  it('iocTrend/alertTrend populate from the unwrapped trends array', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path.startsWith('/analytics/trends')) {
        return Promise.resolve([
          { metric: 'ioc.total', points: [{ timestamp: '2026-03-20', value: 4000 }] },
          { metric: 'alert.open', points: [{ timestamp: '2026-03-20', value: 30 }] },
        ])
      }
      if (path.startsWith('/analytics/distributions')) return Promise.resolve({ byType: {}, bySeverity: {}, byConfidenceTier: {}, byLifecycle: {} })
      if (path.startsWith('/analytics/cost-tracking')) return Promise.resolve({ totalCostUsd: 0, costPerArticle: 0, costPerIoc: 0, byModel: {}, trend: [] })
      if (path.startsWith('/analytics/enrichment-quality')) return Promise.resolve({ highConfidence: 0, mediumConfidence: 0, lowConfidence: 0, pendingEnrichment: 0, highPct: 0 })
      if (path.startsWith('/analytics/feed-performance')) return Promise.resolve({ totalArticles: 0, feeds: [] })
      if (path.startsWith('/analytics/alert-summary')) return Promise.resolve({ total: 0 })
      if (path.startsWith('/analytics/top-iocs')) return Promise.resolve([])
      if (path.startsWith('/analytics/top-actors')) return Promise.resolve([])
      if (path.startsWith('/analytics/top-vulns')) return Promise.resolve([])
      if (path.startsWith('/analytics')) return Promise.resolve({ widgets: { 'total-iocs': { value: 5000 }, 'active-feeds': { value: 15 } } })
      return Promise.resolve(null)
    })

    const { result } = renderHook(() => useAnalyticsDashboard('7d'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemo).toBe(false)
    expect(result.current.iocTrend).toEqual([{ date: '2026-03-20', count: 4000 }])
    expect(result.current.alertTrend).toEqual([{ date: '2026-03-20', count: 30 }])
  })
})

describe('useOnboardingFeeds — catalog real backend shape ({data: feeds}, not double-wrapped)', () => {
  it('catalog feeds come through, not empty', async () => {
    mockApi.mockResolvedValueOnce([
      { id: 'f1', name: 'Feed One', feedType: 'rss', minPlanTier: 'free', enabled: true },
    ])
    const { result } = renderHook(() => useOnboardingFeeds('free'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.globalFeeds).toHaveLength(1)
    expect(result.current.globalFeeds[0]?.name).toBe('Feed One')
  })
})

describe('useOnboardingFeeds — testFeed() real backend shape ({data: result}, not double-wrapped)', () => {
  it('validation result comes through, not the "No response" fallback', async () => {
    mockApi.mockResolvedValueOnce([]) // catalog query on mount
    const { result } = renderHook(() => useOnboardingFeeds('free'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    mockApi.mockResolvedValueOnce({ valid: true, feedTitle: 'Real Feed', articleCount: 12, responseTimeMs: 42 })
    let validation: Awaited<ReturnType<typeof result.current.testFeed>> | undefined
    await act(async () => {
      validation = await result.current.testFeed('https://example.com/feed.xml')
    })
    expect(validation?.valid).toBe(true)
    expect(validation?.feedTitle).toBe('Real Feed')
  })
})
