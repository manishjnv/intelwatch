/**
 * @module __tests__/use-mfa-enforcement.test
 * @description useMfaEnforcement / useUpdateMfaEnforcement hit the gateway's real
 * /auth-prefixed paths (mfaRoutes is registered under /api/v1/auth — api-gateway/src/app.ts)
 * and never fall back to demo data on error.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@/test/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

import { useMfaEnforcement, useUpdateMfaEnforcement } from '@/hooks/use-mfa'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useMfaEnforcement', () => {
  it('tenant scope GETs /auth/settings/mfa/enforcement', async () => {
    mockApi.mockResolvedValueOnce({ enforced: true })
    const { result } = renderHook(() => useMfaEnforcement('tenant'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi).toHaveBeenCalledWith('/auth/settings/mfa/enforcement')
  })

  it('platform scope GETs /auth/admin/mfa/enforcement', async () => {
    mockApi.mockResolvedValueOnce({ enforced: false })
    const { result } = renderHook(() => useMfaEnforcement('platform'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi).toHaveBeenCalledWith('/auth/admin/mfa/enforcement')
  })

  it('surfaces the error instead of falling back to demo enforcement', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useMfaEnforcement('tenant'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})

describe('useUpdateMfaEnforcement', () => {
  it('tenant scope PUTs /auth/settings/mfa/enforcement', async () => {
    mockApi.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useUpdateMfaEnforcement('tenant'), { wrapper })
    act(() => { result.current.mutate({ enforced: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi).toHaveBeenCalledWith('/auth/settings/mfa/enforcement', { method: 'PUT', body: { enforced: true } })
  })

  it('platform scope PUTs /auth/admin/mfa/enforcement', async () => {
    mockApi.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useUpdateMfaEnforcement('platform'), { wrapper })
    act(() => { result.current.mutate({ enforced: false }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi).toHaveBeenCalledWith('/auth/admin/mfa/enforcement', { method: 'PUT', body: { enforced: false } })
  })
})
