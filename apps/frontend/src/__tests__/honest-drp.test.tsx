/**
 * @module __tests__/honest-drp
 * @description DECISION-048 honest-UI coverage for /drp: a real tenant never sees
 * demo/fabricated data — only real data, an honest empty state, or an error card
 * with Retry. Mocks '@/lib/api' in the REAL drp-service response shape (see
 * apps/drp-service/src/routes/assets.ts, alerts.ts, detection.ts) so the actual
 * hooks + adapters + page run end to end.
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
  PageStatsBar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CompactStat: ({ label, value }: { label: string; value: string }) => <span>{label}: {value}</span>,
}))
vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: { severity: string }) => <span>{severity}</span>,
}))
vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span>?</span>,
}))

import { DRPDashboardPage } from '@/pages/DRPDashboardPage'
import { useDRPAlerts, useDRPAssetStats } from '@/hooks/use-phase4-data'

function hookWrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}
function renderHook<T>(cb: () => T) {
  return rtlRenderHook(cb, { wrapper: hookWrapper })
}

const EMPTY_ASSET_STATS = { total: 0, byType: {}, enabled: 0, disabled: 0, totalAlerts: 0 }
const EMPTY_ALERT_STATS = { total: 0, byType: {}, byStatus: {}, bySeverity: {}, avgConfidence: 0, resolutionRate: 0 }
const CERTSTREAM_OFF = { enabled: false, connected: false, certificatesProcessed: 0, matchesThisHour: 0, uptime: 0 }

function apiRouter(routes: Record<string, unknown | (() => unknown)>) {
  mockApi.mockImplementation(async (path: string, opts?: { method?: string }) => {
    const method = opts?.method ?? 'GET'
    const key = method === 'GET' ? path : `${method} ${path.split('?')[0]}`
    for (const [prefix, value] of Object.entries(routes)) {
      if (key === prefix || key.startsWith(`${prefix}?`) || path === prefix || path.startsWith(`${prefix}?`)) {
        if (value instanceof Error) throw value
        return typeof value === 'function' ? (value as () => unknown)() : value
      }
    }
    return { data: [], total: 0, page: 1, limit: 50 }
  })
}

beforeEach(() => {
  mockApi.mockReset()
})

// ─── (a) honest empty state ─────────────────────────────────────

describe('DRPDashboardPage — honest empty state', () => {
  it('shows an honest empty alert feed with no demo banner, demo names, or fake scan CTA', async () => {
    apiRouter({
      '/drp/alerts': [],
      '/drp/alerts/stats': EMPTY_ALERT_STATS,
      '/drp/assets': [],
      '/drp/assets/stats': EMPTY_ASSET_STATS,
      '/drp/certstream/status': CERTSTREAM_OFF,
    })
    render(<DRPDashboardPage />)
    expect(await screen.findByText(/Your digital perimeter is clear/)).toBeTruthy()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
    expect(screen.queryByText(/Demo data/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Typosquat: intelwatch\.in/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Try demo scan/)).not.toBeInTheDocument()
  })

  it('shows an honest empty assets tab with no demo asset names', async () => {
    apiRouter({
      '/drp/alerts': [],
      '/drp/alerts/stats': EMPTY_ALERT_STATS,
      '/drp/assets': [],
      '/drp/assets/stats': EMPTY_ASSET_STATS,
      '/drp/certstream/status': CERTSTREAM_OFF,
    })
    render(<DRPDashboardPage />)
    fireEvent.click(screen.getByText('Monitored Assets'))
    expect(await screen.findByText(/No monitored assets/)).toBeTruthy()
    expect(screen.queryByText('Primary Domain')).not.toBeInTheDocument()
  })
})

// ─── (b) honest error state ─────────────────────────────────────

describe('DRPDashboardPage — honest error state', () => {
  it('shows query-error when /drp/alerts rejects, and Retry refetches', async () => {
    apiRouter({
      '/drp/alerts': new Error('backend unreachable'),
      '/drp/alerts/stats': EMPTY_ALERT_STATS,
      '/drp/assets': [],
      '/drp/assets/stats': EMPTY_ASSET_STATS,
      '/drp/certstream/status': CERTSTREAM_OFF,
    })
    render(<DRPDashboardPage />)
    expect(await screen.findByTestId('query-error')).toBeTruthy()

    const callsBefore = mockApi.mock.calls.filter(([p]) => String(p).startsWith('/drp/alerts') && !String(p).includes('stats')).length
    fireEvent.click(screen.getByTestId('query-retry'))
    await waitFor(() => {
      const callsAfter = mockApi.mock.calls.filter(([p]) => String(p).startsWith('/drp/alerts') && !String(p).includes('stats')).length
      expect(callsAfter).toBeGreaterThan(callsBefore)
    })
  })
})

// ─── (c) a DRP mutation calls the real endpoint, no fake toast ──

describe('DRPDashboardPage — Typosquat Scanner', () => {
  it('the "Try it" CTA calls the real typosquat scan endpoint, no fabricated results', async () => {
    apiRouter({
      '/drp/alerts': [],
      '/drp/alerts/stats': EMPTY_ALERT_STATS,
      '/drp/assets': [],
      '/drp/assets/stats': EMPTY_ASSET_STATS,
      '/drp/certstream/status': CERTSTREAM_OFF,
      'POST /drp/detect/typosquat': {
        scanId: 's1', domain: 'example.com', candidatesFound: 1, registeredCount: 1, alertsCreated: 0,
        topCandidates: [{ domain: 'examp1e.com', method: 'homoglyph', similarity: 0.9, editDistance: 1, riskScore: 0.8, isRegistered: true, registrationDate: null, hostingProvider: null }],
        durationMs: 10,
      },
    })
    render(<DRPDashboardPage />)
    await screen.findByText(/Your digital perimeter is clear/)

    // No preset-domain shortcut: the tenant types its own domain.
    expect(screen.queryByText(/Try it: scan/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('e.g., yourcompany.com'), { target: { value: 'example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^Scan$/ }))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/drp/detect/typosquat', expect.objectContaining({ method: 'POST' }))
    })
    // Real result rendered (method label from the mocked response), not a fabricated one.
    expect(await screen.findByText('homoglyph')).toBeTruthy()
    expect(screen.getByText('REGISTERED')).toBeTruthy()
  })
})

// ─── (d) hooks: isError + undefined data on rejection ───────────

describe('useDRPAlerts / useDRPAssetStats — honest failure', () => {
  it('useDRPAlerts sets isError and leaves data undefined on rejection', async () => {
    mockApi.mockRejectedValueOnce(new Error('DRP alerts unavailable'))
    const { result } = renderHook(() => useDRPAlerts())
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('useDRPAssetStats sets isError and leaves data undefined on rejection', async () => {
    mockApi.mockRejectedValueOnce(new Error('asset stats unavailable'))
    const { result } = renderHook(() => useDRPAssetStats())
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
