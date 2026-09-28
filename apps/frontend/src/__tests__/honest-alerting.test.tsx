/**
 * @module __tests__/honest-alerting
 * @description DECISION-048 honest-UI coverage for /alerting and the Command Center
 * Alerts & Reports tab: a real tenant never sees demo/fabricated data — only real
 * data, an honest empty state, or an error card with Retry. Mocks '@/lib/api' in the
 * REAL alerting-service backend envelope shape so the actual hooks + pages run
 * end to end (real apiList()/api() run on top of the mock, per RCA #45).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { renderHook as rtlRenderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// ─── api() mock — routes by path, real alerting-service envelope shapes ───

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CompactStat: ({ label, value }: { label: string; value: string }) => <span>{label}: {value}</span>,
}))

import { AlertingPage } from '@/pages/AlertingPage'
import { AlertsReportsTab } from '@/components/command-center/AlertsReportsTab'
import { useAlertRules } from '@/hooks/use-alerting-data'

// Reporting is a sibling agent's slice — stub it shallowly so AlertsReportsTab
// renders without depending on that hook's own WIP contract.
vi.mock('@/hooks/use-reporting-data', () => ({
  useReports: () => ({ data: { data: [], total: 0, page: 1, limit: 50 }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useReportTemplates: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useReportSchedules: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useCreateReport: () => ({ mutate: vi.fn() }),
  useCreateSchedule: () => ({ mutate: vi.fn() }),
}))

function hookWrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}
function renderHook<T>(cb: () => T) {
  return rtlRenderHook(cb, { wrapper: hookWrapper })
}

function apiRouter(routes: Record<string, unknown | (() => unknown)>) {
  mockApi.mockImplementation(async (path: string, opts?: { method?: string }) => {
    const key = opts?.method ? `${opts.method} ${path.split('?')[0]}` : path
    for (const [prefix, value] of Object.entries(routes)) {
      if (path === prefix || path.startsWith(`${prefix}?`) || key === prefix) {
        if (value instanceof Error) throw value
        return typeof value === 'function' ? (value as () => unknown)() : value
      }
    }
    return { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } }
  })
}

beforeEach(() => {
  mockApi.mockReset()
})

const REAL_RULE = {
  id: 'rule-1', name: 'Critical IOC Spike', description: 'Alert when critical IOCs exceed 50',
  tenantId: 'default', severity: 'critical', condition: { type: 'threshold' }, enabled: true,
  channelIds: [], escalationPolicyId: null, cooldownMinutes: 30, tags: [],
  lastTriggeredAt: null, triggerCount: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}

const REAL_ALERT = {
  id: 'alert-1', ruleId: 'rule-1', ruleName: 'Critical IOC Spike', tenantId: 'default',
  severity: 'critical', status: 'open', title: '68 critical IOCs detected', description: 'Threshold exceeded',
  source: {}, acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null,
  suppressedUntil: null, suppressReason: null, escalationLevel: 0, escalatedAt: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}

// ─── (a) empty alerts/rules/channels — honest empty state, no demo ────────

describe('AlertingPage — honest empty state', () => {
  it('shows honest empty states with no demo banner or fabricated titles when everything is empty', async () => {
    apiRouter({
      '/alerts/rules': { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      '/alerts': { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      '/alerts/stats': { total: 0, open: 0, acknowledged: 0, resolved: 0, suppressed: 0, escalated: 0, bySeverity: {}, avgResolutionMinutes: 0 },
      '/alerts/channels': { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      '/alerts/escalations': { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      '/alerts/templates': [],
    })
    render(<AlertingPage />)
    expect(await screen.findByText(/No alert rules yet/)).toBeTruthy()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
    expect(screen.queryByText(/Demo data/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Critical IOC Spike')).not.toBeInTheDocument()
  })
})

// ─── (b) /alerts rejects — query-error + Retry ─────────────────────────────

describe('AlertingPage — honest error state', () => {
  it('shows query-error on rule list failure and refetches on Retry', async () => {
    apiRouter({
      '/alerts/rules': new Error('alerting-service unreachable'),
      '/alerts': { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      '/alerts/stats': { total: 0, open: 0, acknowledged: 0, resolved: 0, suppressed: 0, escalated: 0, bySeverity: {}, avgResolutionMinutes: 0 },
      '/alerts/channels': { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      '/alerts/escalations': { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      '/alerts/templates': [],
    })
    render(<AlertingPage />)
    expect(await screen.findByTestId('query-error')).toBeTruthy()

    const callsBeforeRetry = mockApi.mock.calls.filter(([p]) => String(p).startsWith('/alerts/rules')).length
    fireEvent.click(screen.getByTestId('query-retry'))
    await waitFor(() => {
      const callsAfterRetry = mockApi.mock.calls.filter(([p]) => String(p).startsWith('/alerts/rules')).length
      expect(callsAfterRetry).toBeGreaterThan(callsBeforeRetry)
    })
  })
})

// ─── (c) alert action calls the real endpoint, no fake "(demo)" toast ─────

describe('AlertingPage — Alerts tab actions', () => {
  it('acknowledging an alert POSTs the real endpoint', async () => {
    apiRouter({
      '/alerts/rules': { data: [REAL_RULE], meta: { total: 1, page: 1, limit: 50, totalPages: 1 } },
      '/alerts': { data: [REAL_ALERT], meta: { total: 1, page: 1, limit: 50, totalPages: 1 } },
      '/alerts/stats': { total: 1, open: 1, acknowledged: 0, resolved: 0, suppressed: 0, escalated: 0, bySeverity: {}, avgResolutionMinutes: 0 },
      '/alerts/channels': { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      '/alerts/escalations': { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      '/alerts/templates': [],
      '/alerts/alert-1/acknowledge': { data: { ...REAL_ALERT, status: 'acknowledged', acknowledgedBy: 'system' } },
    })
    render(<AlertingPage />)
    fireEvent.click(await screen.findByText('Alerts'))
    const ackButton = await screen.findByTitle('Acknowledge')
    fireEvent.click(ackButton)

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/alerts/alert-1/acknowledge', expect.objectContaining({ method: 'POST' }))
    })
    expect(screen.queryByText(/\(demo\)/i)).not.toBeInTheDocument()
  })
})

// ─── (d) hooks on rejection: isError true, data undefined ─────────────────

describe('useAlertRules — honest failure', () => {
  it('sets isError and leaves data undefined on rejection', async () => {
    mockApi.mockRejectedValueOnce(new Error('rules unavailable'))
    const { result } = renderHook(() => useAlertRules())
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})

// ─── (e) AlertsReportsTab renders without crashing — empty and error ──────

const fakeCommandCenterData = { isSuperAdmin: true } as unknown as Parameters<typeof AlertsReportsTab>[0]['data']

describe('AlertsReportsTab — renders without crashing', () => {
  it('renders when alerting queries return empty', async () => {
    apiRouter({
      '/alerts/rules': { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      '/alerts': { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
    })
    render(<AlertsReportsTab data={fakeCommandCenterData} />)
    expect(await screen.findByTestId('alert-rules-panel')).toBeTruthy()
    expect(await screen.findByText(/No alert rules configured/)).toBeTruthy()
  })

  it('renders an error card when alerting queries reject', async () => {
    apiRouter({
      '/alerts/rules': new Error('alerting-service unreachable'),
      '/alerts': new Error('alerting-service unreachable'),
    })
    render(<AlertsReportsTab data={fakeCommandCenterData} />)
    expect(await screen.findByTestId('query-error')).toBeTruthy()
  })
})
