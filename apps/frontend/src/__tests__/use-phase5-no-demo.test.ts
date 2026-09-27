/**
 * @module __tests__/use-phase5-no-demo
 * @description User Management hooks in use-phase5-data must surface API errors and never
 * fall back to demo rows (S161a honest-UI). Covers useUsers, useTeams, useRoles, useSessions,
 * useAuditLog, useUserManagementStats.
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
  useUsers, useTeams, useRoles, useSessions, useAuditLog, useUserManagementStats,
} from '@/hooks/use-phase5-data'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { mockApi.mockReset() })

describe('use-phase5-data — User Management hooks (no demo fallback)', () => {
  const cases: [string, () => { data: unknown; isLoading: boolean; isError: boolean }][] = [
    ['useUsers', () => useUsers()],
    ['useTeams', () => useTeams()],
    ['useRoles', () => useRoles()],
    ['useSessions', () => useSessions()],
    ['useAuditLog', () => useAuditLog()],
  ]

  for (const [name, hook] of cases) {
    it(`${name}: resolves → returns the API list unchanged`, async () => {
      mockApi.mockResolvedValueOnce({ data: [{ id: '1' }], total: 1, page: 1, limit: 50 })
      const { result } = renderHook(hook, { wrapper })
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.isError).toBe(false)
      expect(result.current.data).toEqual({ data: [{ id: '1' }], total: 1, page: 1, limit: 50 })
    })

    it(`${name}: rejects → isError true, no demo data`, async () => {
      mockApi.mockRejectedValueOnce(new Error('boom'))
      const { result } = renderHook(hook, { wrapper })
      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.data).toBeUndefined()
    })

    it(`${name}: empty list is valid data, not an error`, async () => {
      mockApi.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 })
      const { result } = renderHook(hook, { wrapper })
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.isError).toBe(false)
      expect(result.current.data).toEqual({ data: [], total: 0, page: 1, limit: 50 })
    })
  }

  it('useUserManagementStats: resolves → returns stats unchanged', async () => {
    const stats = { totalUsers: 6, activeSessions: 3, teams: 4, roles: 6, mfaPercent: 67 }
    mockApi.mockResolvedValueOnce(stats)
    const { result } = renderHook(() => useUserManagementStats(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(stats)
  })

  it('useUserManagementStats: rejects → isError true, no demo stats', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useUserManagementStats(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
