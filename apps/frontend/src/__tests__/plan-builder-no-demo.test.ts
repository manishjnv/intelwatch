/**
 * @module __tests__/plan-builder-no-demo
 * @description S161a: usePlanBuilder must return an empty plan list and
 * surface the error on API failure — never DEMO_PLANS (removed).
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

import { usePlanBuilder } from '@/hooks/use-plan-builder'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  mockApi.mockReset()
})

describe('usePlanBuilder (no demo fallback)', () => {
  it('returns real plans on success', async () => {
    mockApi.mockResolvedValueOnce({ data: [{ id: '1', planId: 'free', name: 'Free', sortOrder: 0 }], total: 1 })
    const { result } = renderHook(() => usePlanBuilder(), { wrapper })
    await waitFor(() => expect(result.current.plans.length).toBe(1))
    expect(result.current.plans[0]!.name).toBe('Free')
  })

  it('returns an empty plan list and isError on API failure — no DEMO plan names', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => usePlanBuilder(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.plans).toEqual([])
    const names = JSON.stringify(result.current.plans)
    expect(names).not.toMatch(/Starter|Enterprise|Teams/)
  })
})
