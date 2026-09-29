import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// Mock the api function
const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

// Import hooks after mocking
const {
  useEnrichmentSourceBreakdown,
  useAiCostSummary,
} = await import('@/hooks/use-enrichment-data')

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useEnrichmentSourceBreakdown', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('fetches from /analytics/enrichment-quality and trusts a response with bySource', async () => {
    // api() already unwraps json.data, so mock returns the inner object directly
    const apiData = {
      avgQuality: 80, enrichedCount: 100, unenrichedCount: 20,
      enrichedPercent: 83, bySource: { Shodan: { success: 80, total: 100, rate: 80 } },
    }
    mockApi.mockResolvedValueOnce(apiData)

    const { result } = renderHook(() => useEnrichmentSourceBreakdown(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockApi).toHaveBeenCalledWith('/analytics/enrichment-quality')
    expect(result.current.data?.avgQuality).toBe(80)
    expect(result.current).not.toHaveProperty('isDemo')
  })

  it('the real backend shape today (confidence tiers, no bySource) yields honest null, not a crash', async () => {
    // This is what /analytics/enrichment-quality actually returns right now —
    // EnrichmentQuality, not the per-source breakdown this hook wants.
    mockApi.mockResolvedValueOnce({ total: 100, highPct: 60, mediumPct: 30, lowPct: 10 })

    const { result } = renderHook(() => useEnrichmentSourceBreakdown(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isError).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('on API failure, isError is true and data is null (no demo fallback)', async () => {
    mockApi.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useEnrichmentSourceBreakdown(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isError).toBe(true)
    expect(result.current.data).toBeNull()
  })
})

describe('useAiCostSummary', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('fetches from /analytics/cost-tracking and maps the real CostTrackingData shape', async () => {
    // api() already unwraps json.data; this is the real analytics-service shape
    // (aggregator.getCostTracking) — no 30-day delta or monthly budget exist server-side.
    const apiData = {
      totalCostUsd: 20,
      byModel: { Haiku: 5, Sonnet: 15 },
      costPerArticle: 0.03, costPerIoc: 0.06,
    }
    mockApi.mockResolvedValueOnce(apiData)

    const { result } = renderHook(() => useAiCostSummary(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockApi).toHaveBeenCalledWith('/analytics/cost-tracking')
    expect(result.current.data?.totalCostUsd).toBe(20)
    expect(result.current).not.toHaveProperty('isDemo')
  })

  it('on API failure, isError is true and data is null (no demo fallback)', async () => {
    mockApi.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useAiCostSummary(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isError).toBe(true)
    expect(result.current.data).toBeNull()
  })
})
