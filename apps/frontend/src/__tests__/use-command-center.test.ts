/**
 * @module __tests__/use-command-center.test
 * @description Tests for the Command Center data hook — honest data only
 * (DECISION-048): EMPTY shape while loading/on error, isError surfaced,
 * never a demo fallback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock auth store
const mockUser = { id: 'u1', email: 'admin@test.com', displayName: 'Admin', role: 'super_admin', tenantId: 't1', avatarUrl: null }
const mockTenant = { id: 't1', name: 'Test', slug: 'test', plan: 'starter' }
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: any) => any) => selector({ user: mockUser, accessToken: 'token', tenant: mockTenant }),
}))

// Mock api — every call rejects, so the hook must surface isError, never demo data.
vi.mock('@/lib/api', () => ({
  api: vi.fn().mockRejectedValue(new Error('not connected')),
  ApiError: class extends Error { status: number; code: string; constructor(s: number, c: string, m: string) { super(m); this.status = s; this.code = c } },
}))

vi.mock('@/lib/api-list', () => ({
  apiList: vi.fn().mockRejectedValue(new Error('not connected')),
}))

import { useCommandCenter } from '@/hooks/use-command-center'

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
}

describe('useCommandCenter', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('surfaces isError and an EMPTY shape when every query fails — never demo data', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(true)
    expect(result.current.globalStats.totalItems).toBe(0)
    expect(result.current.globalStats.totalCostUsd).toBe(0)
  })

  it('identifies super_admin role', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isSuperAdmin).toBe(true)
  })

  it('returns an empty tenant list on failure, never fabricated tenants', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tenantList).toHaveLength(0)
  })

  it('returns EMPTY queue stats on failure', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.queueStats.pendingItems).toBe(0)
    expect(result.current.queueStats.processingRate).toBe(0)
  })

  it('returns an empty provider key list on failure', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.providerKeys).toHaveLength(0)
  })

  it('reads tenantPlan from the real auth-store tenant, never a hardcoded plan', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tenantPlan).toBe('starter')
  })

  it('defaults to month period', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.period).toBe('month')
  })

  it('setPeriod changes the period', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(() => { result.current.setPeriod('week') })
    expect(result.current.period).toBe('week')
  })

  it('returns EMPTY tenant stats (with budget fields undefined) on failure', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tenantStats.itemsConsumed).toBe(0)
    expect(result.current.tenantStats.budgetUsedPercent).toBeUndefined()
  })

  it('has refetchAll function', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetchAll).toBe('function')
  })

  it('has mutation functions for provider keys', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.setProviderKey).toBe('function')
    expect(typeof result.current.testProviderKey).toBe('function')
    expect(typeof result.current.removeProviderKey).toBe('function')
  })
})
