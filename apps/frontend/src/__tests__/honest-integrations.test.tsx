/**
 * @module __tests__/honest-integrations
 * @description DECISION-048 honest-UI coverage for /integrations: a real tenant never sees
 * demo/fabricated data — only real data, an honest empty state, or an error card with Retry.
 * Mocks '@/lib/api' in the REAL integration-service backend envelope shapes so the actual
 * hooks + IntegrationPage run end to end (real apiList()/api() run on top of the mock, per RCA #45).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { renderHook as rtlRenderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CompactStat: ({ label, value }: { label: string; value: string }) => <span>{label}: {value}</span>,
}))

import { IntegrationPage } from '@/pages/IntegrationPage'
import {
  useSIEMIntegrations, useWebhooks, useTicketingIntegrations,
  useSTIXCollections, useBulkExports, useIntegrationStats,
} from '@/hooks/use-phase5-data'

function hookWrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}
function renderHook<T>(cb: () => T) {
  return rtlRenderHook(cb, { wrapper: hookWrapper })
}

/** Routes checked in insertion order — list more specific paths before generic ones. */
function apiRouter(routes: Array<[string, unknown | (() => unknown)]>) {
  mockApi.mockImplementation(async (path: string, opts?: { method?: string }) => {
    const key = opts?.method ? `${opts.method} ${path.split('?')[0]}` : path
    for (const [prefix, value] of routes) {
      if (path === prefix || path.startsWith(`${prefix}?`) || key === prefix) {
        if (value instanceof Error) throw value
        return typeof value === 'function' ? (value as () => unknown)() : value
      }
    }
    return { data: [], total: 0, page: 1, limit: 50 }
  })
}

const EMPTY_ROUTES: Array<[string, unknown]> = [
  ['/integrations?type=webhook', { data: [], total: 0, page: 1, limit: 50 }],
  ['/integrations/export/schedules', { data: [], total: 0, page: 1, limit: 50 }],
  ['/integrations/stats', { totalIntegrations: 0, enabledIntegrations: 0, totalLogs: 0, failedLogs: 0, dlqSize: 0, totalTickets: 0 }],
  ['/integrations', { data: [], total: 0, page: 1, limit: 50 }],
]

beforeEach(() => { mockApi.mockReset() })

// ─── (a) empty integrations — honest empty state, no demo ─────────────────

describe('IntegrationPage — honest empty state', () => {
  it('shows an honest empty state with no demo banner or fabricated names when everything is empty', async () => {
    apiRouter(EMPTY_ROUTES)
    render(<IntegrationPage />)
    expect(await screen.findByText('No SIEM integrations yet — add one.')).toBeTruthy()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
    expect(screen.queryByText(/Demo data/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Production Splunk')).not.toBeInTheDocument()
  })
})

// ─── (b) a list endpoint rejects — query-error + Retry ─────────────────────

describe('IntegrationPage — honest error state', () => {
  it('shows query-error on SIEM list failure and refetches on Retry', async () => {
    apiRouter([
      ['/integrations?type=webhook', { data: [], total: 0, page: 1, limit: 50 }],
      ['/integrations/export/schedules', { data: [], total: 0, page: 1, limit: 50 }],
      ['/integrations/stats', { totalIntegrations: 0, enabledIntegrations: 0, totalLogs: 0, failedLogs: 0, dlqSize: 0, totalTickets: 0 }],
      ['/integrations', new Error('integration-service unreachable')],
    ])
    render(<IntegrationPage />)
    expect(await screen.findByTestId('query-error')).toBeTruthy()

    const callsBeforeRetry = mockApi.mock.calls.filter(([p]) => String(p) === '/integrations').length
    fireEvent.click(screen.getByTestId('query-retry'))
    await waitFor(() => {
      const callsAfterRetry = mockApi.mock.calls.filter(([p]) => String(p) === '/integrations').length
      expect(callsAfterRetry).toBeGreaterThan(callsBeforeRetry)
    })
  })
})

// ─── (c) every changed hook on rejection: isError true, data undefined ────

describe('use-phase5-data integration hooks — honest failure', () => {
  const cases: [string, () => { isError: boolean; data: unknown }][] = [
    ['useSIEMIntegrations', () => useSIEMIntegrations()],
    ['useWebhooks', () => useWebhooks()],
    ['useTicketingIntegrations', () => useTicketingIntegrations()],
    ['useSTIXCollections', () => useSTIXCollections()],
    ['useBulkExports', () => useBulkExports()],
    ['useIntegrationStats', () => useIntegrationStats()],
  ]

  for (const [name, hook] of cases) {
    it(`${name}: rejects → isError true, data undefined, no demo fallback`, async () => {
      mockApi.mockRejectedValue(new Error('boom'))
      const { result } = renderHook(hook)
      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.data).toBeUndefined()
    })
  }
})

// ─── (d) useTicketingIntegrations empty — CorrelationPage's Create Ticket stays disabled ──

describe('useTicketingIntegrations — empty list shape', () => {
  it('resolves to data.data.length === 0 when the tenant has no ticketing integrations', async () => {
    apiRouter([['/integrations', { data: [], total: 0, page: 1, limit: 50 }]])
    const { result } = renderHook(() => useTicketingIntegrations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(false)
    expect(result.current.data?.data.length).toBe(0)
  })
})
