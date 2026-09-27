/**
 * @module __tests__/use-phase6-no-demo
 * @description S161a: billing/admin-ops hooks in use-phase6-data.ts must never
 * fall back to demo data on API failure or on a malformed non-empty response.
 * Onboarding hooks are out of scope (still demo-fallback, converted in S161b).
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

import {
  useBillingPlans, useUsageMeters, useCurrentSubscription, usePaymentHistory, useBillingStats,
  useSystemHealth, useMaintenanceWindows, useAdminTenants, useAdminAuditLog, useAdminStats,
  useDlqStatus, useQueueHealth, useQueueAlerts,
} from '@/hooks/use-phase6-data'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  mockApi.mockReset()
})

// ─── Hooks with no shape guard beyond apiList's own normalisation ──

interface MinimalQueryResult {
  isSuccess: boolean
  isError: boolean
  data: unknown
}

const listHooks: [string, () => MinimalQueryResult][] = [
  ['usePaymentHistory', () => usePaymentHistory() as unknown as MinimalQueryResult],
  ['useMaintenanceWindows', () => useMaintenanceWindows() as unknown as MinimalQueryResult],
  ['useAdminTenants', () => useAdminTenants() as unknown as MinimalQueryResult],
  ['useAdminAuditLog', () => useAdminAuditLog() as unknown as MinimalQueryResult],
  ['useQueueAlerts', () => useQueueAlerts() as unknown as MinimalQueryResult],
]

describe.each(listHooks)('%s (no demo fallback)', (_name, hook) => {
  it('resolves API data unchanged', async () => {
    mockApi.mockResolvedValueOnce({ alerts: [] })
    const { result } = renderHook(hook, { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
  })

  it('surfaces the error instead of demo data on API failure', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(hook, { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})

// ─── Hooks with a shape guard on a non-empty/defined response ──────

describe('useBillingPlans', () => {
  it('resolves a well-shaped plan list', async () => {
    mockApi.mockResolvedValueOnce([{ id: 'free', name: 'Free', price: 0 }])
    const { result } = renderHook(() => useBillingPlans(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('errors on API failure (no demo plans)', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useBillingPlans(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('errors on a wrong-shaped non-empty response', async () => {
    mockApi.mockResolvedValueOnce([{ id: 'free', priceInr: 0 }])
    const { result } = renderHook(() => useBillingPlans(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('treats an empty array as valid data, not an error', async () => {
    mockApi.mockResolvedValueOnce([])
    const { result } = renderHook(() => useBillingPlans(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})

describe('useUsageMeters', () => {
  it('errors on API failure', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useUsageMeters(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('errors on wrong-shaped response', async () => {
    mockApi.mockResolvedValueOnce({ apiCalls: 5 })
    const { result } = renderHook(() => useUsageMeters(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useCurrentSubscription', () => {
  it('errors on API failure', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useCurrentSubscription(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('errors on wrong-shaped response', async () => {
    mockApi.mockResolvedValueOnce({ plan: 'teams' })
    const { result } = renderHook(() => useCurrentSubscription(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useBillingStats', () => {
  it('errors on API failure', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useBillingStats(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useSystemHealth', () => {
  it('errors on API failure', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useSystemHealth(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('errors on wrong-shaped response', async () => {
    mockApi.mockResolvedValueOnce({ services: 'not-an-array' })
    const { result } = renderHook(() => useSystemHealth(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useAdminStats', () => {
  it('errors on API failure', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useAdminStats(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useDlqStatus', () => {
  it('errors on API failure', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useDlqStatus(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('errors on wrong-shaped response', async () => {
    mockApi.mockResolvedValueOnce({ queues: null })
    const { result } = renderHook(() => useDlqStatus(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useQueueHealth', () => {
  it('errors on API failure', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useQueueHealth(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('errors on wrong-shaped response', async () => {
    mockApi.mockResolvedValueOnce({ queues: {} })
    const { result } = renderHook(() => useQueueHealth(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

// ─── Single-object guards must THROW on a null API response ────────
// (review fix: null used to slip through `d == null || ...` guards as falsy-short-circuit
// on some paths; useCurrentSubscription is the deliberate exception — null = no subscription)

const nullThrowsHooks: [string, () => MinimalQueryResult][] = [
  ['useUsageMeters', () => useUsageMeters() as unknown as MinimalQueryResult],
  ['useBillingStats', () => useBillingStats() as unknown as MinimalQueryResult],
  ['useSystemHealth', () => useSystemHealth() as unknown as MinimalQueryResult],
  ['useAdminStats', () => useAdminStats() as unknown as MinimalQueryResult],
  ['useDlqStatus', () => useDlqStatus() as unknown as MinimalQueryResult],
  ['useQueueHealth', () => useQueueHealth() as unknown as MinimalQueryResult],
]

describe('single-object guards reject a null API response', () => {
  it.each(nullThrowsHooks)('%s errors when the API resolves null', async (_name, hook) => {
    mockApi.mockResolvedValueOnce(null)
    const { result } = renderHook(hook, { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useCurrentSubscription null pass-through (deliberate exception)', () => {
  it('treats a null API response as "no subscription", not an error', async () => {
    mockApi.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useCurrentSubscription(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})

describe('useMaintenanceWindows — real admin-service row shape', () => {
  it('defaults affectedServices to [] (admin-service sends scope/tenantIds, no affectedServices)', async () => {
    mockApi.mockResolvedValueOnce([{
      id: 'm1', title: 'DB upgrade', description: '', type: 'planned', scope: 'platform', tenantIds: [],
      startsAt: '2026-09-28T00:00:00Z', endsAt: '2026-09-28T01:00:00Z', status: 'scheduled',
      createdBy: 'u1', createdAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:00Z',
    }])
    const { result } = renderHook(() => useMaintenanceWindows(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.data[0]?.affectedServices).toEqual([])
    expect(result.current.data?.data[0]?.title).toBe('DB upgrade')
  })
})
