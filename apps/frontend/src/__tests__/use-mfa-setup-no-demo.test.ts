/**
 * Roadmap STEP_00B U12: MFA setup must not fall back to a demo secret/QR on error.
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
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

import { useMfaSetup } from '@/hooks/use-mfa'

// security-demo-data.ts was removed (S161a honest UI) — inline the shape it used to export.
const DEMO_MFA_SETUP = {
  secret: 'JBSWY3DPEHPK3PXP',
  qrCodeUri: 'otpauth://totp/ETIP:demo@test.com?secret=JBSWY3DPEHPK3PXP&issuer=ETIP',
  backupCodes: ['a1b2-c3d4', 'e5f6-g7h8'],
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useMfaSetup', () => {
  it('surfaces the API error instead of returning demo MFA data', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useMfaSetup(), { wrapper })
    act(() => { result.current.mutate() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    expect(result.current.data).not.toEqual(DEMO_MFA_SETUP)
  })

  it('returns the real setup data on success', async () => {
    const real = { secret: 'REALSECRET', qrCodeUri: 'otpauth://totp/x', backupCodes: ['a'] }
    mockApi.mockResolvedValueOnce(real)
    const { result } = renderHook(() => useMfaSetup(), { wrapper })
    act(() => { result.current.mutate() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(real)
  })
})
