/**
 * Tests for P2-1: Queue alert banner on AdminOpsPage.
 * Verifies the red alert banner renders when queues are in critical state,
 * hides when no alerts, and displays queue names correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'

// ─── Mocks ──────────────────────────────────────────────────────

const mockUseQueueAlerts = vi.fn()

vi.mock('@/hooks/use-phase6-data', () => ({
  useSystemHealth:         () => ({ data: null, isDemo: false }),
  useMaintenanceWindows:   () => ({ data: null }),
  useAdminTenants:         () => ({ data: null }),
  useAdminAuditLog:        () => ({ data: null }),
  useAdminStats:           () => ({ data: null }),
  useQueueHealth:          () => ({ data: { queues: [], updatedAt: new Date().toISOString() }, isDemo: false }),
  useQueueAlerts:          () => mockUseQueueAlerts(),
  useDlqStatus:            () => ({ data: null, isDemo: false }),
  useRetryDlqQueue:        () => ({ mutate: vi.fn(), isPending: false }),
  useDiscardDlqQueue:      () => ({ mutate: vi.fn(), isPending: false }),
  useRetryAllDlq:          () => ({ mutate: vi.fn(), isPending: false }),
  useActivateMaintenance:  () => ({ mutate: vi.fn(), isPending: false }),
  useDeactivateMaintenance:() => ({ mutate: vi.fn(), isPending: false }),
  useSuspendTenant:        () => ({ mutate: vi.fn(), isPending: false }),
  useReinstateTenant:      () => ({ mutate: vi.fn(), isPending: false }),
  useChangeTenantPlan:     () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="page-stats-bar" data-title={title}>{children}</div>
  ),
  CompactStat: ({ label, value }: { label: string; value: string }) => (
    <span data-testid={`stat-${label}`}>{label}: {value}</span>
  ),
}))
vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span data-testid="tooltip-help">?</span>,
}))

import { AdminOpsPage } from '@/pages/AdminOpsPage'

// ─── Test Data ──────────────────────────────────────────────────

const ALERTS_WITH_TWO = {
  data: {
    alerts: [
      {
        queueName: 'etip-feed-fetch',
        severity: 'critical' as const,
        waitingCount: 150,
        failedCount: 0,
        firedAt: '2026-03-25T12:00:00.000Z',
        threshold: { waitingMax: 100, failedMax: 0 },
      },
      {
        queueName: 'etip-normalize',
        severity: 'critical' as const,
        waitingCount: 0,
        failedCount: 5,
        firedAt: '2026-03-25T12:01:00.000Z',
        threshold: { waitingMax: 100, failedMax: 0 },
      },
    ],
  },
}

const ALERTS_EMPTY = {
  data: { alerts: [] },
}

// ─── Tests ──────────────────────────────────────────────────────

describe('AdminOpsPage — Queue Alert Banner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders alert banner when alerts array is non-empty', () => {
    mockUseQueueAlerts.mockReturnValue(ALERTS_WITH_TWO)
    render(<AdminOpsPage />)
    const banner = screen.getByTestId('queue-alert-banner')
    expect(banner).toBeDefined()
    expect(banner.textContent).toContain('2 queues in critical state')
  })

  it('displays queue names in the banner text (without etip- prefix)', () => {
    mockUseQueueAlerts.mockReturnValue(ALERTS_WITH_TWO)
    render(<AdminOpsPage />)
    const banner = screen.getByTestId('queue-alert-banner')
    expect(banner.textContent).toContain('feed-fetch')
    expect(banner.textContent).toContain('normalize')
    expect(banner.textContent).not.toContain('etip-feed-fetch')
  })

  it('hides banner when alerts array is empty', () => {
    mockUseQueueAlerts.mockReturnValue(ALERTS_EMPTY)
    render(<AdminOpsPage />)
    expect(screen.queryByTestId('queue-alert-banner')).toBeNull()
  })

  it('handles undefined/null data gracefully (no crash)', () => {
    mockUseQueueAlerts.mockReturnValue({ data: undefined })
    expect(() => render(<AdminOpsPage />)).not.toThrow()
    expect(screen.queryByTestId('queue-alert-banner')).toBeNull()
  })

  it('shows singular "queue" for single alert', () => {
    mockUseQueueAlerts.mockReturnValue({
      data: {
        alerts: [
          {
            queueName: 'etip-correlate',
            severity: 'critical',
            waitingCount: 0,
            failedCount: 3,
            firedAt: '2026-03-25T12:00:00.000Z',
            threshold: { waitingMax: 100, failedMax: 0 },
          },
        ],
      },
    })
    render(<AdminOpsPage />)
    const banner = screen.getByTestId('queue-alert-banner')
    expect(banner.textContent).toContain('1 queue in critical state')
    expect(banner.textContent).not.toContain('queues')
  })
})
