/**
 * @module __tests__/rca45-global-monitoring
 * @description RCA #45 double-unwrap fix for use-global-monitoring.ts, updated for
 * DECISION-048 (S173): hooks are plain useQuery — no demo fallback, isError on
 * rejection. api() already unwraps the { data: ... } envelope — these hooks used to
 * re-read `.data` off the already-unwrapped payload (`.then(r => r?.data)`), which is
 * always undefined, so they silently always showed demo data. Verifies real backend
 * shapes now come through, and that failures surface as isError, not fabricated data.
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

import { useGlobalIocStats, useCorroborationLeaders, useSubscriptionStats } from '@/hooks/use-global-monitoring'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { mockApi.mockReset() })

describe('useGlobalIocStats — real backend shape (api() single-unwrap)', () => {
  it('resolves the real stats object, no demo fallback', async () => {
    // api() mock returns what api() itself would return after unwrapping { data: stats }
    const realStats = {
      totalGlobalIOCs: 9999, created24h: 12, enriched24h: 8, unenriched: 4,
      warninglistFiltered: 1, avgConfidence: 77, highConfidenceCount: 500,
      byType: { ip: 100 }, byConfidenceTier: { High: 500 },
    }
    mockApi.mockResolvedValueOnce(realStats)
    const { result } = renderHook(() => useGlobalIocStats(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(false)
    expect(result.current.data).toEqual(realStats)
  })

  it('a shape mismatch (e.g. the live OverlayStats endpoint) surfaces as isError, never fabricated numbers', async () => {
    // Real /normalization/global-iocs/stats route (tenant-overlay-service's getOverlayStats)
    // returns OverlayStats, not GlobalIocStats — no byType field.
    mockApi.mockResolvedValueOnce({ totalGlobalIocs: 12171, overlayCount: 3, customSeverityCount: 1, customConfidenceCount: 1, customTagsCount: 0 })
    const { result } = renderHook(() => useGlobalIocStats(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})

describe('useCorroborationLeaders — real backend shape (TenantIocView[], no total/page)', () => {
  it('maps TenantIocView[] to CorroborationLeader[], real values come through', async () => {
    const backendRows = [
      {
        id: 'g1', value: '1.2.3.4', normalizedValue: '1.2.3.4', iocType: 'ip',
        severity: 'high', confidence: 91, lifecycle: 'active', tags: [], notes: null,
        firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-02T00:00:00.000Z',
        crossFeedCorroboration: 6, stixConfidenceTier: 'High',
        enrichmentQuality: 0.9, warninglistMatch: null,
      },
    ]
    mockApi.mockResolvedValueOnce(backendRows)
    const { result } = renderHook(() => useCorroborationLeaders(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(false)
    expect(result.current.data).toEqual([
      { id: 'g1', value: '1.2.3.4', iocType: 'ip', confidence: 91, stixConfidenceTier: 'High', crossFeedCorroboration: 6, sightingSources: [], firstSeen: '2026-01-01T00:00:00.000Z' },
    ])
  })

  it('empty array is valid data, not an error and not demo fallback', async () => {
    mockApi.mockResolvedValueOnce([])
    const { result } = renderHook(() => useCorroborationLeaders(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(false)
    expect(result.current.data).toEqual([])
  })
})

describe('useSubscriptionStats — BLOCKED backend route, honest error not demo', () => {
  it('a rejected request (no /ingestion/catalog/subscription-stats route) surfaces isError', async () => {
    mockApi.mockRejectedValueOnce(new Error('Not Found'))
    const { result } = renderHook(() => useSubscriptionStats(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})
