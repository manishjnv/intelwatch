/**
 * @module __tests__/use-phase5-no-demo
 * @description User Management hooks in use-phase5-data must surface API errors and never
 * fall back to demo rows (S161a/S162 honest-UI). Covers useUsers, useSessions, useAuditLog,
 * useUserManagementStats. useTeams/useCreateTeam/useInviteUser/useCreateRole/useRevokeAllSessions
 * were removed (S162 — no backing route); useRoles is now a static reference list, covered
 * separately below.
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
  useUsers, useRoles, useSessions, useAuditLog, useUserManagementStats,
} from '@/hooks/use-phase5-data'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { mockApi.mockReset() })

describe('useRoles — static reference list, no network call', () => {
  it('returns the 3 real Prisma roles without calling api()', () => {
    const { result } = renderHook(() => useRoles(), { wrapper })
    expect(mockApi).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
    expect(result.current.data.data.map((r) => r.id)).toEqual(['super_admin', 'tenant_admin', 'analyst'])
  })
})

describe('use-phase5-data — User Management hooks (no demo fallback)', () => {
  const cases: [string, () => { data: unknown; isLoading: boolean; isError: boolean }][] = [
    ['useUsers', () => useUsers()],
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

  it('useSessions: resolves → maps GET /auth/sessions (bare SessionInfo[]) to SessionRecord[]', async () => {
    mockApi.mockResolvedValueOnce([
      { id: 's1', ipAddress: '1.2.3.4', userAgent: 'Chrome/1.0', geoCity: null, geoCountry: null, geoIsp: null, createdAt: '2026-01-01T00:00:00Z', lastUsedAt: '2026-01-02T00:00:00Z', isCurrent: true, suspiciousLogin: false },
    ])
    const { result } = renderHook(() => useSessions(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockApi).toHaveBeenCalledWith('/auth/sessions')
    expect(result.current.isError).toBe(false)
    expect(result.current.data).toEqual({
      data: [{
        id: 's1', userId: '', userName: 'You (this session)', ip: '1.2.3.4', device: 'Chrome/1.0',
        startedAt: '2026-01-01T00:00:00Z', lastActivity: '2026-01-02T00:00:00Z', status: 'active',
      }],
      total: 1, page: 1, limit: 1,
    })
  })

  it('useSessions: rejects → isError true, no demo data', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useSessions(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

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
