/**
 * @module __tests__/honest-hunting-correlation-analytics
 * @description DECISION-048 honest-UI coverage for /hunting, /correlation, /analytics:
 * a real tenant never sees demo/fabricated data — only real data, an honest empty
 * state, or an error card with Retry. Mocks '@/lib/api' in the REAL backend response
 * shape (unwrapped once by api()/apiList()) so the actual hooks + pages run end to end.
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

vi.mock('@/hooks/use-phase5-data', () => ({
  useTicketingIntegrations: () => ({ data: { data: [], total: 0, page: 1, limit: 50 } }),
}))

vi.mock('@/components/CorrelationDetailDrawer', () => ({
  CorrelationDetailDrawer: () => null,
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CompactStat: ({ label, value }: { label: string; value: string }) => <span>{label}: {value}</span>,
}))
vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: { severity: string }) => <span>{severity}</span>,
}))
vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span>?</span>,
}))

vi.mock('@/components/viz/HuntingModals', () => ({
  CreateHuntModal: () => null,
  HuntStatusControls: () => null,
  AddHypothesisForm: () => null,
  AddEvidenceForm: () => null,
}))

import { CorrelationPage } from '@/pages/CorrelationPage'
import { HuntingWorkbenchPage } from '@/pages/HuntingWorkbenchPage'
import { useExecutiveSummary, useServiceHealth } from '@/hooks/use-analytics-data'

function hookWrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}
function renderHook<T>(cb: () => T) {
  return rtlRenderHook(cb, { wrapper: hookWrapper })
}

const CORRELATION = {
  id: 'corr-1', correlationType: 'infrastructure',
  title: 'Shared C2 Infrastructure', description: '3 IOCs share hosting',
  severity: 'critical', confidence: 91, entityIds: ['n1'],
  entityLabels: ['APT28'], suppressed: false, createdAt: new Date().toISOString(),
  diamondModel: null, killChainPhase: null,
}

function apiRouter(routes: Record<string, unknown | (() => unknown)>) {
  mockApi.mockImplementation(async (path: string) => {
    for (const [prefix, value] of Object.entries(routes)) {
      if (path === prefix || path.startsWith(`${prefix}?`)) {
        if (value instanceof Error) throw value
        return typeof value === 'function' ? (value as () => unknown)() : value
      }
    }
    // Unmatched paths (e.g. active-hunts lookup on CorrelationPage) — honest empty list.
    return { data: [], total: 0, page: 1, limit: 50 }
  })
}

beforeEach(() => {
  mockApi.mockReset()
})

// ─── 1 & 3: CorrelationPage — empty state, no demo, client search ─

describe('CorrelationPage — honest empty state', () => {
  it('shows "No correlations found" with no demo banner or fabricated titles when /correlations is empty', async () => {
    apiRouter({
      '/correlations': [],
      '/correlations/stats': { total: 0, byType: {}, bySeverity: {}, suppressedCount: 0, avgConfidence: 0 },
      '/correlations/campaigns': [],
    })
    render(<CorrelationPage />)
    expect(await screen.findByText(/No correlations found/)).toBeTruthy()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
    expect(screen.queryByText(/Demo data/)).not.toBeInTheDocument()
    expect(screen.queryByText('Shared C2 Infrastructure')).not.toBeInTheDocument()
  })
})

describe('CorrelationPage — honest error state', () => {
  it('shows query-error on failure and refetches on Retry', async () => {
    apiRouter({
      '/correlations': new Error('backend unreachable'),
      '/correlations/stats': { total: 0, byType: {}, bySeverity: {}, suppressedCount: 0, avgConfidence: 0 },
      '/correlations/campaigns': [],
    })
    render(<CorrelationPage />)
    expect(await screen.findByTestId('query-error')).toBeTruthy()

    const callsBeforeRetry = mockApi.mock.calls.filter(([p]) => String(p).startsWith('/correlations') && !String(p).includes('stats') && !String(p).includes('campaigns')).length
    fireEvent.click(screen.getByTestId('query-retry'))
    await waitFor(() => {
      const callsAfterRetry = mockApi.mock.calls.filter(([p]) => String(p).startsWith('/correlations') && !String(p).includes('stats') && !String(p).includes('campaigns')).length
      expect(callsAfterRetry).toBeGreaterThan(callsBeforeRetry)
    })
  })
})

describe('CorrelationPage — client-side search filters real rows', () => {
  it('filters loaded rows by search text', async () => {
    apiRouter({
      '/correlations': [CORRELATION],
      '/correlations/stats': { total: 1, byType: {}, bySeverity: {}, suppressedCount: 0, avgConfidence: 91 },
      '/correlations/campaigns': [],
    })
    render(<CorrelationPage />)
    expect(await screen.findByText('Shared C2 Infrastructure')).toBeTruthy()

    const searchInput = screen.getByPlaceholderText('Search correlations…')
    fireEvent.change(searchInput, { target: { value: 'nonexistent-xyz' } })
    expect(screen.queryByText('Shared C2 Infrastructure')).not.toBeInTheDocument()

    fireEvent.change(searchInput, { target: { value: 'APT28' } })
    expect(screen.getByText('Shared C2 Infrastructure')).toBeTruthy()
  })
})

// ─── 4: Auto-Correlate — real mutation, no fake toast ──────────────

describe('CorrelationPage — Auto-Correlate', () => {
  it('POSTs /correlations/run and shows no fabricated "3 new correlations" toast', async () => {
    apiRouter({
      '/correlations': [],
      '/correlations/stats': { total: 0, byType: {}, bySeverity: {}, suppressedCount: 0, avgConfidence: 0 },
      '/correlations/campaigns': [],
      '/correlations/run': { correlationsFound: 2, campaignsDetected: 0, wavesDetected: 0, suppressed: 0 },
    })
    render(<CorrelationPage />)
    await screen.findByText(/No correlations found/)

    fireEvent.click(screen.getByText('Auto-Correlate'))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/correlations/run', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => {
      // Exactly once: the real-count result banner, no duplicate success toast.
      expect(screen.getAllByText(/Correlation complete: 2 correlations, 0 campaigns/)).toHaveLength(1)
    })
    expect(screen.queryByText(/3 new correlations/)).not.toBeInTheDocument()
  })
})

// ─── 5: HuntingWorkbenchPage — honest empty + error states ─────────

describe('HuntingWorkbenchPage — honest empty state', () => {
  it('shows empty state with no demo banner or fabricated hunt names when /hunts is empty', async () => {
    apiRouter({
      '/hunts/stats': { total: 0, active: 0, completed: 0, totalFindings: 0, avgScore: 0, byType: {} },
      '/hunts/templates': [],
      '/hunts': [],
    })
    render(<HuntingWorkbenchPage />)
    expect(await screen.findByText(/No hunts yet/)).toBeTruthy()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
    expect(screen.queryByText(/Demo data/)).not.toBeInTheDocument()
    expect(screen.queryByText('APT28 Hunt')).not.toBeInTheDocument()
  })

  it('shows query-error when /hunts rejects', async () => {
    apiRouter({
      '/hunts/stats': { total: 0, active: 0, completed: 0, totalFindings: 0, avgScore: 0, byType: {} },
      '/hunts/templates': [],
      '/hunts': new Error('backend unreachable'),
    })
    render(<HuntingWorkbenchPage />)
    expect(await screen.findByTestId('query-error')).toBeTruthy()
  })
})

// ─── 6: Analytics hooks — isError on rejection, no demo data ───────

describe('useExecutiveSummary / useServiceHealth — honest failure', () => {
  it('useExecutiveSummary sets isError and leaves data undefined on rejection', async () => {
    mockApi.mockRejectedValueOnce(new Error('executive summary unavailable'))
    const { result } = renderHook(() => useExecutiveSummary())
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('useServiceHealth sets isError and leaves data undefined on rejection', async () => {
    mockApi.mockRejectedValueOnce(new Error('service health unavailable'))
    const { result } = renderHook(() => useServiceHealth())
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
