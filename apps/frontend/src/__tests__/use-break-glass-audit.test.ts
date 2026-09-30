/**
 * @module __tests__/use-break-glass-audit
 * @description RCA #45 class: api() already unwraps the gateway's { data: entries, total } envelope.
 * useBreakGlassAudit must still hand the panel a { data: [...] } list, or BreakGlassPanel crashes on
 * `auditEntries.length` (prod: Command Center → System → Emergency Access).
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
vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn() }))

import { useBreakGlassAudit } from '@/hooks/use-break-glass'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { mockApi.mockReset() })

describe('useBreakGlassAudit — real api() return shape', () => {
  it('returns a { data: [...] } list when api() resolves the unwrapped entries array', async () => {
    const entry = { id: 'a1', event: 'login', timestamp: '2026-09-27T00:00:00Z' }
    mockApi.mockResolvedValueOnce([entry])
    const { result } = renderHook(() => useBreakGlassAudit({ page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data.data).toEqual([{ ...entry, ip: '—', location: '—', details: null, riskLevel: 'critical' }])
  })

  it('maps raw Prisma AuditLog rows (what user-service really returns) to the panel shape', async () => {
    mockApi.mockResolvedValueOnce([{
      id: 'r1', tenantId: 't1', userId: null, action: 'break_glass.login.success', entityType: 'user',
      entityId: 'u1', changes: { reason: 'drill' }, ipAddress: '10.0.0.1', createdAt: '2026-09-27T08:00:00Z',
    }])
    const { result } = renderHook(() => useBreakGlassAudit({ page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data.data[0]).toEqual({
      id: 'r1', event: 'login.success', ip: '10.0.0.1', location: '—',
      timestamp: '2026-09-27T08:00:00Z', details: '{"reason":"drill"}', riskLevel: 'critical',
    })
  })

  it('an empty audit log is a real empty list, not undefined', async () => {
    mockApi.mockResolvedValueOnce([])
    const { result } = renderHook(() => useBreakGlassAudit({ page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data.data).toEqual([])
  })

  it('a failed request surfaces isError — not a silent demo fallback (DECISION-048)', async () => {
    const { ApiError } = await import('@/lib/api')
    mockApi.mockRejectedValueOnce(new ApiError(500, 'SERVER_ERROR', 'boom'))
    const { result } = renderHook(() => useBreakGlassAudit({ page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data.data).toEqual([])
  })
})
