/**
 * @module __tests__/honest-reporting
 * @description DECISION-048 honest-UI coverage for /reporting: a real tenant never
 * sees demo/fabricated data — only real data, an honest empty state, or an error
 * card with Retry. Mocks '@/lib/api' in the REAL backend response shape (already
 * unwrapped once by api()'s json.data) so the actual hooks + page run end to end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { renderHook as rtlRenderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// ─── api() mock — routes by path, real backend envelope shapes ────

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="page-stats-bar" data-title={title}>{children}</div>
  ),
  CompactStat: ({ label, value }: { label: string; value: string }) => <span data-testid={`stat-${label}`}>{label}: {value}</span>,
}))

import { ReportingPage } from '@/pages/ReportingPage'
import { useReports } from '@/hooks/use-reporting-data'

function hookWrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}
function renderHook<T>(cb: () => T) {
  return rtlRenderHook(cb, { wrapper: hookWrapper })
}

const REAL_STATS = {
  reports: { total: 0, byStatus: {}, byType: {}, avgGenerationTimeMs: 0 },
  schedules: { activeSchedules: 0 },
}

/** Routes by exact path or prefix; value can be data, an Error, or a factory fn. */
function apiRouter(routes: Record<string, unknown | (() => unknown)>) {
  mockApi.mockImplementation(async (path: string) => {
    for (const [prefix, value] of Object.entries(routes)) {
      if (path === prefix || path.startsWith(`${prefix}?`) || path.startsWith(prefix)) {
        if (value instanceof Error) throw value
        return typeof value === 'function' ? (value as () => unknown)() : value
      }
    }
    return []
  })
}

beforeEach(() => {
  mockApi.mockReset()
})

// ─── (a) Empty reports/schedules — honest empty state, no demo ────

describe('ReportingPage — honest empty state', () => {
  it('shows honest empty copy with no demo banner or fabricated report titles when backend is empty', async () => {
    apiRouter({
      '/reports/stats': REAL_STATS,
      '/reports/templates': [],
      '/reports/schedule': [],
      '/reports': [],
    })
    render(<ReportingPage />)
    expect(await screen.findByText(/No reports yet/)).toBeTruthy()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
    expect(screen.queryByText(/Demo data/i)).not.toBeInTheDocument()
    // DEMO_REPORTS fixture titles must never leak into a real, empty-backend render
    expect(screen.queryByText('Daily Threat Summary — Mar 23')).not.toBeInTheDocument()
    expect(screen.queryByText('Weekly IOC Digest — W12')).not.toBeInTheDocument()
  })
})

// ─── (b) /reports rejects — error card + Retry refetches ──────────

describe('ReportingPage — honest error state', () => {
  it('shows query-error on failure and refetches on Retry', async () => {
    apiRouter({
      '/reports/stats': REAL_STATS,
      '/reports/templates': [],
      '/reports/schedule': [],
      '/reports': new Error('backend unreachable'),
    })
    render(<ReportingPage />)
    expect(await screen.findByTestId('query-error')).toBeTruthy()

    const callsBeforeRetry = mockApi.mock.calls.filter(([p]) => String(p).startsWith('/reports') && !String(p).includes('stats') && !String(p).includes('templates') && !String(p).includes('schedule')).length
    fireEvent.click(screen.getByTestId('query-retry'))
    await waitFor(() => {
      const callsAfterRetry = mockApi.mock.calls.filter(([p]) => String(p).startsWith('/reports') && !String(p).includes('stats') && !String(p).includes('templates') && !String(p).includes('schedule')).length
      expect(callsAfterRetry).toBeGreaterThan(callsBeforeRetry)
    })
  })
})

// ─── (c) Report action calls the real endpoint, no fake toast ─────

describe('ReportingPage — real mutations', () => {
  it('clicking Clone calls the real /reports/:id/clone endpoint', async () => {
    const REPORT = {
      id: 'rpt-1', title: 'Real Daily Report', type: 'daily', format: 'html',
      status: 'completed', createdAt: new Date().toISOString(), tenantId: 't1',
    }
    apiRouter({
      '/reports/stats': REAL_STATS,
      '/reports/templates': [],
      '/reports/schedule': [],
      '/reports/rpt-1/clone': { ...REPORT, id: 'rpt-2' },
      '/reports': [REPORT],
    })
    render(<ReportingPage />)
    expect(await screen.findByText('Real Daily Report')).toBeTruthy()

    fireEvent.click(screen.getByTitle('Clone'))
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/reports/rpt-1/clone', expect.objectContaining({ method: 'POST' }))
    })
    // No fake success toast text — DECISION-048 never simulates a mutation result
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument()
  })
})

// ─── (d) Hooks on rejection — isError true, data undefined ────────

describe('useReports — rejection propagates as isError', () => {
  it('sets isError and leaves data undefined on backend failure', async () => {
    apiRouter({ '/reports': new Error('down') })
    const { result } = renderHook(() => useReports())
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
