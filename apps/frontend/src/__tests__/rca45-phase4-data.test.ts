/**
 * @module __tests__/rca45-phase4-data
 * @description RCA #45 fixes in use-phase4-data.ts:
 * - useTyposquatScan was typed api<{data:{candidates,alertsCreated}}> but the real backend
 *   response has no nested `.data.candidates` — after api()'s single unwrap the real fields
 *   are topCandidates/alertsCreated/etc at the top level.
 * - useHuntTemplates was typed api<{data,total}> (total silently dropped); now uses apiList().
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

import { useTyposquatScan, useHuntTemplates } from '@/hooks/use-phase4-data'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { mockApi.mockReset() })

describe('useTyposquatScan — real backend shape (topCandidates, not nested candidates)', () => {
  it('resolves with the real field names from POST /drp/detect/typosquat', async () => {
    const realResult = {
      scanId: 'scan-1', domain: 'intelwatch.in', candidatesFound: 3, registeredCount: 1,
      alertsCreated: 1,
      topCandidates: [
        { domain: 'intelvvatch.in', method: 'homoglyph', similarity: 0.94, editDistance: 1, riskScore: 0.9, isRegistered: true, registrationDate: '2026-01-01', hostingProvider: 'Namecheap' },
      ],
      durationMs: 120,
    }
    mockApi.mockResolvedValueOnce(realResult)
    const { result } = renderHook(() => useTyposquatScan(), { wrapper })
    result.current.mutate('intelwatch.in')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(realResult)
    expect(result.current.data?.topCandidates[0]?.domain).toBe('intelvvatch.in')
  })
})

describe('useHuntTemplates — real backend shape (single-wrapped {data,total})', () => {
  it('total comes through instead of being dropped', async () => {
    mockApi.mockResolvedValueOnce({
      data: [{ id: 'tmpl-1', name: 'APT Beaconing', description: 'x', huntType: 'network', mitreTechniques: [], createdAt: '2026-01-01' }],
      total: 7,
    })
    const { result } = renderHook(() => useHuntTemplates(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.total).toBe(7)
    expect(result.current.data?.data).toHaveLength(1)
  })
})
