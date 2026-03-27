/**
 * Tests for DRP action features:
 * Part A — DRPDashboardPage bulk triage (~5 tests)
 * Part B — AlertDetailPanel takedown button (~5 tests)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Shared mock fns ────────────────────────────────────────────
const mockBulkTriage = vi.fn()
const mockTakedown = vi.fn()

const ALERTS = [
  { id: 'a1', title: 'Alert One', description: 'desc1', type: 'typosquatting', detectedValue: 'evil1.com', confidence: 90, severity: 'high', status: 'open', assignee: null, createdAt: '2024-01-01', triagedAt: null, resolvedAt: null },
  { id: 'a2', title: 'Alert Two', description: 'desc2', type: 'dark_web', detectedValue: 'evil2.com', confidence: 75, severity: 'medium', status: 'open', assignee: null, createdAt: '2024-01-01', triagedAt: null, resolvedAt: null },
  { id: 'a3', title: 'Alert Three', description: 'desc3', type: 'credential_leak', detectedValue: 'evil3.com', confidence: 85, severity: 'critical', status: 'open', assignee: null, createdAt: '2024-01-01', triagedAt: null, resolvedAt: null },
]

// ─── Hook mocks (shared across both parts) ───────────────────────
vi.mock('@/hooks/use-phase4-data', () => ({
  useDRPAlerts: () => ({ data: { data: ALERTS, total: 3, page: 1, limit: 50 }, isLoading: false, isDemo: true }),
  useDRPAlertStats: () => ({ data: { total: 3, open: 3, investigating: 0, resolved: 0, bySeverity: {}, byType: {} } }),
  useDRPAssetStats: () => ({ data: { total: 0, byType: {}, avgRiskScore: 0 } }),
  useDRPAssets: () => ({ data: { data: [], total: 0, page: 1, limit: 50 } }),
  useCertStreamStatus: () => ({ data: null }),
  useDeleteAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useScanAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkTriageAlerts: () => ({ mutate: mockBulkTriage, isPending: false }),
  useCreateAsset: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useChangeAlertStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useAssignAlert: () => ({ mutate: vi.fn(), isPending: false }),
  useAlertFeedback: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useTriageAlert: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useRequestTakedown: () => ({ mutate: mockTakedown, isPending: false }),
}))

vi.mock('@/hooks/phase4-demo-data', () => ({
  generateAlertHeatmap: () => [],
  DEMO_TYPOSQUAT_RESULTS: [],
}))

vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
  ToastContainer: () => <div data-testid="toast-container" />,
}))

vi.mock('@/components/data/DataTable', () => ({
  DataTable: ({ columns, data }: any) => (
    <div data-testid="data-table">
      {data.map((row: any) => (
        <div key={row.id} data-testid={`row-${row.id}`}>
          {columns.map((col: any) => (
            <span key={col.key}>{col.render ? col.render(row) : (row as any)[col.key]}</span>
          ))}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('@/components/data/FilterBar', () => ({ FilterBar: () => <div /> }))
vi.mock('@/components/data/Pagination', () => ({ Pagination: () => <div /> }))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: any) => <div>{children}</div>,
  CompactStat: ({ label, value }: any) => <span data-testid={`stat-${label}`}>{value}</span>,
}))

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: any) => <span data-testid="severity-badge">{severity}</span>,
}))

vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span>?</span>,
}))

vi.mock('@/components/viz/DRPWidgets', () => ({
  ExecutiveRiskGauge: () => <div />,
  RiskHeatmap: () => <div />,
  CertStreamIndicator: () => <div />,
  SLABadge: () => <span />,
  TyposquatScanner: () => <div />,
}))

import { DRPDashboardPage } from '@/pages/DRPDashboardPage'

// ═══════════════════════════════════════════════════════════════
// Part A: DRPDashboardPage bulk triage
// ═══════════════════════════════════════════════════════════════

describe('DRPDashboardPage — bulk triage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders a checkbox per alert row with correct data-testid', () => {
    render(<DRPDashboardPage />)
    expect(screen.getByTestId('check-alert-a1')).toBeTruthy()
    expect(screen.getByTestId('check-alert-a2')).toBeTruthy()
    expect(screen.getByTestId('check-alert-a3')).toBeTruthy()
  })

  it('shows bulk triage bar after selecting a checkbox', () => {
    render(<DRPDashboardPage />)
    expect(screen.queryByTestId('bulk-triage-bar')).toBeNull()
    fireEvent.click(screen.getByTestId('check-alert-a1'))
    expect(screen.getByTestId('bulk-triage-bar')).toBeTruthy()
  })

  it('"Dismiss as FP" calls bulkTriageMutation.mutate with false_positive verdict', () => {
    render(<DRPDashboardPage />)
    fireEvent.click(screen.getByTestId('check-alert-a1'))
    fireEvent.click(screen.getByTestId('check-alert-a2'))
    fireEvent.click(screen.getByText('Dismiss as FP'))
    expect(mockBulkTriage).toHaveBeenCalledWith(
      expect.objectContaining({ ids: expect.arrayContaining(['a1', 'a2']), verdict: 'false_positive' }),
      expect.any(Object),
    )
  })

  it('"Escalate" calls bulkTriageMutation.mutate with true_positive verdict', () => {
    render(<DRPDashboardPage />)
    fireEvent.click(screen.getByTestId('check-alert-a3'))
    fireEvent.click(screen.getByText('Escalate'))
    expect(mockBulkTriage).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ['a3'], verdict: 'true_positive' }),
      expect.any(Object),
    )
  })

  it('"Clear" hides the bulk triage bar', () => {
    render(<DRPDashboardPage />)
    fireEvent.click(screen.getByTestId('check-alert-a1'))
    expect(screen.getByTestId('bulk-triage-bar')).toBeTruthy()
    fireEvent.click(screen.getByText('Clear'))
    expect(screen.queryByTestId('bulk-triage-bar')).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// Part B: AlertDetailPanel takedown button
// Renders the real AlertDetailPanel; hooks mocked above supply mockTakedown.
// ═══════════════════════════════════════════════════════════════

const TYPOSQUAT_ALERT = {
  id: 'a1', title: 'Suspicious Domain', description: 'desc',
  type: 'typosquatting', detectedValue: 'example-phish.com',
  confidence: 85, severity: 'high', status: 'open',
  assignee: null, createdAt: '2024-01-01', triagedAt: null, resolvedAt: null,
}

const DARK_WEB_ALERT = { ...TYPOSQUAT_ALERT, id: 'a2', type: 'dark_web', detectedValue: 'darkweb-paste' }

import { AlertDetailPanel } from '@/components/viz/DRPModals'

describe('AlertDetailPanel — takedown button', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('takedown button is visible for typosquatting alert', () => {
    render(<AlertDetailPanel alert={TYPOSQUAT_ALERT as any} onClose={vi.fn()} isDemo={false} />)
    expect(screen.getByTestId('takedown-btn')).toBeTruthy()
  })

  it('clicking takedown button opens the takedown form', () => {
    render(<AlertDetailPanel alert={TYPOSQUAT_ALERT as any} onClose={vi.fn()} isDemo={false} />)
    expect(screen.queryByTestId('takedown-form')).toBeNull()
    fireEvent.click(screen.getByTestId('takedown-btn'))
    expect(screen.getByTestId('takedown-form')).toBeTruthy()
  })

  it('submit button is disabled when provider field is empty', () => {
    render(<AlertDetailPanel alert={TYPOSQUAT_ALERT as any} onClose={vi.fn()} isDemo={false} />)
    fireEvent.click(screen.getByTestId('takedown-btn'))
    const submitBtn = screen.getByTestId('takedown-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })

  it('filling provider and clicking submit calls takedownMutation.mutate', () => {
    render(<AlertDetailPanel alert={TYPOSQUAT_ALERT as any} onClose={vi.fn()} isDemo={false} />)
    fireEvent.click(screen.getByTestId('takedown-btn'))
    fireEvent.change(screen.getByPlaceholderText('Registrar / hosting provider'), { target: { value: 'GoDaddy' } })
    const submitBtn = screen.getByTestId('takedown-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(false)
    fireEvent.click(submitBtn)
    expect(mockTakedown).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1', provider: 'GoDaddy' }),
      expect.any(Object),
    )
  })

  it('takedown button is NOT visible for non-domain alert type', () => {
    render(<AlertDetailPanel alert={DARK_WEB_ALERT as any} onClose={vi.fn()} isDemo={false} />)
    expect(screen.queryByTestId('takedown-btn')).toBeNull()
  })
})
