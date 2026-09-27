/**
 * @module __tests__/rca45-enrichment-pending
 * @description RCA #45 fix: useEnrichmentPending was typed api<{data,total,page,limit}>
 * but api() already unwraps the outer envelope, so `total` was always undefined
 * (pagination silently broken). Now uses apiList() which normalizes correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@/test/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

import { useEnrichmentPending } from '@/hooks/use-enrichment-data'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { mockApi.mockReset() })

describe('useEnrichmentPending — real backend shape (single-wrapped {data,total,page,limit})', () => {
  it('total/page/limit come through correctly, not dropped', async () => {
    // This is exactly what api() returns after unwrapping the enrichment service's
    // { data: [...], total, page, limit } response.
    mockApi.mockResolvedValueOnce({
      data: [{ id: 'ioc-1', iocType: 'ip', normalizedValue: '1.2.3.4', confidence: 80, severity: 'high', createdAt: '2026-01-01T00:00:00.000Z' }],
      total: 42, page: 1, limit: 20,
    })
    const { result } = renderHook(() => useEnrichmentPending(1, 20), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.total).toBe(42)
    expect(result.current.data?.data).toHaveLength(1)
    expect(result.current.data?.data[0]?.normalizedValue).toBe('1.2.3.4')
  })

  it('on failure, falls back to the empty-list shape without throwing', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useEnrichmentPending(1, 20), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual({ data: [], total: 0, page: 1, limit: 20 })
  })
})
