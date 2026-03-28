/**
 * @module __tests__/use-command-center.test
 * @description Tests for the Command Center data hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock auth store
const mockUser = { id: 'u1', email: 'admin@test.com', displayName: 'Admin', role: 'super_admin', tenantId: 't1', avatarUrl: null }
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: any) => any) => selector({ user: mockUser, accessToken: 'token', tenant: { id: 't1', name: 'Test', slug: 'test', plan: 'teams' } }),
}))

// Mock api
vi.mock('@/lib/api', () => ({
  api: vi.fn().mockRejectedValue(new Error('not connected')),
  ApiError: class extends Error { status: number; code: string; constructor(s: number, c: string, m: string) { super(m); this.status = s; this.code = c } },
}))

// Mock notifyApiError
vi.mock('@/hooks/useApiError', () => ({
  notifyApiError: vi.fn((_err, _resource, fallback) => fallback),
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

  it('returns demo data when API is unreachable', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemo).toBe(true)
    expect(result.current.globalStats.totalItems).toBe(12450)
    expect(result.current.globalStats.totalCostUsd).toBe(142.30)
  })

  it('identifies super_admin role', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isSuperAdmin).toBe(true)
  })

  it('returns demo tenant list with 5 tenants', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tenantList).toHaveLength(5)
    expect(result.current.tenantList[0].name).toBe('Acme Corp')
  })

  it('returns demo queue stats', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.queueStats.pendingItems).toBe(34)
    expect(result.current.queueStats.processingRate).toBe(42)
  })

  it('returns demo provider keys', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.providerKeys).toHaveLength(3)
    expect(result.current.providerKeys[0].provider).toBe('anthropic')
    expect(result.current.providerKeys[0].isValid).toBe(true)
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

  it('returns tenant stats with demo data', async () => {
    const { result } = renderHook(() => useCommandCenter(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tenantStats.itemsConsumed).toBe(3200)
    expect(result.current.tenantStats.budgetUsedPercent).toBe(62)
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
