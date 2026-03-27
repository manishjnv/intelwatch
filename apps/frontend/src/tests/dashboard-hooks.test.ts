import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// Mock the api function
const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}))

vi.mock('@/hooks/useApiError', () => ({
  notifyApiError: vi.fn((_err: unknown, _ctx: string, fallback: unknown) => fallback),
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

  it('fetches from /analytics/enrichment-quality endpoint', async () => {
    const apiData = {
      data: {
        avgQuality: 80, enrichedCount: 100, unenrichedCount: 20,
        enrichedPercent: 83, bySource: { Shodan: { success: 80, total: 100, rate: 80 } },
      },
    }
    mockApi.mockResolvedValueOnce(apiData)

    const { result } = renderHook(() => useEnrichmentSourceBreakdown(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockApi).toHaveBeenCalledWith('/analytics/enrichment-quality')
    expect(result.current.data?.avgQuality).toBe(80)
    expect(result.current.isDemo).toBe(false)
  })

  it('returns demo fallback when API fails', async () => {
    mockApi.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useEnrichmentSourceBreakdown(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemo).toBe(true)
    expect(result.current.data?.avgQuality).toBe(72)
    expect(result.current.data?.bySource).toHaveProperty('Shodan')
  })
})

describe('useAiCostSummary', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('fetches from /analytics/cost-tracking endpoint', async () => {
    const apiData = {
      data: {
        totalCost30d: 20, previousCost30d: 18, deltaPercent: 11,
        budgetMonthly: 100, budgetUtilization: 20,
        byModel: { Haiku: 5, Sonnet: 15 },
        costPerArticle: 0.03, costPerIoc: 0.06,
      },
    }
    mockApi.mockResolvedValueOnce(apiData)

    const { result } = renderHook(() => useAiCostSummary(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockApi).toHaveBeenCalledWith('/analytics/cost-tracking')
    expect(result.current.data?.totalCost30d).toBe(20)
    expect(result.current.isDemo).toBe(false)
  })

  it('returns demo fallback when API fails', async () => {
    mockApi.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useAiCostSummary(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemo).toBe(true)
    expect(result.current.data?.totalCost30d).toBe(12.50)
    expect(result.current.data?.byModel).toHaveProperty('Haiku')
  })

  it('returns correct data shapes', async () => {
    mockApi.mockRejectedValueOnce(new Error('fail'))

    const { result } = renderHook(() => useAiCostSummary(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const d = result.current.data!
    expect(typeof d.totalCost30d).toBe('number')
    expect(typeof d.deltaPercent).toBe('number')
    expect(typeof d.budgetUtilization).toBe('number')
    expect(typeof d.costPerArticle).toBe('number')
    expect(typeof d.costPerIoc).toBe('number')
    expect(typeof d.byModel).toBe('object')
  })
})
