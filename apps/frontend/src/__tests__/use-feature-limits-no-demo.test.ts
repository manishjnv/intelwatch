/**
 * @module __tests__/use-feature-limits-no-demo.test
 * @description useFeatureLimits() must never fall back to demo entries; useFeatureEnabled
 * defaults to true on error/unknown key (API still enforces server-side) and honors an
 * explicit enabled:false.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@/test/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}))

import { useFeatureLimits, useFeatureEnabled } from '@/hooks/use-feature-limits'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useFeatureLimits (no demo fallback)', () => {
  it('returns empty features + isError true on API failure — no demo entries', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useFeatureLimits(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.features).toEqual([])
  })
})

describe('useFeatureEnabled', () => {
  it('returns false when the entry explicitly sets enabled:false', async () => {
    mockApi.mockResolvedValueOnce([{ featureKey: 'ai_enrichment', enabled: false }])
    const { result } = renderHook(() => useFeatureEnabled('ai_enrichment'), { wrapper })
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns true when the entry explicitly sets enabled:true', async () => {
    mockApi.mockResolvedValueOnce([{ featureKey: 'ai_enrichment', enabled: true }])
    const { result } = renderHook(() => useFeatureEnabled('ai_enrichment'), { wrapper })
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns true when the key is missing from the list', async () => {
    mockApi.mockResolvedValueOnce([])
    const { result } = renderHook(() => useFeatureEnabled('ai_enrichment'), { wrapper })
    await waitFor(() => expect(mockApi).toHaveBeenCalled())
    expect(result.current).toBe(true)
  })
})
